const TELEGRAM_API = "https://api.telegram.org";

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function admins(env) {
  return new Set(
    String(env.ADMIN_TELEGRAM_IDS || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  );
}

function isAdmin(env, telegramId) {
  return admins(env).has(String(telegramId));
}

async function tg(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || "Telegram API error");
  }

  return result.result;
}

async function send(env, chatId, text, keyboard) {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : {})
  });
}

async function callbackAnswer(env, callbackId, text = "") {
  return tg(env, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  });
}

async function userByTelegram(db, telegramId) {
  return db.prepare(
    "SELECT * FROM users WHERE telegram_id = ?"
  ).bind(String(telegramId)).first();
}

async function register(db, env, from) {
  const timestamp = now();
  const userId = newId();

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
    isAdmin(env, from.id) ? 1 : 0,
    timestamp,
    timestamp
  ).run();

  const user = await userByTelegram(db, from.id);

  await db.prepare(`
    INSERT OR IGNORE INTO wallets (
      id, user_id, balance_cents, created_at, updated_at
    ) VALUES (?, ?, 0, ?, ?)
  `).bind(newId(), user.id, timestamp, timestamp).run();

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
  const row = await db.prepare(`
    SELECT state, data_json
    FROM user_states
    WHERE user_id = ?
  `).bind(userId).first();

  if (!row) return null;

  try {
    return {
      state: row.state,
      data: JSON.parse(row.data_json || "{}")
    };
  } catch {
    return null;
  }
}

async function clearState(db, userId) {
  await db.prepare(
    "DELETE FROM user_states WHERE user_id = ?"
  ).bind(userId).run();
}

function homeKeyboard() {
  return {
    keyboard: [
      [{ text: "🎟️ ዕጣዎች" }, { text: "💰 Wallet" }],
      [{ text: "📜 የእኔ ቁጥሮች" }, { text: "🏆 ውጤቶች" }],
      [{ text: "ℹ️ እገዛ" }]
    ],
    resize_keyboard: true
  };
}

async function home(env, chatId, firstName) {
  await send(
    env,
    chatId,
    `ሰላም ${escapeHtml(firstName || "ደንበኛ")}! 👋\n\n` +
    `<b>ADDIS ዕጣ</b> እንኳን ደህና መጡ።\n\n` +
    "ከታች ያሉትን አማራጮች ይጠቀሙ።",
    homeKeyboard()
  );
}

// -----------------------------
// DRAW LIST
// -----------------------------

