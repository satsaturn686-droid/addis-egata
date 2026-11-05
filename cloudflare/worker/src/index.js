
const API = "https://api.telegram.org";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function adminIds(env) {
  return new Set(
    (env.ADMIN_TELEGRAM_IDS || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  );
}

function isAdmin(env, telegramId) {
  return adminIds(env).has(String(telegramId));
}

async function telegram(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || "Telegram API request failed");
  }

  return result.result;
}

async function sendMessage(env, chatId, text, replyMarkup) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

async function answerCallback(env, callbackId, text = "") {
  return telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  });
}

async function getUser(db, telegramId) {
  return db.prepare(
    "SELECT * FROM users WHERE telegram_id = ?"
  ).bind(String(telegramId)).first();
}

async function registerUser(db, env, from) {
  const timestamp = now();
  const userId = id();
  const admin = isAdmin(env, from.id) ? 1 : 0;

  await db.prepare(`
    INSERT INTO users (
      id, telegram_id, username, first_name,
      last_name, is_admin, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      is_admin = MAX(users.is_admin, excluded.is_admin),
      updated_at = excluded.updated_at
  `).bind(
    userId,
    String(from.id),
    from.username || null,
    from.first_name || null,
    from.last_name || null,
    admin,
    timestamp,
    timestamp
  ).run();

  const user = await getUser(db, from.id);

  await db.prepare(`
    INSERT OR IGNORE INTO wallets (
      id, user_id, balance_cents, created_at, updated_at
    ) VALUES (?, ?, 0, ?, ?)
  `).bind(id(), user.id, timestamp, timestamp).run();

  return user;
}

async function setState(db, userId, state, data = {}) {
  await db.prepare(`
    INSERT INTO user_states (user_id, state, data_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      state = excluded.state,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `).bind(userId, state, JSON.stringify(data), now()).run();
}

async function getState(db, userId) {
  const row = await db.prepare(
    "SELECT state, data_json FROM user_states WHERE user_id = ?"
  ).bind(userId).first();

  if (!row) return null;

  let data = {};
  try {
    data = JSON.parse(row.data_json || "{}");
  } catch {
    data = {};
  }

  return { state: row.state, data };
}

async function clearState(db, userId) {
  await db.prepare(
    "DELETE FROM user_states WHERE user_id = ?"
  ).bind(userId).run();
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "🎟️ ዕጣዎች" }, { text: "💰 Wallet" }],
      [{ text: "📜 የእኔ ቁጥሮች" }, { text: "🏆 ውጤቶች" }],
      [{ text: "ℹ️ እገዛ" }]
    ],
    resize_keyboard: true
  };
}

