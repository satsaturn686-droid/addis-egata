‎const TELEGRAM_API = "https://api.telegram.org";
‎
‎const now = () => new Date().toISOString();
‎const newId = () => crypto.randomUUID();
‎
‎const json = (data, status = 200) =>
‎  new Response(JSON.stringify(data), {
‎    status,
‎    headers: { "content-type": "application/json; charset=utf-8" }
‎  });
‎
‎function escapeHtml(value) {
‎  return String(value ?? "")
‎    .replaceAll("&", "&amp;")
‎    .replaceAll("<", "&lt;")
‎    .replaceAll(">", "&gt;")
‎    .replaceAll('"', "&quot;");
‎}
‎
‎function admins(env) {
‎  return new Set(
‎    String(env.ADMIN_TELEGRAM_IDS || "")
‎      .split(",").map(x => x.trim()).filter(Boolean)
‎  );
‎}
‎
‎function isAdmin(env, id) {
‎  return admins(env).has(String(id));
‎}
‎
‎async function tg(env, method, body) {
‎  if (!env.TELEGRAM_BOT_TOKEN) {
‎    throw new Error("TELEGRAM_BOT_TOKEN is missing");
‎  }
‎
‎  const response = await fetch(
‎    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
‎    {
‎      method: "POST",
‎      headers: { "content-type": "application/json" },
‎      body: JSON.stringify(body)
‎    }
‎  );
‎
‎  const result = await response.json();
‎  if (!response.ok || !result.ok) {
‎    throw new Error(result.description || "Telegram API error");
‎  }
‎  return result.result;
‎}
‎
‎async function send(env, chatId, text, keyboard) {
‎  return tg(env, "sendMessage", {
‎    chat_id: chatId,
‎    text,
‎    parse_mode: "HTML",
‎    ...(keyboard ? { reply_markup: keyboard } : {})
‎  });
‎}
‎
‎async function callbackAnswer(env, id, text = "") {
‎  return tg(env, "answerCallbackQuery", {
‎    callback_query_id: id,
‎    text
‎  });
‎}
‎
‎async function userByTelegram(db, id) {
‎  return db.prepare(
‎    "SELECT * FROM users WHERE telegram_id = ?"
‎  ).bind(String(id)).first();
‎}
‎
‎async function register(db, env, from) {
‎  const timestamp = now();
‎
‎  await db.prepare(`
‎    INSERT INTO users (
‎      id, telegram_id, username, first_name,
‎      last_name, is_admin, created_at, updated_at
‎    )
‎    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
‎    ON CONFLICT(telegram_id) DO UPDATE SET
‎      username = excluded.username,
‎      first_name = excluded.first_name,
‎      last_name = excluded.last_name,
‎      is_admin = MAX(users.is_admin, excluded.is_admin),
‎      updated_at = excluded.updated_at
‎  `).bind(
‎    newId(), String(from.id), from.username || null,
‎    from.first_name || null, from.last_name || null,
‎    isAdmin(env, from.id) ? 1 : 0, timestamp, timestamp
‎  ).run();
‎
‎  const user = await userByTelegram(db, from.id);
‎
‎  await db.prepare(`
‎    INSERT OR IGNORE INTO wallets (
‎      id, user_id, balance_cents, created_at, updated_at
‎    ) VALUES (?, ?, 0, ?, ?)
‎  `).bind(newId(), user.id, timestamp, timestamp).run();
‎
‎  return user;
‎}
‎
‎async function setState(db, userId, state, data = {}) {
‎  await db.prepare(`
‎    INSERT INTO user_states (user_id, state, data_json, updated_at)
‎    VALUES (?, ?, ?, ?)
‎    ON CONFLICT(user_id) DO UPDATE SET
‎      state = excluded.state,
‎      data_json = excluded.data_json,
‎      updated_at = excluded.updated_at
‎  `).bind(userId, state, JSON.stringify(data), now()).run();
‎}
‎
‎async function getState(db, userId) {
‎  const row = await db.prepare(`
‎    SELECT state, data_json FROM user_states WHERE user_id = ?
‎  `).bind(userId).first();
‎
‎  if (!row) return null;
‎  try {
‎    return { state: row.state, data: JSON.parse(row.data_json || "{}") };
‎  } catch {
‎    return null;
‎  }
‎}
‎
‎async function clearState(db, userId) {
‎  await db.prepare(
‎    "DELETE FROM user_states WHERE user_id = ?"
‎  ).bind(userId).run();
‎}
‎
‎/* Telegram update deduplication.
‎   Failed updates are released so Telegram can retry them. */
‎async function claimUpdate(db, updateId) {
‎
/* Telegram update processing with a 120-second lease.
   Requires migration 0004_update_processing.sql. */

async function claimUpdate(db, updateId) {
  if (!Number.isSafeInteger(updateId) || updateId < 0) {
    throw new Error("Invalid Telegram update_id");
  }

  const timestamp = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + 120_000).toISOString();

  const result = await db.prepare(`
    INSERT INTO processed_telegram_updates (
      update_id, processed_at, status, lease_until, attempts
    )
    VALUES (?, ?, 'processing', ?, 1)
    ON CONFLICT(update_id) DO UPDATE SET
      status = 'processing',
      processed_at = excluded.processed_at,
      lease_until = excluded.lease_until,
      attempts = processed_telegram_updates.attempts + 1
    WHERE processed_telegram_updates.status = 'processing'
      AND (
        processed_telegram_updates.lease_until IS NULL
        OR processed_telegram_updates.lease_until <= excluded.processed_at
      )
  `).bind(updateId, timestamp, leaseUntil).run();

  if (Number(result.meta?.changes || 0) === 1) {
    return "claimed";
  }

  const existing = await db.prepare(`
    SELECT status, lease_until
    FROM processed_telegram_updates
    WHERE update_id = ?
  `).bind(updateId).first();

  if (existing?.status === "processed") {
    return "processed";
  }

  return "busy";
}

async function finishUpdate(db, updateId) {
  const result = await db.prepare(`
    UPDATE processed_telegram_updates
    SET status = 'processed',
        processed_at = ?,
        lease_until = NULL
    WHERE update_id = ?
      AND status = 'processing'
  `).bind(new Date().toISOString(), updateId).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error("Could not mark Telegram update as processed");
  }
}