async function showDraws(env, db, chatId) {
  const result = await db.prepare(`
    SELECT id, name, prize_name, entry_fee_cents
    FROM draws
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  const draws = result.results || [];

  if (!draws.length) {
    await send(env, chatId, "አሁን ክፍት የሆነ ዕጣ የለም።");
    return;
  }

  const keyboard = draws.map(draw => [{
    text: `${draw.name} — ${(draw.entry_fee_cents / 100).toFixed(2)} ብር`,
    callback_data: `draw:${draw.id}`
  }]);

  await send(
    env,
    chatId,
    "🎟️ <b>ክፍት የሆኑ ዕጣዎች</b>\n\nዕጣ ይምረጡ።",
    { inline_keyboard: keyboard }
  );
}

async function showDraw(env, db, chatId, drawId) {
  const draw = await db.prepare(`
    SELECT *
    FROM draws
    WHERE id = ? AND status = 'open'
  `).bind(drawId).first();

  if (!draw) {
    await send(env, chatId, "ይህ ዕጣ አሁን ክፍት አይደለም።");
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
  `).bind(drawId, now()).first();

  const remaining = Math.max(
    0,
    Number(draw.total_numbers) - Number(occupied?.total || 0)
  );

  await send(
    env,
    chatId,
    `🎟️ <b>${escapeHtml(draw.name)}</b>\n\n` +
    `🏆 ሽልማት፦ ${escapeHtml(draw.prize_name)}\n` +
    `💵 የቁጥር ዋጋ፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
    `🔢 ጠቅላላ ቁጥሮች፦ ${draw.total_numbers}\n` +
    `✅ የቀሩ ቁጥሮች፦ ${remaining}\n` +
    `🏆 አሸናፊዎች፦ ${draw.winner_count}\n\n` +
    `${escapeHtml(draw.description || "")}`,
    {
      inline_keyboard: [[{
        text: "🔢 ቁጥር ምረጥ",
        callback_data: `numbers:${draw.id}:0`
      }]]
    }
  );
}

// -----------------------------
// NUMBER SELECTION
// -----------------------------

async function showNumbers(env, db, chatId, drawId, page) {
  const draw = await db.prepare(`
    SELECT id, name, total_numbers, status
    FROM draws WHERE id = ?
  `).bind(drawId).first();

  if (!draw || draw.status !== "open") {
    await send(env, chatId, "ይህ ዕጣ ክፍት አይደለም።");
    return;
  }

  const pageSize = 40;
  const start = page * pageSize + 1;
  const end = Math.min(draw.total_numbers, start + pageSize - 1);

  if (start > draw.total_numbers) {
    await send(env, chatId, "ይህ የቁጥር ገጽ የለም።");
    return;
  }

  const result = await db.prepare(`
    SELECT number
    FROM entries
    WHERE draw_id = ?
      AND (
        status IN ('pending_payment', 'paid')
        OR (status = 'reserved' AND reserved_until > ?)
      )
  `).bind(drawId, now()).all();

  const occupied = new Set(
    (result.results || []).map(row => Number(row.number))
  );

  const keyboard = [];
  let row = [];

  for (let number = start; number <= end; number++) {
    row.push(
      occupied.has(number)
        ? { text: `❌ ${number}`, callback_data: "occupied" }
        : { text: String(number), callback_data: `reserve:${drawId}:${number}` }
    );

    if (row.length === 5) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length) keyboard.push(row);

  const nav = [];

  if (page > 0) {
    nav.push({
      text: "⬅️ ቀዳሚ",
      callback_data: `numbers:${drawId}:${page - 1}`
    });
  }

  if (end < draw.total_numbers) {
    nav.push({
      text: "ቀጣይ ➡️",
      callback_data: `numbers:${drawId}:${page + 1}`
    });
  }

  if (nav.length) keyboard.push(nav);

  await send(
    env,
    chatId,
    `🔢 <b>${escapeHtml(draw.name)}</b>\nቁጥር ይምረጡ።\nገጽ ${page + 1}`,
    { inline_keyboard: keyboard }
  );
}

async function reserveNumber(env, db, chatId, user, drawId, number) {
  if (!Number.isInteger(number) || number < 1) {
    await send(env, chatId, "የቁጥር ምርጫው ትክክል አይደለም።");
    return;
  }

  const draw = await db.prepare(`
    SELECT *
    FROM draws
    WHERE id = ? AND status = 'open'
  `).bind(drawId).first();

  if (!draw || number > draw.total_numbers) {
    await send(env, chatId, "ዕጣው ወይም ቁጥሩ አልተገኘም።");
    return;
  }

  const timestamp = now();
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await db.prepare(`
    UPDATE entries
    SET status = 'expired', updated_at = ?
    WHERE draw_id = ?
      AND number = ?
      AND status = 'reserved'
      AND reserved_until <= ?
  `).bind(timestamp, drawId, number, timestamp).run();

  const entryId = newId();

  try {
    await db.prepare(`
      INSERT INTO entries (
        id, draw_id, user_id, number,
        status, reserved_until, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)
    `).bind(
      entryId,
      drawId,
      user.id,
      number,
      expiry,
      timestamp,
      timestamp
    ).run();
  } catch {
    await send(env, chatId, "ይቅርታ፣ ይህ ቁጥር ተይዟል። ሌላ ይምረጡ።");
    return;
  }

  await setState(db, user.id, "entry_reference", {
    entryId,
    drawId,
    number
  });

  const settings = await db.prepare(`
    SELECT telebirr_number
    FROM payment_settings
    WHERE id = 1
  `).first();

  const telebirr = env.TELEBIRR_NUMBER ||
    settings?.telebirr_number ||
    "Admin ገና አላስገባም";

  await send(
    env,
    chatId,
    `✅ <b>ቁጥር ${number} ተይዟል።</b>\n\n` +
    `💵 ክፍያ፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
    `📱 Telebirr፦ <code>${escapeHtml(telebirr)}</code>\n\n` +
    "ክፍያውን ከፈጸሙ በኋላ Transaction Reference ይላኩ።\n\n" +
    "⚠️ ቁጥሩ ለ30 ደቂቃ ብቻ ይያዛል።"
  );
}