async function showHome(env, chatId, firstName) {
  await sendMessage(
    env,
    chatId,
    `ሰላም ${escapeHtml(firstName || "ደንበኛ")}! 👋\n\nወደ <b>ADDIS ዕጣ</b> በደህና መጡ።\n\nከታች ካሉት አማራጮች ይምረጡ።`,
    mainKeyboard()
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function showDraws(env, db, chatId) {
  const result = await db.prepare(`
    SELECT id, name, prize_type, prize_name,
           total_numbers, entry_fee_cents, winner_count
    FROM draws
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  const draws = result.results || [];

  if (!draws.length) {
    await sendMessage(env, chatId, "አሁን ክፍት የሆነ ዕጣ የለም።");
    return;
  }

  const buttons = draws.map(draw => [{
    text: `🎟️ ${draw.name} — ${draw.entry_fee_cents / 100} ብር`,
    callback_data: `d|${draw.id}`
  }]);

  await sendMessage(
    env,
    chatId,
    "🎟️ <b>ክፍት የሆኑ ዕጣዎች</b>\n\nለመመልከት ዕጣውን ይምረጡ።",
    { inline_keyboard: buttons }
  );
}

async function showDraw(env, db, chatId, drawId) {
  const draw = await db.prepare(`
    SELECT * FROM draws WHERE id = ? AND status = 'open'
  `).bind(drawId).first();

  if (!draw) {
    await sendMessage(env, chatId, "ይህ ዕጣ አሁን ክፍት አይደለም።");
    return;
  }

  const occupied = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM entries
    WHERE draw_id = ?
      AND (
        status IN ('pending_payment', 'paid')
        OR (status = 'reserved' AND reserved_until > ?)
      )
  `).bind(draw.id, now()).first();

  const sold = Number(occupied?.total || 0);
  const remaining = Math.max(0, draw.total_numbers - sold);

  await sendMessage(
    env,
    chatId,
    `🎟️ <b>${escapeHtml(draw.name)}</b>\n\n` +
    `🏆 ሽልማት፦ ${escapeHtml(draw.prize_name)}\n` +
    `💵 የአንድ ቁጥር ዋጋ፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
    `🔢 ጠቅላላ ቁጥሮች፦ ${draw.total_numbers}\n` +
    `✅ የቀሩ ቁጥሮች፦ ${remaining}\n` +
    `🏆 አሸናፊዎች፦ ${draw.winner_count}\n\n` +
    `${escapeHtml(draw.description || "")}`,
    {
      inline_keyboard: [[
        {
          text: "🔢 ቁጥር ምረጥ",
          callback_data: `n|${draw.id}|0`
        }
      ]]
    }
  );
}

async function showNumbers(env, db, chatId, drawId, page) {
  const draw = await db.prepare(`
    SELECT id, name, total_numbers, status
    FROM draws WHERE id = ?
  `).bind(drawId).first();

  if (!draw || draw.status !== "open") {
    await sendMessage(env, chatId, "ይህ ዕጣ አሁን ክፍት አይደለም።");
    return;
  }

  const pageSize = 40;
  const start = page * pageSize + 1;
  const end = Math.min(draw.total_numbers, start + pageSize - 1);

  if (start > draw.total_numbers) {
    await sendMessage(env, chatId, "የቁጥር ገጹ አልተገኘም።");
    return;
  }

  const rows = await db.prepare(`
    SELECT number
    FROM entries
    WHERE draw_id = ?
      AND (
        status IN ('pending_payment', 'paid')
        OR (status = 'reserved' AND reserved_until > ?)
      )
  `).bind(drawId, now()).all();

  const occupied = new Set(
    (rows.results || []).map(row => Number(row.number))
  );

  const keyboard = [];
  let row = [];

  for (let number = start; number <= end; number++) {
    if (occupied.has(number)) {
      row.push({ text: `❌ ${number}`, callback_data: "x" });
    } else {
      row.push({
        text: String(number),
        callback_data: `r|${drawId}|${number}`
      });
    }

    if (row.length === 5) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length) keyboard.push(row);

  const navigation = [];
  if (page > 0) {
    navigation.push({
      text: "⬅️ ቀዳሚ",
      callback_data: `n|${drawId}|${page - 1}`
    });
  }
  if (end < draw.total_numbers) {
    navigation.push({
      text: "ቀጣይ ➡️",
      callback_data: `n|${drawId}|${page + 1}`
    });
  }
  if (navigation.length) keyboard.push(navigation);

  await sendMessage(
    env,
    chatId,
    `🔢 <b>${escapeHtml(draw.name)}</b>\n` +
    `ቁጥር ይምረጡ። ❌ የተያዙ ቁጥሮች አይመረጡም።\n` +
    `ገጽ ${page + 1}`,
    { inline_keyboard: keyboard }
  );
}

async function reserveNumber(env, db, chatId, user, drawId, number) {
  const draw = await db.prepare(`
    SELECT * FROM draws WHERE id = ? AND status = 'open'
  `).bind(drawId).first();

  if (!draw || number < 1 || number > draw.total_numbers) {
    await sendMessage(env, chatId, "የመረጡት ዕጣ ወይም ቁጥር ትክክል አይደለም።");
    return;
  }

  const timestamp = now();
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Release only expired temporary reservations.
  await db.prepare(`
    UPDATE entries
    SET status = 'expired', updated_at = ?
    WHERE draw_id = ?
      AND number = ?
      AND status = 'reserved'
      AND reserved_until <= ?
  `).bind(timestamp, drawId, number, timestamp).run();

  const existing = await db.prepare(`
    SELECT id, status, user_id, reserved_until
    FROM entries
    WHERE draw_id = ? AND number = ?
      AND status IN ('reserved', 'pending_payment', 'paid')
    LIMIT 1
  `).bind(drawId, number).first();

  if (existing) {
    await sendMessage(env, chatId, "ይቅርታ፣ ይህ ቁጥር ቀድሞ ተይዟል። ሌላ ቁጥር ይምረጡ።");
    return;
  }

  const entryId = id();

  try {
    await db.prepare(`
      INSERT INTO entries (
        id, draw_id, user_id, number, status,
        reserved_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)
    `).bind(
      entryId, drawId, user.id, number,
      expiry, timestamp, timestamp
    ).run();
  } catch {
    await sendMessage(env, chatId, "ይህ ቁጥር በሌላ ተጠቃሚ ተይዟል። ሌላ ይምረጡ።");
    return;
  }

  await setState(db, user.id, "awaiting_reference", {
    entryId,
    drawId,
    number
  });

  const settings = await db.prepare(
    "SELECT telebirr_number FROM payment_settings WHERE id = 1"
  ).first();

  const telebirrNumber =
    env.TELEBIRR_NUMBER ||
    settings?.telebirr_number ||
    "";

  await sendMessage(
    env,
    chatId,
    `✅ <b>ቁጥር ${number} ለ30 ደቂቃ ተይዟል።</b>\n\n` +
    `💵 የሚከፍሉት፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
    `📱 Telebirr፦ <code>${escapeHtml(telebirrNumber || "Admin ገና አላስገባም")}</code>\n\n` +
    `ክፍያውን ካደረጉ በኋላ የTelebirr Transaction Reference ይላኩ።\n\n` +
    `⚠️ ክፍያው Admin እስኪያረጋግጥ ቁጥሩ በጊዜያዊ ሁኔታ ይቆያል።`
  );
}

async function submitReference(env, db, chatId, user, reference) {
  const state = await getState(db, user.id);

  if (!state || state.state !== "awaiting_reference") {
    return false;
  }

  const clean = reference.trim();

  if (clean.length < 5 || clean.length > 100) {
    await sendMessage(env, chatId, "የTransaction Reference ትክክለኛ አይመስልም። እንደገና ይላኩ።");
    return true;
  }

  await setState(db, user.id, "awaiting_receipt", {
    ...state.data,
    transactionReference: clean
  });

  await sendMessage(
    env,
    chatId,
    "📷 አሁን የTelebirr ክፍያ Screenshot ይላኩ።\n\n" +
    "የክፍያ ማስረጃ ፎቶ ከተላከ በኋላ Admin ያረጋግጠዋል።"
  );

  return true;
}

async function submitReceipt(env, db, chatId, user, photoFileId) {
  const state = await getState(db, user.id);

  if (!state || state.state !== "awaiting_receipt") {
    return false;
  }

  const { entryId, transactionReference } = state.data;
  const timestamp = now();

  const entry = await db.prepare(`
    SELECT e.*, d.entry_fee_cents, d.name AS draw_name
    FROM entries e
    JOIN draws d ON d.id = e.draw_id
    WHERE e.id = ? AND e.user_id = ?
      AND e.status = 'reserved'
      AND e.reserved_until > ?
  `).bind(entryId, user.id, timestamp).first();

  if (!entry) {
    await clearState(db, user.id);
    await sendMessage(env, chatId, "የቁጥር መያዣዎ ጊዜ አልፏል። እባክዎ እንደገና ቁጥር ይምረጡ።");
    return true;
  }

  const paymentId = id();

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO payments (
          id, entry_id, user_id, amount_cents,
          transaction_reference, receipt_file_id,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        paymentId, entryId, user.id, entry.entry_fee_cents,
        transactionReference, photoFileId, timestamp, timestamp
      ),
      db.prepare(`
        UPDATE entries
        SET status = 'pending_payment', updated_at = ?
        WHERE id = ? AND status = 'reserved'
      `).bind(timestamp, entryId)
    ]);
  } catch {
    await sendMessage(
      env,
      chatId,
      "ይህ የክፍያ ማስረጃ ቀድሞ ተመዝግቧል ወይም የቁጥር መያዣው ተቀይሯል። Admin ያነጋግሩ።"
    );
    return true;
  }

  await clearState(db, user.id);

  await sendMessage(
    env,
    chatId,
    "📨 የክፍያ ማስረጃዎ ተቀብሏል።\n\n" +
    "Admin እስኪያረጋግጥ ድረስ ይጠብቁ። ማረጋገጫ ከደረሰዎት በኋላ ቁጥርዎ ይረጋገጣል።"
  );

  for (const adminId of adminIds(env)) {
    await sendMessage(
      env,
      adminId,
      `🔔 <b>አዲስ የክፍያ ማስረጃ</b>\n\n` +
      `👤 User ID: <code>${escapeHtml(user.telegram_id)}</code>\n` +
      `🎟️ Draw: ${escapeHtml(entry.draw_name)}\n` +
      `🔢 Number: ${entry.number}\n` +
      `💵 Amount: ${(entry.entry_fee_cents / 100).toFixed(2)} ETB\n` +
      `🧾 Reference: <code>${escapeHtml(transactionReference)}</code>`,
      {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `a|${paymentId}` },
          { text: "❌ Reject", callback_data: `j|${paymentId}` }
        ]]
      }
    );
  }

  return true;
}