async function releaseUpdate(db, updateId) {
  const timestamp = new Date().toISOString();

  await db.prepare(`
    UPDATE processed_telegram_updates
    SET lease_until = ?,
        processed_at = ?
    WHERE update_id = ?
      AND status = 'processing'
  `).bind(timestamp, timestamp, updateId).run();
}
‎
‎function secureRandomInt(maxExclusive) {
‎  const RANGE = 0x100000000;
‎
‎  if (
‎    !Number.isSafeInteger(maxExclusive) ||
‎    maxExclusive < 1 ||
‎    maxExclusive > RANGE
‎  ) throw new Error("Invalid random range");
‎
‎  if (maxExclusive === 1) return 0;
‎
‎  const limit = Math.floor(RANGE / maxExclusive) * maxExclusive;
‎  const bytes = new Uint32Array(1);
‎
‎  while (true) {
‎    crypto.getRandomValues(bytes);
‎    if (bytes[0] < limit) return bytes[0] % maxExclusive;
‎  }
‎}
‎
‎function secureShuffle(items) {
‎  const result = [...items];
‎
‎  for (let i = result.length - 1; i > 0; i--) {
‎    const j = secureRandomInt(i + 1);
‎    [result[i], result[j]] = [result[j], result[i]];
‎  }
‎  return result;
‎}
‎
‎async function sha256Hex(value) {
‎  const bytes = new TextEncoder().encode(value);
‎  const hash = await crypto.subtle.digest("SHA-256", bytes);
‎  return Array.from(new Uint8Array(hash))
‎    .map(x => x.toString(16).padStart(2, "0")).join("");
‎}
‎
‎async function audit(db, userId, action, type, entityId, details = {}) {
‎  await db.prepare(`
‎    INSERT INTO audit_logs (
‎      id, user_id, action, entity_type,
‎      entity_id, details_json, created_at
‎    ) VALUES (?, ?, ?, ?, ?, ?, ?)
‎  `).bind(
‎    newId(), userId || null, action, type,
‎    entityId || null, JSON.stringify(details), now()
‎  ).run();
‎}
‎
‎async function getPaymentSettings(db) {
‎  return db.prepare(`
‎    SELECT * FROM payment_settings WHERE id = 1
‎  `).first();
‎}
‎
‎function paymentServiceOpen(settings, date = new Date()) {
‎  if (!settings || Number(settings.service_enabled) !== 1) return false;
‎
‎  const timezone = settings.timezone || "Africa/Addis_Ababa";
‎  const parts = new Intl.DateTimeFormat("en-GB", {
‎    timeZone: timezone,
‎    hour: "2-digit",
‎    minute: "2-digit",
‎    hourCycle: "h23"
‎  }).formatToParts(date);
‎
‎  const hour = Number(parts.find(x => x.type === "hour")?.value);
‎  const minute = Number(parts.find(x => x.type === "minute")?.value);
‎  const current = hour * 60 + minute;
‎
‎  const parse = value => {
‎    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
‎      throw new Error("Invalid service time");
‎    }
‎    const [h, m] = value.split(":").map(Number);
‎    return h * 60 + m;
‎  };
‎
‎  const open = parse(settings.service_open_time || "03:00");
‎  const close = parse(settings.service_close_time || "12:00");
‎
‎  if (open === close) return false;
‎  return open < close
‎    ? current >= open && current < close
‎    : current >= open || current < close;
‎}
‎
‎function homeKeyboard() {
‎  return {
‎    keyboard: [
‎      [{ text: "🎟️ ዕጣዎች" }, { text: "💰 Wallet" }],
‎      [{ text: "📥 Deposit" }, { text: "📤 Withdrawal" }],
‎      [{ text: "📜 የእኔ ቁጥሮች" }, { text: "🏆 ውጤቶች" }],
‎      [{ text: "ℹ️ እገዛ" }]
‎    ],
‎    resize_keyboard: true
‎  };
‎}
‎
‎async function home(env, chatId, firstName) {
‎  await send(
‎    env,
‎    chatId,
‎    `ሰላም ${escapeHtml(firstName || "ደንበኛ")}! 👋\n\n` +
‎    `<b>ADDIS ዕጣ</b> እንኳን ደህና መጡ።\n\n` +
‎    "ከታች ያሉትን አማራጮች ይጠቀሙ።",
‎    homeKeyboard()
‎  );
‎}
‎// -------------------- DRAWS AND NUMBER RESERVATION --------------------
‎
‎async function showDraws(env, db, chatId) {
‎  const result = await db.prepare(`
‎    SELECT id, name, prize_name, entry_fee_cents
‎    FROM draws WHERE status = 'open'
‎    ORDER BY created_at DESC LIMIT 20
‎  `).all();
‎
‎  const draws = result.results || [];
‎  if (!draws.length) {
‎    await send(env, chatId, "አሁን ክፍት የሆነ ዕጣ የለም።");
‎    return;
‎  }
‎
‎  await send(env, chatId, "🎟️ <b>ክፍት የሆኑ ዕጣዎች</b>\nዕጣ ይምረጡ።", {
‎    inline_keyboard: draws.map(d => [{
‎      text: `${d.name} — ${(d.entry_fee_cents / 100).toFixed(2)} ብር`,
‎      callback_data: `draw:${d.id}`
‎    }])
‎  });
‎}
‎
‎async function showDraw(env, db, chatId, drawId) {
‎  const draw = await db.prepare(`
‎    SELECT * FROM draws WHERE id = ? AND status = 'open'
‎  `).bind(drawId).first();
‎
‎  if (!draw) {
‎    await send(env, chatId, "ይህ ዕጣ አሁን ክፍት አይደለም።");
‎    return;
‎  }
‎
‎  const occupied = await db.prepare(`
‎    SELECT COUNT(*) AS total FROM entries
‎    WHERE draw_id = ? AND (
‎      status IN ('pending_payment', 'paid')
‎      OR (status = 'reserved' AND reserved_until > ?)
‎    )
‎  `).bind(drawId, now()).first();
‎
‎  const remaining = Math.max(
‎    0, Number(draw.total_numbers) - Number(occupied?.total || 0)
‎  );
‎
‎  await send(
‎    env, chatId,
‎    `🎟️ <b>${escapeHtml(draw.name)}</b>\n\n` +
‎    `🏆 ሽልማት፦ ${escapeHtml(draw.prize_name)}\n` +
‎    `💵 የቁጥር ዋጋ፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
‎    `🔢 ጠቅላላ፦ ${draw.total_numbers}\n` +
‎    `✅ የቀሩ፦ ${remaining}\n` +
‎    `🏆 አሸናፊዎች፦ ${draw.winner_count}\n\n` +
‎    escapeHtml(draw.description || ""),
‎    { inline_keyboard: [[{
‎      text: "🔢 ቁጥር ምረጥ",
‎      callback_data: `numbers:${draw.id}:0`
‎    }]] }
‎  );
‎}
‎
‎async function showNumbers(env, db, chatId, drawId, page = 0) {
‎  const draw = await db.prepare(`
‎    SELECT id, name, total_numbers, status FROM draws WHERE id = ?
‎  `).bind(drawId).first();
‎
‎  if (!draw || draw.status !== "open") {
‎    await send(env, chatId, "ይህ ዕጣ ክፍት አይደለም።");
‎    return;
‎  }
‎
‎  page = Math.max(0, Math.min(2500, Number(page) || 0));
‎  const pageSize = 40;
‎  const start = page * pageSize + 1;
‎  const end = Math.min(Number(draw.total_numbers), start + pageSize - 1);
‎
‎  if (start > draw.total_numbers) {
‎    await send(env, chatId, "ይህ የቁጥር ገጽ የለም።");
‎    return;
‎  }
‎
‎  const result = await db.prepare(`
‎    SELECT number FROM entries
‎    WHERE draw_id = ? AND (
‎      status IN ('pending_payment', 'paid')
‎      OR (status = 'reserved' AND reserved_until > ?)
‎    )
‎  `).bind(drawId, now()).all();
‎
‎  const occupied = new Set((result.results || []).map(x => Number(x.number)));
‎  const keyboard = [];
‎  let row = [];
‎
‎  for (let n = start; n <= end; n++) {
‎    row.push(occupied.has(n)
‎      ? { text: `❌ ${n}`, callback_data: "occupied" }
‎      : { text: String(n), callback_data: `reserve:${drawId}:${n}` });
‎
‎    if (row.length === 5) {
‎      keyboard.push(row);
‎      row = [];
‎    }
‎  }
‎  if (row.length) keyboard.push(row);
‎
‎  const nav = [];
‎  if (page > 0) nav.push({
‎    text: "⬅️ ቀዳሚ",
‎    callback_data: `numbers:${drawId}:${page - 1}`
‎  });
‎  if (end < draw.total_numbers) nav.push({
‎    text: "ቀጣይ ➡️",
‎    callback_data: `numbers:${drawId}:${page + 1}`
‎  });
‎  if (nav.length) keyboard.push(nav);
‎
‎  await send(
‎    env, chatId,
‎    `🔢 <b>${escapeHtml(draw.name)}</b>\nቁጥር ይምረጡ።\nገጽ ${page + 1}`,
‎    { inline_keyboard: keyboard }
‎  );
‎}
‎
‎async function reserveNumber(env, db, chatId, user, drawId, number) {
‎  if (!Number.isInteger(number) || number < 1) {
‎    await send(env, chatId, "የቁጥር ምርጫው ትክክል አይደለም።");
‎    return;
‎  }
‎
‎  const draw = await db.prepare(`
‎    SELECT * FROM draws WHERE id = ? AND status = 'open'
‎  `).bind(drawId).first();
‎
‎  if (!draw || number > Number(draw.total_numbers)) {
‎    await send(env, chatId, "ዕጣው ወይም ቁጥሩ አልተገኘም።");
‎    return;
‎  }
‎
‎  const timestamp = now();
‎  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
‎
‎  await db.prepare(`
‎    UPDATE entries SET status = 'expired', updated_at = ?
‎    WHERE draw_id = ? AND number = ?
‎      AND status = 'reserved' AND reserved_until <= ?
‎  `).bind(timestamp, drawId, number, timestamp).run();
‎
‎  const entryId = newId();
‎
‎  try {
‎    await db.prepare(`
‎      INSERT INTO entries (
‎        id, draw_id, user_id, number, status,
‎        reserved_until, created_at, updated_at
‎      ) VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)
‎    `).bind(
‎      entryId, drawId, user.id, number,
‎      expiry, timestamp, timestamp
‎    ).run();
‎  } catch {
‎    await send(env, chatId, "ይቅርታ፣ ይህ ቁጥር ተይዟል። ሌላ ይምረጡ።");
‎    return;
‎  }
‎
‎  const settings = await getPaymentSettings(db);
‎  const telebirr = env.TELEBIRR_NUMBER ||
‎    settings?.telebirr_number || "Admin ገና አላስገባም";
‎
‎  await setState(db, user.id, "entry_reference", {
‎    entryId, drawId, number
‎  });
‎
‎  await send(
‎    env, chatId,
‎    `✅ <b>ቁጥር ${number} ተይዟል።</b>\n\n` +
‎    `💵 ክፍያ፦ ${(draw.entry_fee_cents / 100).toFixed(2)} ብር\n` +
‎    `📱 Telebirr፦ <code>${escapeHtml(telebirr)}</code>\n\n` +
‎    "ክፍያውን ከፈጸሙ በኋላ Transaction Reference ይላኩ።\n" +
‎    "⚠️ ቁጥሩ ለ30 ደቂቃ ብቻ ይያዛል።"
‎  );
‎}
‎
‎// -------------------- PAYMENT REFERENCE AND RECEIPT --------------------
‎
‎async function submitReference(env, db, chatId, user, reference) {
‎  const state = await getState(db, user.id);
‎  if (!state || state.state !== "entry_reference") return false;
‎
‎  const clean = String(reference || "").trim();
‎  if (clean.length < 5 || clean.length > 100) {
‎    await send(env, chatId, "Transaction Reference ትክክል አይደለም።");
‎    return true;
‎  }
‎
‎  await setState(db, user.id, "entry_receipt", {
‎    ...state.data, reference: clean
‎  });
‎
‎  await send(env, chatId, "📷 እባክዎ የTelebirr ክፍያ Screenshot ይላኩ።");
‎  return true;
‎}
‎
‎async function submitReceipt(env, db, chatId, user, fileId) {
‎  const state = await getState(db, user.id);
‎  if (!state || state.state !== "entry_receipt") return false;
‎
‎  const { entryId, reference } = state.data;
‎  const timestamp = now();
‎
‎  const entry = await db.prepare(`
‎    SELECT e.*, d.entry_fee_cents, d.name AS draw_name
‎    FROM entries e JOIN draws d ON d.id = e.draw_id
‎    WHERE e.id = ? AND e.user_id = ?
‎      AND e.status = 'reserved' AND e.reserved_until > ?
‎  `).bind(entryId, user.id, timestamp).first();
‎
‎  if (!entry) {
‎    await clearState(db, user.id);
‎    await send(env, chatId, "የቁጥር መያዣዎ ጊዜ አልፏል። እንደገና ይምረጡ።");
‎    return true;
‎  }
‎
‎  const paymentId = newId();
‎
‎  try {
‎    await db.batch([
‎      db.prepare(`
‎        INSERT INTO payment_references
‎          (reference, kind, entity_id, created_at)
‎        VALUES (?, 'entry', ?, ?)
‎      `).bind(reference, paymentId, timestamp),
‎
‎      db.prepare(`
‎        INSERT INTO payments (
‎          id, entry_id, user_id, amount_cents,
‎          transaction_reference, receipt_file_id,
‎          status, created_at, updated_at
‎        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
‎      `).bind(
‎        paymentId, entryId, user.id, entry.entry_fee_cents,
‎        reference, fileId, timestamp, timestamp
‎      ),
‎
‎      db.prepare(`
‎        UPDATE entries SET status = 'pending_payment', updated_at = ?
‎        WHERE id = ? AND user_id = ? AND status = 'reserved'
‎          AND reserved_until > ?
‎      `).bind(timestamp, entryId, user.id, timestamp)
‎    ]);
‎  } catch (error) {
‎    console.error("Entry payment submission failed:", error);
‎    await send(
‎      env, chatId,
‎      "ይህ Reference ቀድሞ ተጠቅሟል ወይም ማስረጃው አልተመዘገበም። Admin ያነጋግሩ።"
‎    );
‎    return true;
‎  }
‎
‎  await clearState(db, user.id);
‎  await send(env, chatId, "📨 ማስረጃዎ ደርሷል። Admin እስኪያረጋግጥ ይጠብቁ።");
‎
‎  for (const adminId of admins(env)) {
‎    try {
‎      await send(
‎        env, adminId,
‎        `🔔 <b>አዲስ ክፍያ</b>\n\n` +
‎        `User: <code>${escapeHtml(user.telegram_id)}</code>\n` +
‎        `ዕጣ: ${escapeHtml(entry.draw_name)}\n` +
‎        `ቁጥር: ${entry.number}\n` +
‎        `መጠን: ${(entry.entry_fee_cents / 100).toFixed(2)} ETB\n` +
‎        `Reference: <code>${escapeHtml(reference)}</code>`,
‎        { inline_keyboard: [[
‎          { text: "✅ Approve", callback_data: `approve:${paymentId}` },
‎          { text: "❌ Reject", callback_data: `reject:${paymentId}` }
‎        ]] }
‎      );
‎    } catch (error) {
‎      console.error("Payment admin notification failed", error);
‎    }
‎  }
‎  return true;
‎}
‎‎// -------------------- PAYMENT REVIEW AND WALLET LEDGER --------------------
‎
‎async function reviewPayment(env, db, admin, paymentId, approve) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  if (!adminUser) return;
‎
‎  const payment = await db.prepare(`
‎    SELECT p.*, e.number, e.id AS entry_id, u.telegram_id
‎    FROM payments p
‎    JOIN entries e ON e.id = p.entry_id
‎    JOIN users u ON u.id = p.user_id
‎    WHERE p.id = ?
‎  `).bind(paymentId).first();
‎
‎  if (!payment || payment.status !== "pending") return;
‎
‎  const timestamp = now();
‎
‎  if (approve) {
‎    await db.batch([
‎      db.prepare(`
‎        UPDATE payments
‎        SET status = 'approved', verified_by = ?,
‎            verified_at = ?, updated_at = ?
‎        WHERE id = ? AND status = 'pending'
‎          AND EXISTS (
‎            SELECT 1 FROM entries
‎            WHERE entries.id = payments.entry_id
‎              AND entries.status = 'pending_payment'
‎          )
‎      `).bind(adminUser.id, timestamp, timestamp, paymentId),
‎
‎      db.prepare(`
‎        UPDATE entries SET status = 'paid', paid_at = ?, updated_at = ?
‎        WHERE id = ? AND status = 'pending_payment'
‎          AND EXISTS (
‎            SELECT 1 FROM payments
‎            WHERE payments.entry_id = entries.id
‎              AND payments.status = 'approved'
‎          )
‎      `).bind(timestamp, timestamp, payment.entry_id)
‎    ]);
‎
‎    const confirmed = await db.prepare(`
‎      SELECT p.status AS payment_status, e.status AS entry_status
‎      FROM payments p JOIN entries e ON e.id = p.entry_id
‎      WHERE p.id = ?
‎    `).bind(paymentId).first();
‎
‎    if (
‎      confirmed?.payment_status === "approved" &&
‎      confirmed?.entry_status === "paid"
‎    ) {
‎      await send(
‎        env, payment.telegram_id,
‎        `🎉 <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
‎        `የዕጣ ቁጥርዎ፦ ${payment.number}\nመልካም ዕድል!`
‎      );
‎    } else {
‎      await send(env, admin.id, "⚠️ ክፍያው እና ቁጥሩ አንድ ላይ አልተረጋገጡም። DB ይፈትሹ።");
‎      return;
‎    }
‎  } else {
‎    await db.batch([
‎      db.prepare(`
‎        UPDATE payments SET status = 'rejected',
‎          verified_by = ?, verified_at = ?, updated_at = ?
‎        WHERE id = ? AND status = 'pending'
‎      `).bind(adminUser.id, timestamp, timestamp, paymentId),
‎
‎      db.prepare(`
‎        UPDATE entries SET status = 'rejected', updated_at = ?
‎        WHERE id = ? AND status = 'pending_payment'
‎      `).bind(timestamp, payment.entry_id)
‎    ]);
‎
‎    await send(
‎      env, payment.telegram_id,
‎      `❌ የክፍያ ማስረጃዎ ውድቅ ተደርጓል።\nቁጥር፦ ${payment.number}\nAdmin ያነጋግሩ።`
‎    );
‎  }
‎
‎  await audit(
‎    db, adminUser.id,
‎    approve ? "payment_approved" : "payment_rejected",
‎    "payment", paymentId, { entryId: payment.entry_id }
‎  );
‎}
‎
‎async function walletBalance(db, userId) {
‎  const row = await db.prepare(`
‎    SELECT balance_cents FROM wallets WHERE user_id = ?
‎  `).bind(userId).first();
‎  return Number(row?.balance_cents || 0);
‎}
‎
‎async function walletChange(
‎  db, userId, amountCents, type, reference, description
‎) {
‎  if (!Number.isSafeInteger(amountCents) || amountCents === 0) {
‎    throw new Error("Invalid wallet amount");
‎  }
‎
‎  const timestamp = now();
‎
‎  const wallet = await db.prepare(`
‎    SELECT balance_cents FROM wallets WHERE user_id = ?
‎  `).bind(userId).first();
‎
‎  if (!wallet) throw new Error("Wallet not found");
‎
‎  const current = Number(wallet.balance_cents);
‎  const next = current + amountCents;
‎
‎  if (next < 0) throw new Error("Insufficient wallet balance");
‎
‎  await db.batch([
‎    db.prepare(`
‎      UPDATE wallets SET balance_cents = ?, updated_at = ?
‎      WHERE user_id = ? AND balance_cents = ?
‎    `).bind(next, timestamp, userId, current),
‎
‎    db.prepare(`
‎      INSERT INTO wallet_transactions (
‎        id, user_id, type, amount_cents,
‎        balance_after_cents, reference, description, created_at
‎      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
‎    `).bind(
‎      newId(), userId, type, amountCents,
‎      next, reference, description, timestamp
‎    )
‎  ]);
‎
‎  const verified = await walletBalance(db, userId);
‎  if (verified !== next) {
‎    throw new Error("Wallet balance update conflict");
‎  }
‎  return next;
‎}
‎
‎async function showWallet(env, db, chatId, user) {
‎  const balance = await walletBalance(db, user.id);
‎  const history = await db.prepare(`
‎    SELECT type, amount_cents, description, created_at
‎    FROM wallet_transactions WHERE user_id = ?
‎    ORDER BY created_at DESC LIMIT 8
‎  `).bind(user.id).all();
‎
‎  const lines = (history.results || []).map(x =>
‎    `• ${escapeHtml(x.type)}: ${(x.amount_cents / 100).toFixed(2)} ብር`
‎  );
‎
‎  await send(
‎    env, chatId,
‎    `💰 <b>የእኔ Wallet</b>\n\n` +
‎    `ቀሪ ሂሳብ፦ <b>${(balance / 100).toFixed(2)} ብር</b>\n\n` +
‎    `<b>የቅርብ ጊዜ እንቅስቃሴ</b>\n` +
‎    (lines.length ? lines.join("\n") : "ገና እንቅስቃሴ የለም።"),
‎    { inline_keyboard: [
‎      [{ text: "📥 Deposit", callback_data: "wallet_deposit" }],
‎      [{ text: "📤 Withdrawal", callback_data: "wallet_withdraw" }]
‎    ] }
‎  );
‎}
‎
‎// -------------------- WALLET DEPOSIT --------------------
‎
‎async function startDeposit(env, db, chatId, user) {
‎  const settings = await getPaymentSettings(db);
‎
‎  if (!paymentServiceOpen(settings)) {
‎    await send(
‎      env, chatId,
‎      `⏰ የክፍያ አገልግሎት አሁን ዝግ ነው።\n` +
‎      `የስራ ሰዓት፦ ${settings?.service_open_time || "03:00"}–` +
‎      `${settings?.service_close_time || "12:00"} (የኢትዮጵያ ሰዓት)`
‎    );
‎    return;
‎  }
‎
‎  await setState(db, user.id, "deposit_amount");
‎  await send(env, chatId, "📥 ወደ Wallet ማስገባት የሚፈልጉትን መጠን በብር ያስገቡ።");
‎}
‎
‎async function startWithdrawal(env, db, chatId, user) {
‎  const balance = await walletBalance(db, user.id);
‎  if (balance < 100) {
‎    await send(env, chatId, "የWithdrawal ዝቅተኛ መጠን 100 ብር ነው። ቀሪ ሂሳብዎ በቂ አይደለም።");
‎    return;
‎  }
‎
‎  await setState(db, user.id, "withdraw_amount");
‎  await send(env, chatId, `📤 ለማውጣት የሚፈልጉትን መጠን ያስገቡ።\nቀሪ ሂሳብ፦ ${(balance / 100).toFixed(2)} ብር`);
‎}
‎
‎async function submitDepositReference(env, db, chatId, user, reference) {
‎  const state = await getState(db, user.id);
‎  if (!state || state.state !== "deposit_reference") return false;
‎
‎  const clean = String(reference || "").trim();
‎  if (clean.length < 5 || clean.length > 100) {
‎    await send(env, chatId, "Reference ትክክል አይደለም።");
‎    return true;
‎  }
‎
‎  await setState(db, user.id, "deposit_receipt", {
‎    amountCents: state.data.amountCents,
‎    reference: clean
‎  });
‎
‎  await send(env, chatId, "📷 የTelebirr ክፍያ Screenshot ይላኩ።");
‎  return true;
‎}
‎
‎async function submitDepositReceipt(env, db, chatId, user, fileId) {
‎  const state = await getState(db, user.id);
‎  if (!state || state.state !== "deposit_receipt") return false;
‎
‎  const timestamp = now();
‎  const depositId = newId();
‎  const { amountCents, reference } = state.data;
‎
‎  try {
‎    await db.batch([
‎      db.prepare(`
‎        INSERT INTO payment_references
‎          (reference, kind, entity_id, created_at)
‎        VALUES (?, 'wallet_deposit', ?, ?)
‎      `).bind(reference, depositId, timestamp),
‎
‎      db.prepare(`
‎        INSERT INTO wallet_deposits (
‎          id, user_id, amount_cents, transaction_reference,
‎          receipt_file_id, status, created_at, updated_at
‎        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
‎      `).bind(
‎        depositId, user.id, amountCents, reference,
‎        fileId, timestamp, timestamp
‎      )
‎    ]);
‎  } catch (error) {
‎    console.error("Deposit submission failed", error);
‎    await send(env, chatId, "ይህ Reference ቀድሞ ተጠቅሟል። ሌላ Reference ይጠቀሙ።");
‎    return true;
‎  }
‎
‎  await clearState(db, user.id);
‎  await send(env, chatId, "📨 Deposit ጥያቄዎ ተመዝግቧል። Admin እስኪያረጋግጥ ይጠብቁ።");
‎
‎  for (const adminId of admins(env)) {
‎    await send(
‎      env, adminId,
‎      `📥 <b>አዲስ Wallet Deposit</b>\n` +
‎      `User ID: <code>${escapeHtml(user.telegram_id)}</code>\n` +
‎      `መጠን: ${(amountCents / 100).toFixed(2)} ETB\n` +
‎      `Reference: <code>${escapeHtml(reference)}</code>`,
‎      { inline_keyboard: [[
‎        { text: "✅ Approve", callback_data: `deposit_approve:${depositId}` },
‎        { text: "❌ Reject", callback_data: `deposit_reject:${depositId}` }
‎      ]] }
‎    );
‎  }
‎  return true;
‎}
‎
‎async function reviewDeposit(env, db, admin, depositId, approve) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const deposit = await db.prepare(`
‎    SELECT wd.*, u.telegram_id
‎    FROM wallet_deposits wd JOIN users u ON u.id = wd.user_id
‎    WHERE wd.id = ?
‎  `).bind(depositId).first();
‎
‎  if (!deposit || deposit.status !== "pending") return;
‎
‎  const timestamp = now();
‎
‎  if (approve) {
‎    const changed = await db.prepare(`
‎      UPDATE wallet_deposits
‎      SET status = 'approved', verified_by = ?,
‎          verified_at = ?, updated_at = ?
‎      WHERE id = ? AND status = 'pending'
‎    `).bind(adminUser.id, timestamp, timestamp, depositId).run();
‎
‎    if (!changed.meta?.changes) return;
‎
‎    try {
‎      await walletChange(
‎        db, deposit.user_id, Number(deposit.amount_cents),
‎        "deposit", `deposit:${depositId}`, "Wallet deposit approved"
‎      );
‎    } catch (error) {
‎      await db.prepare(`
‎        UPDATE wallet_deposits SET status = 'pending',
‎          verified_by = NULL, verified_at = NULL, updated_at = ?
‎        WHERE id = ? AND status = 'approved'
‎      `).bind(now(), depositId).run();
‎      throw error;
‎    }
‎
‎    await send(
‎      env, deposit.telegram_id,
‎      `✅ Wallet Deposit ተረጋግጧል።\n` +
‎      `የገባው፦ ${(deposit.amount_cents / 100).toFixed(2)} ብር`
‎    );
‎  } else {
‎    await db.prepare(`
‎      UPDATE wallet_deposits
‎      SET status = 'rejected', verified_by = ?,
‎          verified_at = ?, updated_at = ?
‎      WHERE id = ? AND status = 'pending'
‎    `).bind(adminUser.id, timestamp, timestamp, depositId).run();
‎
‎    await send(env, deposit.telegram_id, "❌ Wallet Deposit ጥያቄዎ ውድቅ ተደርጓል። Admin ያነጋግሩ።");
‎  }
‎
‎  await audit(db, adminUser.id, approve ? "deposit_approved" : "deposit_rejected",
‎    "wallet_deposit", depositId, { amountCents: deposit.amount_cents });
‎}
‎
‎// -------------------- WITHDRAWAL REQUESTS --------------------
‎
‎async function submitWithdrawalAmount(env, db, chatId, user, amountText) {
‎  const amount = Number(amountText);
‎  const cents = Math.round(amount * 100);
‎
‎  if (!Number.isSafeInteger(cents) || cents < 10000) {
‎    await send(env, chatId, "ዝቅተኛው Withdrawal 100 ብር ነው። ትክክለኛ መጠን ያስገቡ።");
‎    return true;
‎  }
‎
‎  const balance = await walletBalance(db, user.id);
‎  if (cents > balance) {
‎    await send(env, chatId, `በWallet ውስጥ ያለው ${(balance / 100).toFixed(2)} ብር ብቻ ነው።`);
‎    return true;
‎  }
‎
‎  await setState(db, user.id, "withdraw_number", { amountCents: cents });
‎  await send(env, chatId, "📱 የTelebirr ቁጥርዎን ያስገቡ።");
‎  return true;
‎}
‎
‎async function submitWithdrawalNumber(env, db, chatId, user, phone) {
‎  const state = await getState(db, user.id);
‎  if (!state || state.state !== "withdraw_number") return false;
‎
‎  const clean = String(phone || "").replace(/\s+/g, "");
‎  if (!/^[0-9+]{9,16}$/.test(clean)) {
‎    await send(env, chatId, "ትክክለኛ የTelebirr ቁጥር ያስገቡ።");
‎    return true;
‎  }
‎
‎  const timestamp = now();
‎  const withdrawalId = newId();
‎  const amountCents = Number(state.data.amountCents);
‎
‎  try {
‎    await db.batch([
‎      db.prepare(`
‎        INSERT INTO withdrawals (
‎          id, user_id, amount_cents, telebirr_number,
‎          status, created_at
‎        ) VALUES (?, ?, ?, ?, 'pending', ?)
‎      `).bind(withdrawalId, user.id, amountCents, clean, timestamp),
‎
‎      db.prepare(`
‎        UPDATE wallets SET balance_cents = balance_cents - ?,
‎          updated_at = ?
‎        WHERE user_id = ? AND balance_cents >= ?
‎      `).bind(amountCents, timestamp, user.id, amountCents),
‎
‎      db.prepare(`
‎        INSERT INTO wallet_transactions (
‎          id, user_id, type, amount_cents,
‎          balance_after_cents, reference, description, created_at
‎        )
‎        SELECT ?, ?, 'withdrawal', ?, balance_cents,
‎          ?, 'Withdrawal request reserved', ?
‎        FROM wallets WHERE user_id = ?
‎      `).bind(
‎        newId(), user.id, -amountCents,
‎        `withdrawal:${withdrawalId}`, timestamp, user.id
‎      )
‎    ]);
‎  } catch (error) {
‎    console.error("Withdrawal request failed", error);
‎    await send(env, chatId, "Withdrawal ጥያቄው አልተመዘገበም። ደግመው ይሞክሩ።");
‎    return true;
‎  }
‎
‎  const check = await db.prepare(`
‎    SELECT status FROM withdrawals WHERE id = ?
‎  `).bind(withdrawalId).first();
‎
‎  if (!check) {
‎    await send(env, chatId, "Withdrawal ጥያቄው አልተመዘገበም።");
‎    return true;
‎  }
‎
‎  await clearState(db, user.id);
‎  await send(env, chatId, "📨 Withdrawal ጥያቄዎ ተልኳል። Admin እስኪያጸድቅ ይጠብቁ።");
‎
‎  for (const adminId of admins(env)) {
‎    await send(
‎      env, adminId,
‎      `📤 <b>አዲስ Withdrawal</b>\n` +
‎      `User: <code>${escapeHtml(user.telegram_id)}</code>\n` +
‎      `Amount: ${(amountCents / 100).toFixed(2)} ETB\n` +
‎      `Telebirr: <code>${escapeHtml(clean)}</code>`,
‎      { inline_keyboard: [[
‎        { text: "✅ Paid", callback_data: `withdraw_paid:${withdrawalId}` },
‎        { text: "❌ Reject", callback_data: `withdraw_reject:${withdrawalId}` }
‎      ]] }
‎    );
‎  }
‎  return true;
‎}
‎
‎async function reviewWithdrawal(env, db, admin, withdrawalId, action) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const withdrawal = await db.prepare(`
‎    SELECT w.*, u.telegram_id FROM withdrawals w
‎    JOIN users u ON u.id = w.user_id WHERE w.id = ?
‎  `).bind(withdrawalId).first();
‎
‎  if (!withdrawal || withdrawal.status !== "pending") return;
‎
‎  const timestamp = now();
‎
‎  if (action === "paid") {
‎    const result = await db.prepare(`
‎      UPDATE withdrawals SET status = 'paid',
‎        processed_by = ?, processed_at = ?
‎      WHERE id = ? AND status = 'pending'
‎    `).bind(adminUser.id, timestamp, withdrawalId).run();
‎
‎    if (!result.meta?.changes) return;
‎
‎    await send(
‎      env, withdrawal.telegram_id,
‎      `✅ Withdrawal ተከፍሏል።\n${(withdrawal.amount_cents / 100).toFixed(2)} ብር`
‎    );
‎  } else {
‎    const result = await db.prepare(`
‎      UPDATE withdrawals SET status = 'rejected',
‎        rejection_reason = 'Admin rejected',
‎        processed_by = ?, processed_at = ?
‎      WHERE id = ? AND status = 'pending'
‎    `).bind(adminUser.id, timestamp, withdrawalId).run();
‎
‎    if (!result.meta?.changes) return;
‎
‎    await walletChange(
‎      db, withdrawal.user_id, Number(withdrawal.amount_cents),
‎      "refund", `withdrawal-refund:${withdrawalId}`,
‎      "Rejected withdrawal refunded"
‎    );
‎
‎    await send(
‎      env, withdrawal.telegram_id,
‎      `❌ Withdrawal ውድቅ ተደርጓል።\n` +
‎      `${(withdrawal.amount_cents / 100).toFixed(2)} ብር ወደ Wallet ተመልሷል።`
‎    );
‎  }
‎
‎  await audit(db, adminUser.id, `withdrawal_${action}`,
‎    "withdrawal", withdrawalId, { amountCents: withdrawal.amount_cents });
‎}
‎
‎// -------------------- USER ENTRIES AND PUBLIC RESULTS --------------------
‎
‎async function showMyEntries(env, db, chatId, user) {
‎  const result = await db.prepare(`
‎    SELECT e.number, e.status, d.name AS draw_name
‎    FROM entries e JOIN draws d ON d.id = e.draw_id
‎    WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 30
‎  `).bind(user.id).all();
‎
‎  const entries = result.results || [];
‎  if (!entries.length) {
‎    await send(env, chatId, "እስካሁን የያዙት ቁጥር የለም።");
‎    return;
‎  }
‎
‎  const labels = {
‎    reserved: "ጊዜያዊ ተይዟል",
‎    pending_payment: "ክፍያ በማረጋገጥ ላይ",
‎    paid: "ክፍያ ተረጋግጧል",
‎    rejected: "ውድቅ ተደርጓል",
‎    expired: "ጊዜው አልፏል"
‎  };
‎
‎  await send(
‎    env, chatId,
‎    `📜 <b>የእኔ ቁጥሮች</b>\n\n` +
‎    entries.map(e =>
‎      `• ${escapeHtml(e.draw_name)} — #${e.number}: ${labels[e.status] || e.status}`
‎    ).join("\n")
‎  );
‎}
‎
‎async function showResults(env, db, chatId) {
‎  const result = await db.prepare(`
‎    SELECT d.name, w.rank, w.prize_amount_cents,
‎      e.number, u.first_name
‎    FROM winners w
‎    JOIN draws d ON d.id = w.draw_id
‎    JOIN entries e ON e.id = w.entry_id
‎    JOIN users u ON u.id = w.user_id
‎    JOIN draw_results r ON r.draw_id = w.draw_id
‎    WHERE r.published_at IS NOT NULL
‎    ORDER BY r.published_at DESC, w.rank LIMIT 30
‎  `).all();
‎
‎  const winners = result.results || [];
‎  if (!winners.length) {
‎    await send(env, chatId, "ገና የታተመ የዕጣ ውጤት የለም።");
‎    return;
‎  }
‎
‎  await send(
‎    env, chatId,
‎    `🏆 <b>የዕጣ ውጤቶች</b>\n\n` +
‎    winners.map(w =>
‎      `🎉 ${escapeHtml(w.name)}\n` +
‎      `ደረጃ ${w.rank} — ${escapeHtml(w.first_name || "ተሳታፊ")}\n` +
‎      `ቁጥር #${w.number} — ${(w.prize_amount_cents / 100).toFixed(2)} ብር`
‎    ).join("\n\n")
‎  );
‎}
‎
‎// -------------------- WINNER PAYOUT WORKFLOW --------------------
‎
‎async function notifyWinners(env, db, drawId) {
‎  const winners = await db.prepare(`
‎    SELECT w.id AS winner_id, w.rank, w.prize_amount_cents,
‎      u.telegram_id, d.prize_type, d.prize_name
‎    FROM winners w
‎    JOIN users u ON u.id = w.user_id
‎    JOIN draws d ON d.id = w.draw_id
‎    WHERE w.draw_id = ?
‎  `).bind(drawId).all();
‎
‎  for (const winner of winners.results || []) {
‎    try {
‎      const message = winner.prize_type === "cash"
‎        ? `🏆 <b>እንኳን ደስ አለዎት!</b>\n\n` +
‎          `የዕጣ አሸናፊ ሆነዋል።\n` +
‎          `ደረጃ፦ ${winner.rank}\n` +
‎          `ሽልማት፦ ${(winner.prize_amount_cents / 100).toFixed(2)} ብር\n\n` +
‎          "የሽልማት ሂደቱን ለመጀመር የTelebirr ቁጥርዎን ይላኩ።"
‎        : `🏆 <b>እንኳን ደስ አለዎት!</b>\n\n` +
‎          `የ${escapeHtml(winner.prize_name)} አሸናፊ ሆነዋል።\n` +
‎          "ሙሉ ስምዎን እና ስልክ ቁጥርዎን ይላኩ።";
‎
‎      await send(env, winner.telegram_id, message);
‎
‎      if (winner.prize_type === "cash") {
‎        await setState(db, winner.telegram_id, "winner_telebirr", {
‎          winnerId: winner.winner_id
‎        });
‎      } else {
‎        await setState(db, winner.telegram_id, "winner_name", {
‎          winnerId: winner.winner_id
‎        });
‎      }
‎    } catch (error) {
‎      console.error("Winner notification failed", winner.telegram_id, error);
‎    }
‎  }
‎}
‎
‎async function submitWinnerDetails(env, db, chatId, user, value) {
‎  const state = await getState(db, user.id);
‎  if (!state) return false;
‎
‎  if (state.state === "winner_telebirr") {
‎    const phone = String(value || "").replace(/\s+/g, "");
‎    if (!/^[0-9+]{9,16}$/.test(phone)) {
‎      await send(env, chatId, "ትክክለኛ የTelebirr ቁጥር ያስገቡ።");
‎      return true;
‎    }
‎
‎    await db.prepare(`
‎      UPDATE winner_payouts SET telebirr_number = ?,
‎        status = 'submitted', updated_at = ?
‎      WHERE winner_id = ? AND user_id = ?
‎    `).bind(phone, now(), state.data.winnerId, user.id).run();
‎
‎    await clearState(db, user.id);
‎    await send(env, chatId, "✅ የሽልማት የTelebirr ቁጥርዎ ተመዝግቧል። Admin ያረጋግጣል።");
‎
‎    for (const adminId of admins(env)) {
‎      await send(env, adminId,
‎        `💵 የCash Winner መረጃ ደርሷል።\n` +
‎        `Winner ID: <code>${escapeHtml(state.data.winnerId)}</code>\n` +
‎        `Telebirr: <code>${escapeHtml(phone)}</code>`);
‎    }
‎    return true;
‎  }
‎
‎  if (state.state === "winner_name") {
‎    const fullName = String(value || "").trim();
‎    if (fullName.length < 3 || fullName.length > 100) {
‎      await send(env, chatId, "ሙሉ ስምዎን በትክክል ያስገቡ።");
‎      return true;
‎    }
‎
‎    await setState(db, user.id, "winner_phone", {
‎      ...state.data, fullName
‎    });
‎    await send(env, chatId, "📱 የስልክ ቁጥርዎን ያስገቡ።");
‎    return true;
‎  }
‎
‎  if (state.state === "winner_phone") {
‎    const phone = String(value || "").replace(/\s+/g, "");
‎    if (!/^[0-9+]{9,16}$/.test(phone)) {
‎      await send(env, chatId, "ትክክለኛ የስልክ ቁጥር ያስገቡ።");
‎      return true;
‎    }
‎
‎    await db.prepare(`
‎      UPDATE winner_payouts SET recipient_full_name = ?,
‎        recipient_phone = ?, status = 'submitted', updated_at = ?
‎      WHERE winner_id = ? AND user_id = ?
‎    `).bind(
‎      state.data.fullName, phone, now(),
‎      state.data.winnerId, user.id
‎    ).run();
‎
‎    await clearState(db, user.id);
‎    await send(env, chatId, "✅ ሙሉ ስምዎና ስልክ ቁጥርዎ ተመዝግቧል። Admin ያረጋግጣል።");
‎
‎    for (const adminId of admins(env)) {
‎      await send(env, adminId,
‎        `🎁 የPhysical Winner መረጃ ደርሷል።\n` +
‎        `Winner ID: <code>${escapeHtml(state.data.winnerId)}</code>\n` +
‎        `ስም: ${escapeHtml(state.data.fullName)}\nስልክ: ${escapeHtml(phone)}`);
‎    }
‎    return true;
‎  }
‎
‎  return false;
‎}
‎
‎async function approvePayout(env, db, admin, winnerId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const payout = await db.prepare(`
‎    SELECT wp.*, u.telegram_id FROM winner_payouts wp
‎    JOIN users u ON u.id = wp.user_id
‎    WHERE wp.winner_id = ?
‎  `).bind(winnerId).first();
‎
‎  if (!payout || payout.status !== "submitted") return;
‎
‎  await db.prepare(`
‎    UPDATE winner_payouts SET status = 'approved', updated_at = ?
‎    WHERE winner_id = ? AND status = 'submitted'
‎  `).bind(now(), winnerId).run();
‎
‎  await audit(db, adminUser.id, "winner_payout_approved",
‎    "winner_payout", winnerId);
‎  await send(env, payout.telegram_id, "✅ የሽልማት መረጃዎ ተረጋግጧል። የክፍያ/ርክክብ ሂደቱ ይቀጥላል።");
‎}
‎
‎async function markPayoutPaid(env, db, admin, winnerId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const payout = await db.prepare(`
‎    SELECT wp.*, u.telegram_id FROM winner_payouts wp
‎    JOIN users u ON u.id = wp.user_id
‎    WHERE wp.winner_id = ?
‎  `).bind(winnerId).first();
‎
‎  if (!payout || payout.status !== "approved") return;
‎
‎  await db.prepare(`
‎    UPDATE winner_payouts SET status = 'paid', updated_at = ?
‎    WHERE winner_id = ? AND status = 'approved'
‎  `).bind(now(), winnerId).run();
‎
‎  await audit(db, adminUser.id, "winner_payout_paid",
‎    "winner_payout", winnerId);
‎  await send(env, payout.telegram_id, "🎉 ሽልማትዎ ተከፍሏል/ተረክበዋል። እንኳን ደስ አለዎት!");
‎}
‎‎// -------------------- ADMIN PANEL AND DRAW MANAGEMENT --------------------
‎
‎async function adminPanel(env, db, chatId) {
‎  const [payments, deposits, withdrawals, payouts] = await Promise.all([
‎    db.prepare("SELECT COUNT(*) AS n FROM payments WHERE status='pending'").first(),
‎    db.prepare("SELECT COUNT(*) AS n FROM wallet_deposits WHERE status='pending'").first(),
‎    db.prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE status='pending'").first(),
‎    db.prepare("SELECT COUNT(*) AS n FROM winner_payouts WHERE status='submitted'").first()
‎  ]);
‎
‎  await send(
‎    env, chatId,
‎    `🛡️ <b>ADDIS ዕጣ Admin</b>\n\n` +
‎    `⏳ Pending Payments: ${payments?.n || 0}\n` +
‎    `📥 Pending Deposits: ${deposits?.n || 0}\n` +
‎    `📤 Pending Withdrawals: ${withdrawals?.n || 0}\n` +
‎    `🏆 Winner Payouts: ${payouts?.n || 0}\n\n` +
‎    `<b>Commands</b>\n` +
‎    `/pending\n` +
‎    `/set_telebirr NUMBER\n` +
‎    `/service on ወይም /service off\n` +
‎    `/draw_create NAME|TYPE|PRIZE|TOTAL|FEE_ETB|WINNERS\n` +
‎    `/prize_set DRAW_ID RANK AMOUNT_ETB\n` +
‎    `/draw_open DRAW_ID\n` +
‎    `/draw_close DRAW_ID\n` +
‎    `/draw_run DRAW_ID\n` +
‎    `/draw_publish DRAW_ID\n` +
‎    `/payouts`
‎  );
‎}
‎
‎async function setTelebirr(env, db, admin, chatId, number) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const clean = String(number || "").trim();
‎  if (!/^[0-9+]{9,16}$/.test(clean)) {
‎    await send(env, chatId, "ትክክለኛ Telebirr ቁጥር ያስገቡ።");
‎    return;
‎  }
‎
‎  const user = await userByTelegram(db, admin.id);
‎  await db.prepare(`
‎    UPDATE payment_settings
‎    SET telebirr_number = ?, updated_by = ?, updated_at = ?
‎    WHERE id = 1
‎  `).bind(clean, user.id, now()).run();
‎
‎  await audit(db, user.id, "telebirr_changed", "payment_settings", "1");
‎  await send(env, chatId, "✅ Telebirr ቁጥር ተቀይሯል።");
‎}
‎
‎async function setPaymentService(env, db, admin, chatId, enabled) {
‎  if (!isAdmin(env, admin.id)) return;
‎  const user = await userByTelegram(db, admin.id);
‎
‎  await db.prepare(`
‎    UPDATE payment_settings
‎    SET service_enabled = ?, updated_by = ?, updated_at = ?
‎    WHERE id = 1
‎  `).bind(enabled ? 1 : 0, user.id, now()).run();
‎
‎  await audit(db, user.id, "payment_service_changed",
‎    "payment_settings", "1", { enabled });
‎  await send(env, chatId, enabled
‎    ? "✅ የክፍያ አገልግሎት ተከፍቷል።"
‎    : "🔒 የክፍያ አገልግሎት ተዘግቷል።");
‎}
‎
‎async function createDraw(env, db, admin, chatId, raw) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const parts = raw.split("|").map(x => x.trim());
‎  if (parts.length !== 6) {
‎    await send(env, chatId,
‎      "አጠቃቀም፦\n/draw_create NAME|TYPE|PRIZE|TOTAL|FEE_ETB|WINNERS\nTYPE: cash ወይም physical");
‎    return;
‎  }
‎
‎  const [name, type, prize, totalText, feeText, winnersText] = parts;
‎  const total = Number(totalText);
‎  const fee = Number(feeText);
‎  const winnerCount = Number(winnersText);
‎
‎  if (
‎    !name || !prize ||
‎    !["cash", "physical"].includes(type) ||
‎    !Number.isInteger(total) || total < 1 || total > 100000 ||
‎    !Number.isFinite(fee) || fee <= 0 ||
‎    !Number.isInteger(winnerCount) || winnerCount < 1 ||
‎    winnerCount > total
‎  ) {
‎    await send(env, chatId, "የDraw መረጃው ትክክል አይደለም።");
‎    return;
‎  }
‎
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const timestamp = now();
‎  const drawId = newId();
‎
‎  await db.prepare(`
‎    INSERT INTO draws (
‎      id, name, prize_type, prize_name,
‎      total_numbers, entry_fee_cents,
‎      winner_count, unique_winners,
‎      status, created_by, created_at, updated_at
‎    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?, ?)
‎  `).bind(
‎    drawId, name, type, prize, total,
‎    Math.round(fee * 100), winnerCount,
‎    adminUser.id, timestamp, timestamp
‎  ).run();
‎
‎  await audit(db, adminUser.id, "draw_created", "draw", drawId);
‎  await send(
‎    env, chatId,
‎    `✅ Draw ተፈጥሯል።\nID: <code>${drawId}</code>\n` +
‎    `ከመክፈት በፊት /prize_set ይጠቀሙ።`
‎  );
‎}
‎
‎async function setPrize(env, db, admin, chatId, args) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const [drawId, rankText, amountText] = args.trim().split(/\s+/);
‎  const rank = Number(rankText);
‎  const amount = Number(amountText);
‎
‎  if (!drawId || !Number.isInteger(rank) || rank < 1 ||
‎      !Number.isFinite(amount) || amount < 0) {
‎    await send(env, chatId, "አጠቃቀም፦ /prize_set DRAW_ID RANK AMOUNT_ETB");
‎    return;
‎  }
‎
‎  const draw = await db.prepare(`
‎    SELECT id, winner_count, status FROM draws WHERE id = ?
‎  `).bind(drawId).first();
‎
‎  if (!draw || draw.status !== "draft" || rank > draw.winner_count) {
‎    await send(env, chatId, "Draw ID ወይም Prize ደረጃው ትክክል አይደለም።");
‎    return;
‎  }
‎
‎  await db.prepare(`
‎    INSERT INTO draw_prizes (id, draw_id, rank, amount_cents, created_at)
‎    VALUES (?, ?, ?, ?, ?)
‎    ON CONFLICT(draw_id, rank) DO UPDATE SET
‎      amount_cents = excluded.amount_cents
‎  `).bind(newId(), drawId, rank, Math.round(amount * 100), now()).run();
‎
‎  await send(env, chatId, "✅ የሽልማት ደረጃው ተመዝግቧል።");
‎}
‎
‎async function openDraw(env, db, admin, chatId, drawId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const draw = await db.prepare(
‎    "SELECT * FROM draws WHERE id = ?"
‎  ).bind(drawId).first();
‎
‎  if (!draw || draw.status !== "draft") {
‎    await send(env, chatId, "ይህ Draw ሊከፈት አይችልም።");
‎    return;
‎  }
‎
‎  const prizes = await db.prepare(`
‎    SELECT COUNT(*) AS n FROM draw_prizes WHERE draw_id = ?
‎  `).bind(drawId).first();
‎
‎  if (Number(prizes?.n || 0) !== Number(draw.winner_count)) {
‎    await send(env, chatId, `${draw.winner_count} የPrize ደረጃዎች ማስገባት አለብዎት።`);
‎    return;
‎  }
‎
‎  const updated = await db.prepare(`
‎    UPDATE draws SET status = 'open', updated_at = ?
‎    WHERE id = ? AND status = 'draft'
‎  `).bind(now(), drawId).run();
‎
‎  await send(env, chatId, updated.meta?.changes
‎    ? "✅ Draw ተከፍቷል።"
‎    : "Draw መክፈት አልተቻለም።");
‎}
‎
‎async function closeDraw(env, db, admin, chatId, drawId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const result = await db.prepare(`
‎    UPDATE draws SET status = 'closed', updated_at = ?
‎    WHERE id = ? AND status IN ('open', 'full')
‎  `).bind(now(), drawId).run();
‎
‎  await send(env, chatId, result.meta?.changes
‎    ? "🔒 Draw ተዘግቷል።"
‎    : "Draw መዝጋት አልተቻለም።");
‎}
‎
‎/* Seeded shuffle: the revealed seed and eligible snapshot are saved
‎   so the draw selection can be independently reproduced. */
‎async function seededShuffle(items, seedHex) {
‎  const result = [...items];
‎  let counter = 0;
‎
‎  async function randomBelow(max) {
‎    const range = 0x100000000;
‎    const limit = Math.floor(range / max) * max;
‎
‎    while (true) {
‎      const input = `${seedHex}:${counter++}`;
‎      const digest = await crypto.subtle.digest(
‎        "SHA-256", new TextEncoder().encode(input)
‎      );
‎      const bytes = new DataView(digest);
‎      const value = bytes.getUint32(0);
‎
‎      if (value < limit) return value % max;
‎    }
‎  }
‎
‎  for (let i = result.length - 1; i > 0; i--) {
‎    const j = await randomBelow(i + 1);
‎    [result[i], result[j]] = [result[j], result[i]];
‎  }
‎  return result;
‎}
‎
‎async function runDraw(env, db, admin, chatId, drawId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const draw = await db.prepare(
‎    "SELECT * FROM draws WHERE id = ?"
‎  ).bind(drawId).first();
‎
‎  if (!draw || !["closed", "full"].includes(draw.status)) {
‎    await send(env, chatId, "Draw መጀመሪያ መዘጋት አለበት።");
‎    return;
‎  }
‎
‎  const existing = await db.prepare(
‎    "SELECT id FROM draw_results WHERE draw_id = ?"
‎  ).bind(drawId).first();
‎
‎  if (existing) {
‎    await send(env, chatId, "ይህ Draw ውጤት ቀድሞ ተፈጥሯል።");
‎    return;
‎  }
‎
‎  const entryResult = await db.prepare(`
‎    SELECT e.id, e.user_id, e.number
‎    FROM entries e
‎    WHERE e.draw_id = ? AND e.status = 'paid'
‎    ORDER BY e.id
‎  `).bind(drawId).all();
‎
‎  const eligible = entryResult.results || [];
‎  if (eligible.length < Number(draw.winner_count)) {
‎    await send(env, chatId, "በቂ የተከፈሉ ተሳታፊዎች የሉም።");
‎    return;
‎  }
‎
‎  const prizeResult = await db.prepare(`
‎    SELECT rank, amount_cents FROM draw_prizes
‎    WHERE draw_id = ? ORDER BY rank
‎  `).bind(drawId).all();
‎
‎  const prizes = prizeResult.results || [];
‎  if (prizes.length !== Number(draw.winner_count)) {
‎    await send(env, chatId, "የሽልማት ደረጃዎች አልተሟሉም።");
‎    return;
‎  }
‎
‎  const seed = new Uint8Array(32);
‎  crypto.getRandomValues(seed);
‎  const seedHex = Array.from(seed)
‎    .map(x => x.toString(16).padStart(2, "0")).join("");
‎  const seedHash = await sha256Hex(seedHex);
‎
‎  const pool = await seededShuffle(eligible, seedHex);
‎  const timestamp = now();
‎  const adminUser = await userByTelegram(db, admin.id);
‎  const resultId = newId();
‎  const snapshot = JSON.stringify(eligible);
‎
‎  const statements = [
‎    db.prepare(`
‎      INSERT INTO draw_results (
‎        id, draw_id, eligible_entry_count,
‎        eligible_entry_snapshot, random_seed_hash,
‎        executed_at, executed_by
‎      ) VALUES (?, ?, ?, ?, ?, ?, ?)
‎    `).bind(
‎      resultId, drawId, eligible.length,
‎      snapshot, seedHash, timestamp, adminUser.id
‎    ),
‎
‎    db.prepare(`
‎      INSERT INTO draw_seed_commits (
‎        draw_id, seed_hex, seed_hash, committed_at, revealed_at
‎      ) VALUES (?, ?, ?, ?, ?)
‎    `).bind(drawId, seedHex, seedHash, timestamp, timestamp),
‎
‎    db.prepare(`
‎      INSERT INTO draw_result_audits (
‎        id, draw_id, algorithm, seed_hash, revealed_seed,
‎        eligible_count, winner_snapshot_json, created_at, revealed_at
‎      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
‎    `).bind(
‎      newId(), drawId, "sha256-seeded-fisher-yates-v1",
‎      seedHash, seedHex, eligible.length, "[]", timestamp, timestamp
‎    )
‎  ];
‎
‎  const selected = [];
‎
‎  for (let i = 0; i < Number(draw.winner_count); i++) {
‎    const entry = pool[i];
‎    const prize = prizes[i];
‎    const winnerId = newId();
‎    selected.push({
‎      winnerId,
‎      userId: entry.user_id,
‎      entryId: entry.id,
‎      number: entry.number,
‎      rank: prize.rank,
‎      prizeAmountCents: prize.amount_cents
‎    });
‎
‎    statements.push(db.prepare(`
‎      INSERT INTO winners (
‎        id, draw_id, entry_id, user_id,
‎        rank, prize_amount_cents, selected_at
‎      ) VALUES (?, ?, ?, ?, ?, ?, ?)
‎    `).bind(
‎      winnerId, drawId, entry.id, entry.user_id,
‎      prize.rank, prize.amount_cents, timestamp
‎    ));
‎
‎    statements.push(db.prepare(`
‎      INSERT INTO winner_payouts (
‎        id, winner_id, user_id, prize_type,
‎        status, created_at, updated_at
‎      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
‎    `).bind(
‎      newId(), winnerId, entry.user_id,
‎      draw.prize_type, timestamp, timestamp
‎    ));
‎  }
‎
‎  statements.push(db.prepare(`
‎    UPDATE draw_result_audits
‎    SET winner_snapshot_json = ?
‎    WHERE draw_id = ?
‎  `).bind(JSON.stringify(selected), drawId));
‎
‎  statements.push(db.prepare(`
‎    UPDATE draws SET status = 'completed', updated_at = ?
‎    WHERE id = ? AND status IN ('closed', 'full')
‎  `).bind(timestamp, drawId));
‎
‎  try {
‎    await db.batch(statements);
‎  } catch (error) {
‎    console.error("Draw execution failed", error);
‎    await send(env, chatId, "የዕጣ ውጤት ማውጣት አልተሳካም። DB ይፈትሹ።");
‎    return;
‎  }
‎
‎  await audit(db, adminUser.id, "draw_executed", "draw", drawId, {
‎    eligibleCount: eligible.length,
‎    seedHash
‎  });
‎
‎  await send(
‎    env, chatId,
‎    `✅ <b>የዕጣ ውጤት ተፈጥሯል።</b>\n\n` +
‎    `Draw: ${escapeHtml(draw.name)}\n` +
‎    `ተሳታፊዎች: ${eligible.length}\n` +
‎    `Seed Hash: <code>${seedHash}</code>\n\n` +
‎    `Seed Reveal: <code>${seedHex}</code>\n\n` +
‎    `ውጤቱን ለማተም፦\n/draw_publish ${drawId}`
‎  );
‎}
‎
‎async function publishDraw(env, db, admin, chatId, drawId) {
‎  if (!isAdmin(env, admin.id)) return;
‎
‎  const result = await db.prepare(`
‎    UPDATE draw_results SET published_at = ?
‎    WHERE draw_id = ? AND published_at IS NULL
‎  `).bind(now(), drawId).run();
‎
‎  if (!result.meta?.changes) {
‎    await send(env, chatId, "ውጤቱ አልተገኘም ወይም ቀድሞ ታትሟል።");
‎    return;
‎  }
‎
‎  await notifyWinners(env, db, drawId);
‎  await send(env, chatId, "🏆 የዕጣ ውጤቱ ታትሟል። አሸናፊዎች ማሳወቂያ ተልኳል።");
‎}
‎
‎// -------------------- ADMIN QUEUES --------------------
‎
‎async function showPending(env, db, chatId) {
‎  if (!isAdmin(env, chatId)) return;
‎
‎  const payments = await db.prepare(`
‎    SELECT p.id, p.amount_cents, p.transaction_reference,
‎      e.number, d.name AS draw_name, u.telegram_id
‎    FROM payments p
‎    JOIN entries e ON e.id = p.entry_id
‎    JOIN draws d ON d.id = e.draw_id
‎    JOIN users u ON u.id = p.user_id
‎    WHERE p.status = 'pending'
‎    ORDER BY p.created_at LIMIT 15
‎  `).all();
‎
‎  for (const p of payments.results || []) {
‎    await send(env, chatId,
‎      `💳 <b>Payment</b>\n${escapeHtml(p.draw_name)} #${p.number}\n` +
‎      `Amount: ${(p.amount_cents / 100).toFixed(2)} ETB\n` +
‎      `Reference: <code>${escapeHtml(p.transaction_reference)}</code>\n` +
‎      `User: <code>${escapeHtml(p.telegram_id)}</code>`,
‎      { inline_keyboard: [[
‎        { text: "✅ Approve", callback_data: `approve:${p.id}` },
‎        { text: "❌ Reject", callback_data: `reject:${p.id}` }
‎      ]] }
‎    );
‎  }
‎
‎  const deposits = await db.prepare(`
‎    SELECT id, amount_cents, transaction_reference, user_id
‎    FROM wallet_deposits WHERE status = 'pending' LIMIT 15
‎  `).all();
‎
‎  for (const d of deposits.results || []) {
‎    await send(env, chatId,
‎      `📥 <b>Deposit</b>\n${(d.amount_cents / 100).toFixed(2)} ETB\n` +
‎      `Reference: <code>${escapeHtml(d.transaction_reference)}</code>`,
‎      { inline_keyboard: [[
‎        { text: "✅ Approve", callback_data: `deposit_approve:${d.id}` },
‎        { text: "❌ Reject", callback_data: `deposit_reject:${d.id}` }
‎      ]] }
‎    );
‎  }
‎}
‎
‎async function showPayouts(env, db, chatId) {
‎  if (!isAdmin(env, chatId)) return;
‎
‎  const result = await db.prepare(`
‎    SELECT wp.winner_id, wp.prize_type, wp.status,
‎      wp.telebirr_number, wp.recipient_full_name, wp.recipient_phone,
‎      u.telegram_id
‎    FROM winner_payouts wp JOIN users u ON u.id = wp.user_id
‎    WHERE wp.status IN ('submitted', 'approved')
‎    ORDER BY wp.updated_at LIMIT 20
‎  `).all();
‎
‎  if (!result.results?.length) {
‎    await send(env, chatId, "የሚጠባበቅ የWinner Payout የለም።");
‎    return;
‎  }
‎
‎  for (const p of result.results) {
‎    await send(
‎      env, chatId,
‎      `🏆 <b>Winner Payout</b>\n` +
‎      `Type: ${p.prize_type}\nStatus: ${p.status}\n` +
‎      `User: <code>${escapeHtml(p.telegram_id)}</code>\n` +
‎      (p.telebirr_number ? `Telebirr: <code>${escapeHtml(p.telebirr_number)}</code>\n` : "") +
‎      (p.recipient_full_name ? `Name: ${escapeHtml(p.recipient_full_name)}\n` : "") +
‎      (p.recipient_phone ? `Phone: <code>${escapeHtml(p.recipient_phone)}</code>\n` : ""),
‎      { inline_keyboard: [[
‎        ...(p.status === "submitted" ? [{
‎          text: "✅ Approve",
‎          callback_data: `payout_approve:${p.winner_id}`
‎        }] : []),
‎        ...(p.status === "approved" ? [{
‎          text: "🏁 Mark Paid",
‎          callback_data: `payout_paid:${p.winner_id}`
‎        }] : [])
‎      ]] }
‎    );
‎  }
‎}
‎
‎// -------------------- CALLBACK HANDLER --------------------
‎
‎async function handleCallback(env, db, query) {
‎  const data = String(query.data || "");
‎  const chatId = query.message?.chat?.id;
‎  const from = query.from;
‎
‎  await callbackAnswer(env, query.id);
‎
‎  if (data === "occupied") {
‎    await callbackAnswer(env, query.id, "ይህ ቁጥር ተይዟል።");
‎    return;
‎  }
‎
‎  const user = await register(db, env, from);
‎  const [action, ...parts] = data.split(":");
‎
‎  if (action === "draw") {
‎    await showDraw(env, db, chatId, parts[0]);
‎  } else if (action === "numbers") {
‎    await showNumbers(env, db, chatId, parts[0], Number(parts[1]));
‎  } else if (action === "reserve") {
‎    await reserveNumber(env, db, chatId, user, parts[0], Number(parts[1]));
‎  } else if (action === "approve" || action === "reject") {
‎    if (!isAdmin(env, from.id)) return;
‎    await reviewPayment(env, db, from, parts[0], action === "approve");
‎  } else if (action === "wallet_deposit") {
‎    await startDeposit(env, db, chatId, user);
‎  } else if (action === "wallet_withdraw") {
‎    await startWithdrawal(env, db, chatId, user);
‎  } else if (action === "deposit_approve" || action === "deposit_reject") {
‎    if (!isAdmin(env, from.id)) return;
‎    await reviewDeposit(env, db, from, parts[0], action === "deposit_approve");
‎  } else if (action === "withdraw_paid" || action === "withdraw_reject") {
‎    if (!isAdmin(env, from.id)) return;
‎    await reviewWithdrawal(env, db, from, parts[0],
‎      action === "withdraw_paid" ? "paid" : "reject");
‎  } else if (action === "payout_approve") {
‎    if (!isAdmin(env, from.id)) return;
‎    await approvePayout(env, db, from, parts[0]);
‎  } else if (action === "payout_paid") {
‎    if (!isAdmin(env, from.id)) return;
‎    await markPayoutPaid(env, db, from, parts[0]);
‎  }
‎}
‎
‎// -------------------- MESSAGE HANDLER --------------------
‎
‎async function handleMessage(env, db, message) {
‎  const from = message.from;
‎  if (!from || from.is_bot) return;
‎
‎  const chatId = message.chat.id;
‎  const text = String(message.text || "").trim();
‎  const user = await register(db, env, from);
‎
‎  if (text === "/start" || text.startsWith("/start ")) {
‎    await clearState(db, user.id);
‎    await home(env, chatId, from.first_name);
‎    return;
‎  }
‎
‎  if (text === "/help" || text === "ℹ️ እገዛ") {
‎    await send(env, chatId,
‎      "ℹ️ <b>ADDIS ዕጣ እገዛ</b>\n\n" +
‎      "🎟️ ዕጣዎች — ክፍት ዕጣዎች\n" +
‎      "💰 Wallet — ቀሪ ሂሳብ\n" +
‎      "📥 Deposit — Wallet ገንዘብ ማስገባት\n" +
‎      "📤 Withdrawal — Wallet ገንዘብ ማውጣት\n" +
‎      "📜 የእኔ ቁጥሮች — የገዙት ቁጥሮች\n" +
‎      "🏆 ውጤቶች — የታተሙ ውጤቶች");
‎    return;
‎  }
‎
‎  if (text === "🎟️ ዕጣዎች" || text === "/draws") {
‎    await showDraws(env, db, chatId);
‎    return;
‎  }
‎
‎  if (text === "💰 Wallet" || text === "/wallet") {
‎    await showWallet(env, db, chatId, user);
‎    return;
‎  }
‎
‎  if (text === "📥 Deposit" || text === "/deposit") {
‎    await startDeposit(env, db, chatId, user);
‎    return;
‎  }
‎
‎  if (text === "📤 Withdrawal" || text === "/withdraw") {
‎    await startWithdrawal(env, db, chatId, user);
‎    return;
‎  }
‎
‎  if (text === "📜 የእኔ ቁጥሮች") {
‎    await showMyEntries(env, db, chatId, user);
‎    return;
‎  }
‎
‎  if (text === "🏆 ውጤቶች") {
‎    await showResults(env, db, chatId);
‎    return;
‎  }
‎
‎  if (text === "/admin" && isAdmin(env, from.id)) {
‎    await adminPanel(env, db, chatId);
‎    return;
‎  }
‎
‎  if (text === "/pending" && isAdmin(env, from.id)) {
‎    await showPending(env, db, chatId);
‎    return;
‎  }
‎
‎  if (text === "/payouts" && isAdmin(env, from.id)) {
‎    await showPayouts(env, db, chatId);
‎    return;
‎  }
‎
‎  if (text.startsWith("/set_telebirr ")) {
‎    await setTelebirr(env, db, from, chatId, text.slice(14));
‎    return;
‎  }
‎
‎  if (text === "/service on" || text === "/service off") {
‎    await setPaymentService(env, db, from, chatId, text === "/service on");
‎    return;
‎  }
‎
‎  if (text.startsWith("/draw_create ")) {
‎    await createDraw(env, db, from, chatId, text.slice(13));
‎    return;
‎  }
‎
‎  if (text.startsWith("/prize_set ")) {
‎    await setPrize(env, db, from, chatId, text.slice(11));
‎    return;
‎  }
‎
‎  if (text.startsWith("/draw_open ")) {
‎    await openDraw(env, db, from, chatId, text.slice(11).trim());
‎    return;
‎  }
‎
‎  if (text.startsWith("/draw_close ")) {
‎    await closeDraw(env, db, from, chatId, text.slice(12).trim());
‎    return;
‎  }
‎
‎  if (text.startsWith("/draw_run ")) {
‎    await runDraw(env, db, from, chatId, text.slice(10).trim());
‎    return;
‎  }
‎
‎  if (text.startsWith("/draw_publish ")) {
‎    await publishDraw(env, db, from, chatId, text.slice(14).trim());
‎    return;
‎  }
‎
‎  const state = await getState(db, user.id);
‎
‎  if (state?.state === "entry_reference" && text) {
‎    await submitReference(env, db, chatId, user, text);
‎    return;
‎  }
‎
‎  if (state?.state === "entry_receipt" && message.photo?.length) {
‎    await submitReceipt(env, db, chatId, user,
‎      message.photo[message.photo.length - 1].file_id);
‎    return;
‎  }
‎
‎  if (state?.state === "entry_receipt" && message.document) {
‎    await submitReceipt(env, db, chatId, user, message.document.file_id);
‎    return;
‎  }
‎
‎  if (state?.state === "deposit_amount" && text) {
‎    const amount = Number(text);
‎    const cents = Math.round(amount * 100);
‎    if (!Number.isSafeInteger(cents) || cents < 100 || cents > 100000000) {
‎      await send(env, chatId, "ትክክለኛ መጠን ያስገቡ። ዝቅተኛው 1 ብር ነው።");
‎      return;
‎    }
‎
‎    const settings = await getPaymentSettings(db);
‎    if (!paymentServiceOpen(settings)) {
‎      await clearState(db, user.id);
‎      await send(env, chatId, "⏰ የክፍያ አገልግሎት አሁን ዝግ ነው።");
‎      return;
‎    }
‎
‎    await setState(db, user.id, "deposit_reference", { amountCents: cents });
‎    await send(env, chatId,
‎      `📱 Telebirr፦ <code>${escapeHtml(settings?.telebirr_number || env.TELEBIRR_NUMBER || "Admin ያነጋግሩ")}</code>\n` +
‎      `መጠን፦ ${(cents / 100).toFixed(2)} ብር\n\n` +
‎      "ክፍያውን ከፈጸሙ በኋላ Transaction Reference ይላኩ።");
‎    return;
‎  }
‎
‎  if (state?.state === "deposit_reference" && text) {
‎    await submitDepositReference(env, db, chatId, user, text);
‎    return;
‎  }
‎
‎  if (state?.state === "deposit_receipt" && message.photo?.length) {
‎    await submitDepositReceipt(env, db, chatId, user,
‎      message.photo[message.photo.length - 1].file_id);
‎    return;
‎  }
‎
‎  if (state?.state === "deposit_receipt" && message.document) {
‎    await submitDepositReceipt(env, db, chatId, user, message.document.file_id);
‎    return;
‎  }
‎
‎  if (state?.state === "withdraw_amount" && text) {
‎    await submitWithdrawalAmount(env, db, chatId, user, text);
‎    return;
‎  }
‎
‎  if (state?.state === "withdraw_number" && text) {
‎    await submitWithdrawalNumber(env, db, chatId, user, text);
‎    return;
‎  }
‎
‎  if (
‎    state?.state === "winner_telebirr" ||
‎    state?.state === "winner_name" ||
‎    state?.state === "winner_phone"
‎  ) {
‎    if (text) {
‎      await submitWinnerDetails(env, db, chatId, user, text);
‎    }
‎    return;
‎  }
‎
‎  await send(env, chatId,
‎    "እባክዎ ከታች ካሉት አማራጮች ይምረጡ።",
‎    homeKeyboard());
‎}
‎
‎// -------------------- WORKER ENTRY POINT --------------------
‎
‎export default {
‎  async fetch(request, env) {
‎    const url = new URL(request.url);
‎
‎    if (request.method === "GET" && url.pathname === "/health") {
‎      return json({
‎        ok: true,
‎        service: "addis-egata-bot-api",
‎        database_binding: Boolean(env.DB),
‎        telegram_configured: Boolean(env.TELEGRAM_BOT_TOKEN)
‎      });
‎    }
‎
‎    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
‎      return json({ ok: false, error: "Not found" }, 404);
‎    }
‎
‎    const suppliedSecret = request.headers.get(
‎      "X-Telegram-Bot-Api-Secret-Token"
‎    );
‎
‎    if (
‎      !env.TELEGRAM_WEBHOOK_SECRET ||
‎      suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET
‎    ) {
‎      return json({ ok: false, error: "Unauthorized" }, 401);
‎    }
‎
‎    if (!env.DB) {
‎      return json({ ok: false, error: "D1 binding DB is missing" }, 500);
‎    }
‎
‎    const contentLength = Number(request.headers.get("content-length") || 0);
‎    if (contentLength > 1024 * 1024) {
‎      return json({ ok: false, error: "Request too large" }, 413);
‎    }
‎
‎    let update;
‎    try {
‎      update = await request.json();
‎    } catch {
‎      return json({ ok: false, error: "Invalid JSON" }, 400);
‎    }
‎
‎    if (!Number.isSafeInteger(update.update_id)) {
‎      return json({ ok: false, error: "Invalid update ID" }, 400);
‎    }
‎
‎
let claimed = false;

try {
  const claimStatus = await claimUpdate(env.DB, update.update_id);

  if (claimStatus === "processed") {
    return json({ ok: true, duplicate: true });
  }

  if (claimStatus === "busy") {
    // Telegram should retry instead of treating an active update
    // as successfully processed.
    return json({ ok: false, error: "Update is being processed" }, 503);
  }

  claimed = true;

‎      if (update.callback_query) {
‎        await handleCallback(env, env.DB, update.callback_query);
‎      } else if (update.message) {
‎        await handleMessage(env, env.DB, update.message);
‎      }
‎
‎      await finishUpdate(env.DB, update.update_id);
‎      return json({ ok: true });
‎    } catch (error) {
‎      console.error("Telegram update failed:", error?.stack || error);
‎
‎      if (claimed) {
‎        try {
‎          await releaseUpdate(env.DB, update.update_id);
‎        } catch (releaseError) {
‎          console.error("Update release failed:", releaseError);
‎        }
‎      }
‎
‎      return json({ ok: false, error: "Update processing failed" }, 500);
‎    }
‎  }
‎};
‎