// -----------------------------
// PAYMENT PROOF
// -----------------------------

async function submitReference(env, db, chatId, user, reference) {
  const state = await getState(db, user.id);

  if (!state || state.state !== "entry_reference") return false;

  const clean = reference.trim();

  if (clean.length < 5 || clean.length > 100) {
    await send(env, chatId, "Transaction Reference ትክክል አይደለም።");
    return true;
  }

  await setState(db, user.id, "entry_receipt", {
    ...state.data,
    reference: clean
  });

  await send(env, chatId, "📷 እባክዎ የTelebirr ክፍያ Screenshot ይላኩ።");
  return true;
}

async function submitReceipt(env, db, chatId, user, fileId) {
  const state = await getState(db, user.id);

  if (!state || state.state !== "entry_receipt") return false;

  const { entryId, reference } = state.data;
  const timestamp = now();

  const entry = await db.prepare(`
    SELECT e.*, d.entry_fee_cents, d.name AS draw_name
    FROM entries e
    JOIN draws d ON d.id = e.draw_id
    WHERE e.id = ?
      AND e.user_id = ?
      AND e.status = 'reserved'
      AND e.reserved_until > ?
  `).bind(entryId, user.id, timestamp).first();

  if (!entry) {
    await clearState(db, user.id);
    await send(env, chatId, "የቁጥር መያዣዎ ጊዜ አልፏል። እንደገና ይምረጡ።");
    return true;
  }

  const paymentId = newId();

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO payments (
          id, entry_id, user_id, amount_cents,
          transaction_reference, receipt_file_id,
          status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        paymentId,
        entryId,
        user.id,
        entry.entry_fee_cents,
        reference,
        fileId,
        timestamp,
        timestamp
      ),

      db.prepare(`
        UPDATE entries
        SET status = 'pending_payment', updated_at = ?
        WHERE id = ? AND status = 'reserved'
      `).bind(timestamp, entryId)
    ]);
  } catch {
    await send(
      env,
      chatId,
      "ይህ Reference ቀድሞ ተጠቅሟል ወይም የክፍያ ማስረጃው አልተመዘገበም። Admin ያነጋግሩ።"
    );
    return true;
  }

  await clearState(db, user.id);

  await send(env, chatId, "📨 ማስረጃዎ ደርሷል። Admin እስኪያረጋግጥ ይጠብቁ።");

  for (const adminId of admins(env)) {
    try {
      await send(
        env,
        adminId,
        `🔔 <b>አዲስ ክፍያ</b>\n\n` +
        `User: <code>${escapeHtml(user.telegram_id)}</code>\n` +
        `ዕጣ: ${escapeHtml(entry.draw_name)}\n` +
        `ቁጥር: ${entry.number}\n` +
        `መጠን: ${(entry.entry_fee_cents / 100).toFixed(2)} ETB\n` +
        `Reference: <code>${escapeHtml(reference)}</code>`,
        {
          inline_keyboard: [[
            { text: "✅ Approve", callback_data: `approve:${paymentId}` },
            { text: "❌ Reject", callback_data: `reject:${paymentId}` }
          ]]
        }
      );
    } catch (error) {
      console.error("Admin notification failed:", error);
    }
  }

  return true;
}

// -----------------------------
// ADMIN PAYMENT REVIEW
// -----------------------------