async function reviewPayment(env, db, admin, paymentId, approve) {
  if (!isAdmin(env, admin.id)) return;

  const payment = await db.prepare(`
    SELECT p.*, e.id AS entry_id, e.status AS entry_status,
           e.draw_id, e.number, u.telegram_id
    FROM payments p
    JOIN entries e ON e.id = p.entry_id
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(paymentId).first();

  if (!payment || payment.status !== "pending") {
    return;
  }

  const timestamp = now();

  if (approve) {
    await db.batch([
      db.prepare(`
        UPDATE payments
        SET status = 'approved', verified_by = ?, verified_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
          AND EXISTS (
            SELECT 1 FROM entries
            WHERE entries.id = payments.entry_id
              AND entries.status = 'pending_payment'
          )
      `).bind(
        (await getUser(db, admin.id)).id,
        timestamp,
        timestamp,
        paymentId
      ),
      db.prepare(`
        UPDATE entries
        SET status = 'paid', paid_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending_payment'
          AND EXISTS (
            SELECT 1 FROM payments
            WHERE payments.entry_id = entries.id
              AND payments.status = 'approved'
          )
      `).bind(timestamp, timestamp, payment.entry_id)
    ]);

    await sendMessage(
      env,
      payment.telegram_id,
      `🎉 <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
      `የዕጣ ቁጥርዎ፦ ${payment.number}\n` +
      `የክፍያ ማረጋገጫዎ ተሳክቷል። መልካም ዕድል!`
    );
  } else {
    await db.batch([
      db.prepare(`
        UPDATE payments
        SET status = 'rejected', verified_by = ?, verified_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).bind(
        (await getUser(db, admin.id)).id,
        timestamp,
        timestamp,
        paymentId
      ),
      db.prepare(`
        UPDATE entries
        SET status = 'rejected', updated_at = ?
        WHERE id = ? AND status = 'pending_payment'
      `).bind(timestamp, payment.entry_id)
    ]);

    await sendMessage(
      env,
      payment.telegram_id,
      `❌ የክፍያ ማስረጃዎ አልተረጋገጠም።\n\n` +
      `የዕጣ ቁጥር፦ ${payment.number}\n` +
      `እባክዎ Admin ያነጋግሩ።`
    );
  }

  await db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id,
      details_json, created_at
    ) VALUES (?, ?, ?, 'payment', ?, ?, ?)
  `).bind(
    id(),
    (await getUser(db, admin.id)).id,
    approve ? "payment_approved" : "payment_rejected",
    paymentId,
    JSON.stringify({ entryId: payment.entry_id }),
    timestamp
  ).run();
}

async function showWallet(env, db, chatId, user) {
  const wallet = await db.prepare(`
    SELECT balance_cents FROM wallets WHERE user_id = ?
  `).bind(user.id).first();

  await sendMessage(
    env,
    chatId,
    `💰 <b>የእኔ Wallet</b>\n\n` +
    `ቀሪ ሂሳብ፦ <b>${((wallet?.balance_cents || 0) / 100).toFixed(2)} ብር</b>\n\n` +
    `የWallet ገቢ፣ ወጪ እና የገንዘብ ማውጣት አማራጮች በቀጣይ የሥራ ደረጃ ይጨመራሉ።`
  );
}

async function showMyEntries(env, db, chatId, user) {
  const result = await db.prepare(`
    SELECT e.number, e.status, d.name AS draw_name
    FROM entries e
    JOIN draws d ON d.id = e.draw_id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
    LIMIT 20
  `).bind(user.id).all();

  const entries = result.results || [];

  if (!entries.length) {
    await sendMessage(env, chatId, "እስካሁን የያዙት ቁጥር የለም።");
    return;
  }

  const statusText = {
    reserved: "ጊዜያዊ ተይዟል",
    pending_payment: "ክፍያ በማረጋገጥ ላይ",
    paid: "ክፍያ ተረጋግጧል",
    rejected: "ውድቅ ተደርጓል",
    expired: "ጊዜው አልፏል"
  };

  const lines = entries.map(entry =>
    `• ${escapeHtml(entry.draw_name)} — #${entry.number}: ${statusText[entry.status] || entry.status}`
  );

  await sendMessage(
    env,
    chatId,
    `📜 <b>የእኔ ቁጥሮች</b>\n\n${lines.join("\n")}`
  );
}

async function handleCallback(env, db, callback) {
  const data = String(callback.data || "");
  const chatId = callback.message?.chat?.id;
  const from = callback.from;

  if (data === "x") {
    await answerCallback(env, callback.id, "ይህ ቁጥር ተይዟል።");
    return;
  }

  const user = await registerUser(db, env, from);
  const parts = data.split("|");
  const action = parts[0];

  if (action === "d") {
    await answerCallback(env, callback.id);
    await showDraw(env, db, chatId, parts[1]);
    return;
  }

  if (action === "n") {
    await answerCallback(env, callback.id);
    const page = Math.max(0, Number(parts[2]) || 0);
    await showNumbers(env, db, chatId, parts[1], page);
    return;
  }

  if (action === "r") {
    await answerCallback(env, callback.id);
    const number = Number(parts[2]);
    await reserveNumber(env, db, chatId, user, parts[1], number);
    return;
  }

  if (action === "a" || action === "j") {
    if (!isAdmin(env, from.id)) {
      await answerCallback(env, callback.id, "ይህን ለማድረግ ፈቃድ የለዎትም።");
      return;
    }

    await answerCallback(env, callback.id, "ጥያቄው ተቀብሏል።");
    await reviewPayment(env, db, from, parts[1], action === "a");
    return;
  }

  await answerCallback(env, callback.id);
}

async function handleMessage(env, db, message) {
  const from = message.from;
  const chatId = message.chat.id;
  const text = String(message.text || "").trim();

  if (!from || from.is_bot) return;

  const user = await registerUser(db, env, from);

  if (text === "/start" || text.startsWith("/start ")) {
    await clearState(db, user.id);
    await showHome(env, chatId, from.first_name);
    return;
  }

  if (text === "/help" || text === "ℹ️ እገዛ") {
    await sendMessage(
      env,
      chatId,
      "ℹ️ <b>ADDIS ዕጣ እገዛ</b>\n\n" +
      "🎟️ ዕጣዎች — ክፍት ዕጣዎችን ለማየት\n" +
      "💰 Wallet — የWallet ሂሳብዎን ለማየት\n" +
      "📜 የእኔ ቁጥሮች — የያዙትን ቁጥሮች ለማየት\n\n" +
      "ክፍያ ከፈጸሙ በኋላ ማስረጃውን በBot ውስጥ ይላኩ።"
    );
    return;
  }

  if (text === "/draws" || text === "🎟️ ዕጣዎች") {
    await showDraws(env, db, chatId);
    return;
  }

  if (text === "/wallet" || text === "💰 Wallet") {
    await showWallet(env, db, chatId, user);
    return;
  }

  if (text === "📜 የእኔ ቁጥሮች") {
    await showMyEntries(env, db, chatId, user);
    return;
  }

  if (text === "🏆 ውጤቶች") {
    await sendMessage(env, chatId, "🏆 የዕጣ ውጤቶች ክፍል በቀጣይ የሥራ ደረጃ ይጨመራል።");
    return;
  }

  const state = await getState(db, user.id);

  if (state?.state === "awaiting_reference" && text) {
    await submitReference(env, db, chatId, user, text);
    return;
  }

  if (state?.state === "awaiting_receipt" && message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    await submitReceipt(env, db, chatId, user, photo.file_id);
    return;
  }

  if (message.photo?.length && state?.state === "awaiting_receipt") {
    const photo = message.photo[message.photo.length - 1];
    await submitReceipt(env, db, chatId, user, photo.file_id);
    return;
  }

  if (text === "/admin" && isAdmin(env, from.id)) {
    const pending = await db.prepare(`
      SELECT COUNT(*) AS total FROM payments WHERE status = 'pending'
    `).first();

    await sendMessage(
      env,
      chatId,
      `🛡️ <b>Admin Panel</b>\n\n` +
      `⏳ Pending Payments: ${pending?.total || 0}\n\n` +
      `የክፍያ ማረጋገጫ ጥያቄዎች በዚህ ቻት ይደርሳሉ።`
    );
    return;
  }

  await sendMessage(
    env,
    chatId,
    "እባክዎ ከታች ካሉት አማራጮች ይምረጡ።",
    mainKeyboard()
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "addis-egata-bot-api",
        database_binding: Boolean(env.DB)
      });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");

    if (
      !env.TELEGRAM_WEBHOOK_SECRET ||
      secret !== env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!env.DB) {
      return json({ ok: false, error: "D1 binding DB is missing" }, 500);
    }

    let update;

    try {
      update = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    try {
      if (update.callback_query) {
        await handleCallback(env, env.DB, update.callback_query);
      } else if (update.message) {
        await handleMessage(env, env.DB, update.message);
      }

      return json({ ok: true });
    } catch (error) {
      console.error("Telegram update failed:", error?.stack || error);
      return json({ ok: false, error: "Update processing failed" }, 500);
    }
  }
};