async function reviewPayment(env, db, admin, paymentId, approve) {
  if (!isAdmin(env, admin.id)) return;

  const adminUser = await userByTelegram(db, admin.id);
  if (!adminUser) return;

  const payment = await db.prepare(`
    SELECT p.*, e.number, e.id AS entry_id,
           u.telegram_id
    FROM payments p
    JOIN entries e ON e.id = p.entry_id
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(paymentId).first();

  if (!payment || payment.status !== "pending") return;

  const timestamp = now();

  if (approve) {
    await db.batch([
      db.prepare(`
        UPDATE payments
        SET status = 'approved',
            verified_by = ?,
            verified_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'pending'
          AND EXISTS (
            SELECT 1 FROM entries
            WHERE entries.id = payments.entry_id
              AND entries.status = 'pending_payment'
          )
      `).bind(adminUser.id, timestamp, timestamp, paymentId),

      db.prepare(`
        UPDATE entries
        SET status = 'paid',
            paid_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'pending_payment'
          AND EXISTS (
            SELECT 1 FROM payments
            WHERE payments.entry_id = entries.id
              AND payments.status = 'approved'
          )
      `).bind(timestamp, timestamp, payment.entry_id)
    ]);

    const confirmed = await db.prepare(`
      SELECT status FROM payments WHERE id = ?
    `).bind(paymentId).first();

    if (confirmed?.status === "approved") {
      await send(
        env,
        payment.telegram_id,
        `🎉 <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
        `የዕጣ ቁጥርዎ፦ ${payment.number}\n` +
        "መልካም ዕድል!"
      );
    }
  } else {
    await db.batch([
      db.prepare(`
        UPDATE payments
        SET status = 'rejected',
            verified_by = ?,
            verified_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).bind(adminUser.id, timestamp, timestamp, paymentId),

      db.prepare(`
        UPDATE entries
        SET status = 'rejected', updated_at = ?
        WHERE id = ? AND status = 'pending_payment'
      `).bind(timestamp, payment.entry_id)
    ]);

    await send(
      env,
      payment.telegram_id,
      `❌ የክፍያ ማስረጃዎ ውድቅ ተደርጓል።\n\n` +
      `ቁጥር፦ ${payment.number}\nAdmin ያነጋግሩ።`
    );
  }

  await db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type,
      entity_id, details_json, created_at
    )
    VALUES (?, ?, ?, 'payment', ?, ?, ?)
  `).bind(
    newId(),
    adminUser.id,
    approve ? "payment_approved" : "payment_rejected",
    paymentId,
    JSON.stringify({ entryId: payment.entry_id }),
    timestamp
  ).run();
}

// -----------------------------
// WALLET
// -----------------------------

async function showWallet(env, db, chatId, user) {
  const wallet = await db.prepare(`
    SELECT balance_cents
    FROM wallets WHERE user_id = ?
  `).bind(user.id).first();

  const balance = Number(wallet?.balance_cents || 0) / 100;

  const history = await db.prepare(`
    SELECT type, amount_cents, description, created_at
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(user.id).all();

  const lines = (history.results || []).map(item =>
    `• ${escapeHtml(item.type)}: ${(item.amount_cents / 100).toFixed(2)} ብር`
  );

  await send(
    env,
    chatId,
    `💰 <b>የእኔ Wallet</b>\n\n` +
    `ቀሪ ሂሳብ፦ <b>${balance.toFixed(2)} ብር</b>\n\n` +
    `<b>የቅርብ ጊዜ እንቅስቃሴ</b>\n` +
    (lines.length ? lines.join("\n") : "ገና የWallet እንቅስቃሴ የለም።") +
    "\n\nየገንዘብ ገቢና ማውጣት ሂደት በሙከራ ደረጃ ላይ ነው።"
  );
}

// -----------------------------
// USER ENTRIES AND RESULTS
// -----------------------------

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
    await send(env, chatId, "እስካሁን የያዙት ቁጥር የለም።");
    return;
  }

  const labels = {
    reserved: "ጊዜያዊ ተይዟል",
    pending_payment: "ክፍያ በማረጋገጥ ላይ",
    paid: "ክፍያ ተረጋግጧል",
    rejected: "ውድቅ ተደርጓል",
    expired: "ጊዜው አልፏል"
  };

  const lines = entries.map(entry =>
    `• ${escapeHtml(entry.draw_name)} — #${entry.number}: ` +
    `${labels[entry.status] || entry.status}`
  );

  await send(
    env,
    chatId,
    `📜 <b>የእኔ ቁጥሮች</b>\n\n${lines.join("\n")}`
  );
}

async function showResults(env, db, chatId) {
  const result = await db.prepare(`
    SELECT d.name, w.rank, w.prize_amount_cents,
           w.user_id, e.number, u.first_name
    FROM winners w
    JOIN draws d ON d.id = w.draw_id
    JOIN entries e ON e.id = w.entry_id
    JOIN users u ON u.id = w.user_id
    JOIN draw_results r ON r.draw_id = w.draw_id
    WHERE r.published_at IS NOT NULL
    ORDER BY r.published_at DESC, w.rank ASC
    LIMIT 30
  `).all();

  const winners = result.results || [];

  if (!winners.length) {
    await send(env, chatId, "ገና የታተመ የዕጣ ውጤት የለም።");
    return;
  }

  const lines = winners.map(w =>
    `🏆 ${escapeHtml(w.name)}\n` +
    `ደረጃ ${w.rank} — ${escapeHtml(w.first_name || "ተሳታፊ")}\n` +
    `ቁጥር #${w.number} — ${(w.prize_amount_cents / 100).toFixed(2)} ብር`
  );

  await send(env, chatId, `🏆 <b>የዕጣ ውጤቶች</b>\n\n${lines.join("\n\n")}`);
}

// -----------------------------
// ADMIN COMMANDS
// -----------------------------

async function adminPanel(env, db, chatId) {
  const payments = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments WHERE status = 'pending'
  `).first();

  const deposits = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_deposits WHERE status = 'pending'
  `).first();

  const withdrawals = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM withdrawals WHERE status = 'pending'
  `).first();

  await send(
    env,
    chatId,
    `🛡️ <b>ADDIS ዕጣ Admin</b>\n\n` +
    `⏳ የክፍያ ማረጋገጫ፦ ${payments?.total || 0}\n` +
    `💰 የWallet Deposit፦ ${deposits?.total || 0}\n` +
    `📤 የWithdrawal ጥያቄ፦ ${withdrawals?.total || 0}\n\n` +
    `<b>የሚገኙ ትዕዛዞች</b>\n` +
    `/set_telebirr 09XXXXXXXX\n` +
    `/pending\n` +
    `/draw_create NAME|TYPE|PRIZE|TOTAL|FEE_ETB|WINNERS\n` +
    `/prize_set DRAW_ID RANK AMOUNT_ETB\n` +
    `/draw_open DRAW_ID\n` +
    `/draw_close DRAW_ID\n` +
    `/draw_run DRAW_ID\n` +
    `/draw_publish DRAW_ID`
  );
}

async function setTelebirr(env, db, admin, chatId, number) {
  if (!isAdmin(env, admin.id)) return;

  const clean = String(number || "").trim();

  if (!/^[0-9+]{9,16}$/.test(clean)) {
    await send(env, chatId, "ትክክለኛ Telebirr ቁጥር ያስገቡ።");
    return;
  }

  const user = await userByTelegram(db, admin.id);

  await db.prepare(`
    UPDATE payment_settings
    SET telebirr_number = ?, updated_by = ?, updated_at = ?
    WHERE id = 1
  `).bind(clean, user.id, now()).run();

  await send(env, chatId, "✅ Telebirr ቁጥር ተቀይሯል።");
}

async function createDraw(env, db, admin, chatId, raw) {
  if (!isAdmin(env, admin.id)) return;

  const parts = raw.split("|").map(x => x.trim());

  if (parts.length !== 6) {
    await send(
      env,
      chatId,
      "አጠቃቀም፦\n/draw_create NAME|TYPE|PRIZE|TOTAL|FEE_ETB|WINNERS\n\nTYPE: cash ወይም physical"
    );
    return;
  }

  const [name, type, prize, totalText, feeText, winnersText] = parts;

  const total = Number(totalText);
  const fee = Number(feeText);
  const winnerCount = Number(winnersText);

  if (
    !name ||
    !prize ||
    !["cash", "physical"].includes(type) ||
    !Number.isInteger(total) ||
    total < 1 ||
    total > 100000 ||
    !Number.isFinite(fee) ||
    fee <= 0 ||
    !Number.isInteger(winnerCount) ||
    winnerCount < 1 ||
    winnerCount > total
  ) {
    await send(env, chatId, "የDraw መረጃው ትክክል አይደለም።");
    return;
  }

  const adminUser = await userByTelegram(db, admin.id);
  const timestamp = now();
  const drawId = newId();

  await db.prepare(`
    INSERT INTO draws (
      id, name, prize_type, prize_name,
      total_numbers, entry_fee_cents,
      winner_count, unique_winners,
      status, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?, ?)
  `).bind(
    drawId,
    name,
    type,
    prize,
    total,
    Math.round(fee * 100),
    winnerCount,
    adminUser.id,
    timestamp,
    timestamp
  ).run();

  await send(
    env,
    chatId,
    `✅ Draw ተፈጥሯል።\n\n` +
    `ID: <code>${drawId}</code>\n` +
    `ስም: ${escapeHtml(name)}\n` +
    `የቁጥር ብዛት: ${total}\n\n` +
    `ከመክፈት በፊት የሽልማት ደረጃዎችን /prize_set በመጠቀም ያስገቡ።`
  );
}

async function setPrize(env, db, admin, chatId, args) {
  if (!isAdmin(env, admin.id)) return;

  const [drawId, rankText, amountText] = args.trim().split(/\s+/);
  const rank = Number(rankText);
  const amount = Number(amountText);

  if (
    !drawId ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    await send(env, chatId, "አጠቃቀም፦ /prize_set DRAW_ID RANK AMOUNT_ETB");
    return;
  }

  const draw = await db.prepare(`
    SELECT id, winner_count, status
    FROM draws WHERE id = ?
  `).bind(drawId).first();

  if (!draw || draw.status !== "draft" || rank > draw.winner_count) {
    await send(env, chatId, "Draw ID ወይም የPrize ደረጃው ትክክል አይደለም።");
    return;
  }

  await db.prepare(`
    INSERT INTO draw_prizes (id, draw_id, rank, amount_cents, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(draw_id, rank) DO UPDATE SET
      amount_cents = excluded.amount_cents
  `).bind(
    newId(),
    drawId,
    rank,
    Math.round(amount * 100),
    now()
  ).run();

  await send(env, chatId, "✅ የሽልማት ደረጃው ተመዝግቧል።");
}

async function openDraw(env, db, admin, chatId, drawId) {
  if (!isAdmin(env, admin.id)) return;

  const draw = await db.prepare(`
    SELECT * FROM draws WHERE id = ?
  `).bind(drawId).first();

  if (!draw || draw.status !== "draft") {
    await send(env, chatId, "ይህ Draw ሊከፈት አይችልም።");
    return;
  }

  const prizes = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM draw_prizes WHERE draw_id = ?
  `).bind(drawId).first();

  if (Number(prizes?.total || 0) !== Number(draw.winner_count)) {
    await send(
      env,
      chatId,
      `ዕጣውን ለመክፈት ${draw.winner_count} የሽልማት ደረጃዎች ማስገባት አለብዎት።`
    );
    return;
  }

  await db.prepare(`
    UPDATE draws
    SET status = 'open', updated_at = ?
    WHERE id = ? AND status = 'draft'
  `).bind(now(), drawId).run();

  await send(env, chatId, "✅ Draw ተከፍቷል።");
}

async function closeDraw(env, db, admin, chatId, drawId) {
  if (!isAdmin(env, admin.id)) return;

  const result = await db.prepare(`
    UPDATE draws
    SET status = 'closed', updated_at = ?
    WHERE id = ? AND status IN ('open', 'full')
  `).bind(now(), drawId).run();

  if (!result.meta?.changes) {
    await send(env, chatId, "Draw መዝጋት አልተቻለም።");
    return;
  }

  await send(env, chatId, "🔒 Draw ተዘግቷል።");
}

async function runDraw(env, db, admin, chatId, drawId) {
  if (!isAdmin(env, admin.id)) return;

  const draw = await db.prepare(`
    SELECT * FROM draws WHERE id = ?
  `).bind(drawId).first();

  if (!draw || !["closed", "full"].includes(draw.status)) {
    await send(env, chatId, "Draw መጀመሪያ መዘጋት አለበት።");
    return;
  }

  const existing = await db.prepare(`
    SELECT id FROM draw_results WHERE draw_id = ?
  `).bind(drawId).first();

  if (existing) {
    await send(env, chatId, "ይህ Draw ውጤት ቀድሞ ተፈጥሯል።");
    return;
  }

  const entries = await db.prepare(`
    SELECT e.id, e.user_id, e.number
    FROM entries e
    WHERE e.draw_id = ? AND e.status = 'paid'
    ORDER BY e.id
  `).bind(drawId).all();

  const eligible = entries.results || [];

  if (eligible.length < draw.winner_count) {
    await send(env, chatId, "በቂ የተከፈሉ ተሳታፊዎች የሉም።");
    return;
  }

  const prizes = await db.prepare(`
    SELECT rank, amount_cents
    FROM draw_prizes
    WHERE draw_id = ?
    ORDER BY rank
  `).bind(drawId).all();

  if ((prizes.results || []).length !== draw.winner_count) {
    await send(env, chatId, "የሽልማት ደረጃዎች አልተሟሉም።");
    return;
  }

  // Fisher-Yates shuffle using cryptographically secure random bytes.
  const pool = [...eligible];

  for (let i = pool.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const timestamp = now();
  const resultId = newId();
  const adminUser = await userByTelegram(db, admin.id);
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);

  const seedHex = Array.from(seed)
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

  const seedHash = await crypto.subtle.digest("SHA-256", seed);
  const hashHex = Array.from(new Uint8Array(seedHash))
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

  const statements = [
    db.prepare(`
      INSERT INTO draw_results (
        id, draw_id, eligible_entry_count,
        eligible_entry_snapshot, random_seed_hash,
        executed_at, executed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      resultId,
      drawId,
      eligible.length,
      JSON.stringify(eligible),
      hashHex,
      timestamp,
      adminUser.id
    )
  ];

  for (let i = 0; i < draw.winner_count; i++) {
    const entry = pool[i];
    const prize = prizes.results[i];

    statements.push(
      db.prepare(`
        INSERT INTO winners (
          id, draw_id, entry_id, user_id,
          rank, prize_amount_cents, selected_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newId(),
        drawId,
        entry.id,
        entry.user_id,
        prize.rank,
        prize.amount_cents,
        timestamp
      )
    );

    statements.push(
      db.prepare(`
        INSERT INTO winner_payouts (
          id, winner_id, user_id, prize_type,
          status, created_at, updated_at
        )
        VALUES (
          ?, (SELECT id FROM winners WHERE draw_id = ? AND rank = ?),
          ?, ?, 'pending', ?, ?
        )
      `).bind(
        newId(),
        drawId,
        prize.rank,
        entry.user_id,
        draw.prize_type,
        timestamp,
        timestamp
      )
    );
  }

  statements.push(
    db.prepare(`
      UPDATE draws
      SET status = 'completed', updated_at = ?
      WHERE id = ? AND status IN ('closed', 'full')
    `).bind(timestamp, drawId)
  );

  try {
    await db.batch(statements);
  } catch (error) {
    console.error("Draw execution failed:", error);
    await send(env, chatId, "የዕጣ ውጤት ማውጣት አልተሳካም። ዳግም ከመሞከር በፊት Admin ያረጋግጥ።");
    return;
  }

  // Keep the random seed private until the result is independently reviewed.
  console.log("Draw seed (private audit record):", drawId, seedHex);

  await send(
    env,
    chatId,
    `✅ የዕጣ ውጤት ተፈጥሯል።\n\n` +
    `Draw: ${escapeHtml(draw.name)}\n` +
    `የተሳታፊ ብዛት: ${eligible.length}\n` +
    `የSeed Hash: <code>${hashHex}</code>\n\n` +
    `ውጤቱ ለተጠቃሚዎች ከመታየቱ በፊት /draw_publish ${drawId} ይጠቀሙ።`
  );
}

async function publishDraw(env, db, admin, chatId, drawId) {
  if (!isAdmin(env, admin.id)) return;

  const result = await db.prepare(`
    UPDATE draw_results
    SET published_at = ?
    WHERE draw_id = ? AND published_at IS NULL
  `).bind(now(), drawId).run();

  if (!result.meta?.changes) {
    await send(env, chatId, "ውጤቱ አልተገኘም ወይም ቀድሞ ታትሟል።");
    return;
  }

  await send(env, chatId, "🏆 የዕጣ ውጤቱ ለተጠቃሚዎች ታትሟል።");
}

// -----------------------------
// TELEGRAM CALLBACKS
// -----------------------------

async function handleCallback(env, db, query) {
  const data = String(query.data || "");
  const chatId = query.message?.chat?.id;
  const from = query.from;

  if (data === "occupied") {
    await callbackAnswer(env, query.id, "ይህ ቁጥር ተይዟል።");
    return;
  }

  const user = await register(db, env, from);
  const parts = data.split(":");
  const action = parts[0];

  await callbackAnswer(env, query.id);

  if (action === "draw") {
    await showDraw(env, db, chatId, parts[1]);
  } else if (action === "numbers") {
    const page = Math.max(0, Number(parts[2]) || 0);
    await showNumbers(env, db, chatId, parts[1], page);
  } else if (action === "reserve") {
    await reserveNumber(
      env,
      db,
      chatId,
      user,
      parts[1],
      Number(parts[2])
    );
  } else if (action === "approve" || action === "reject") {
    if (!isAdmin(env, from.id)) {
      await callbackAnswer(env, query.id, "ፈቃድ የለዎትም።");
      return;
    }

    await reviewPayment(
      env,
      db,
      from,
      parts[1],
      action === "approve"
    );
  }
}

// -----------------------------
// TELEGRAM MESSAGES
// -----------------------------

async function handleMessage(env, db, message) {
  const from = message.from;
  if (!from || from.is_bot) return;

  const chatId = message.chat.id;
  const text = String(message.text || "").trim();
  const user = await register(db, env, from);

  if (text === "/start" || text.startsWith("/start ")) {
    await clearState(db, user.id);
    await home(env, chatId, from.first_name);
    return;
  }

  if (text === "/help" || text === "ℹ️ እገዛ") {
    await send(
      env,
      chatId,
      "ℹ️ <b>ADDIS ዕጣ እገዛ</b>\n\n" +
      "🎟️ ዕጣዎች — ክፍት ዕጣዎችን ለማየት\n" +
      "💰 Wallet — ቀሪ ሂሳብን ለማየት\n" +
      "📜 የእኔ ቁጥሮች — የገዙትን ቁጥሮች ለማየት\n" +
      "🏆 ውጤቶች — የታተሙ ውጤቶችን ለማየት"
    );
    return;
  }

  if (text === "🎟️ ዕጣዎች" || text === "/draws") {
    await showDraws(env, db, chatId);
    return;
  }

  if (text === "💰 Wallet" || text === "/wallet") {
    await showWallet(env, db, chatId, user);
    return;
  }

  if (text === "📜 የእኔ ቁጥሮች") {
    await showMyEntries(env, db, chatId, user);
    return;
  }

  if (text === "🏆 ውጤቶች") {
    await showResults(env, db, chatId);
    return;
  }

  if (text === "/admin" && isAdmin(env, from.id)) {
    await adminPanel(env, db, chatId);
    return;
  }

  if (text.startsWith("/set_telebirr ")) {
    await setTelebirr(env, db, from, chatId, text.slice(14));
    return;
  }

  if (text.startsWith("/draw_create ")) {
    await createDraw(env, db, from, chatId, text.slice(13));
    return;
  }

  if (text.startsWith("/prize_set ")) {
    await setPrize(env, db, from, chatId, text.slice(11));
    return;
  }

  if (text.startsWith("/draw_open ")) {
    await openDraw(env, db, from, chatId, text.slice(11).trim());
    return;
  }

  if (text.startsWith("/draw_close ")) {
    await closeDraw(env, db, from, chatId, text.slice(12).trim());
    return;
  }

  if (text.startsWith("/draw_run ")) {
    await runDraw(env, db, from, chatId, text.slice(10).trim());
    return;
  }

  if (text.startsWith("/draw_publish ")) {
    await publishDraw(env, db, from, chatId, text.slice(14).trim());
    return;
  }

  const state = await getState(db, user.id);

  if (state?.state === "entry_reference" && text) {
    await submitReference(env, db, chatId, user, text);
    return;
  }

  if (state?.state === "entry_receipt" && message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    await submitReceipt(env, db, chatId, user, photo.file_id);
    return;
  }

  if (state?.state === "entry_receipt" && message.document) {
    await submitReceipt(env, db, chatId, user, message.document.file_id);
    return;
  }

  await send(
    env,
    chatId,
    "እባክዎ ከታች ካሉት አማራጮች ይምረጡ።",
    homeKeyboard()
  );
}

// -----------------------------
// WORKER ENTRY POINT
// -----------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "addis-egata-bot-api",
        database_binding: Boolean(env.DB),
        telegram_configured: Boolean(env.TELEGRAM_BOT_TOKEN)
      });
    }

    if (
      request.method !== "POST" ||
      url.pathname !== "/telegram/webhook"
    ) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const suppliedSecret = request.headers.get(
      "X-Telegram-Bot-Api-Secret-Token"
    );

    if (
      !env.TELEGRAM_WEBHOOK_SECRET ||
      suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!env.DB) {
      return json({ ok: false, error: "D1 binding DB is missing" }, 500);
    }

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > 1024 * 1024) {
      return json({ ok: false, error: "Request too large" }, 413);
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
      console.error(
        "Telegram update failed:",
        error?.stack || error
      );

      return json({
        ok: false,
        error: "Update processing failed"
      }, 500);
    }
  }
};
