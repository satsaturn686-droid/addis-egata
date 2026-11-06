
/**
 * ADDIS EGATA — Security utilities
 * Cloudflare Workers + D1
 *
 * These helpers must be integrated into index.js
 * before they become active.
 */

const MAX_UINT32_RANGE = 0x100000000;

/**
 * Prevents the same Telegram update from being
 * processed more than once.
 *
 * Returns true only for the first successful claim.
 */
export async function claimTelegramUpdate(db, updateId) {
  if (!Number.isSafeInteger(updateId) || updateId < 0) {
    throw new Error("Invalid Telegram update_id");
  }

  const result = await db.prepare(`
    INSERT OR IGNORE INTO processed_telegram_updates (
      update_id,
      processed_at
    )
    VALUES (?, ?)
  `).bind(updateId, new Date().toISOString()).run();

  return Number(result.meta?.changes || 0) === 1;
}

/**
 * Creates a D1 statement for the global payment
 * reference registry.
 *
 * Include this statement in the SAME db.batch()
 * as the payment/deposit INSERT.
 */
export function paymentReferenceStatement(
  db,
  reference,
  kind,
  entityId,
  timestamp = new Date().toISOString()
) {
  const cleanReference = String(reference || "").trim();

  if (
    cleanReference.length < 5 ||
    cleanReference.length > 100
  ) {
    throw new Error("Invalid payment reference");
  }

  if (!["entry", "wallet_deposit"].includes(kind)) {
    throw new Error("Invalid payment reference kind");
  }

  if (!entityId) {
    throw new Error("Payment entity ID is required");
  }

  return db.prepare(`
    INSERT INTO payment_references (
      reference,
      kind,
      entity_id,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    cleanReference,
    kind,
    String(entityId),
    timestamp
  );
}

/**
 * Returns a cryptographically secure integer
 * from 0 up to (but not including) maxExclusive.
 *
 * Rejection sampling avoids modulo bias.
 */
export function secureRandomInt(maxExclusive) {
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive < 1 ||
    maxExclusive > MAX_UINT32_RANGE
  ) {
    throw new Error("Invalid random integer range");
  }

  if (maxExclusive === 1) return 0;

  const acceptedLimit =
    Math.floor(MAX_UINT32_RANGE / maxExclusive) *
    maxExclusive;

  const value = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(value);

    if (value[0] < acceptedLimit) {
      return value[0] % maxExclusive;
    }
  }
}

/**
 * Fisher-Yates shuffle using unbiased secure
 * random integers.
 */
export function secureShuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Checks the configured payment service hours
 * using the Africa/Addis_Ababa timezone.
 *
 * Opening time is inclusive.
 * Closing time is exclusive.
 */
export function isPaymentServiceOpen(
  settings,
  date = new Date()
) {
  if (!settings || Number(settings.service_enabled) !== 1) {
    return false;
  }

  const timezone =
    settings.timezone || "Africa/Addis_Ababa";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);

  const hour = Number(
    parts.find(part => part.type === "hour")?.value
  );

  const minute = Number(
    parts.find(part => part.type === "minute")?.value
  );

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return false;
  }

  const currentMinutes = hour * 60 + minute;

  const openTime = String(
    settings.service_open_time || "03:00"
  );

  const closeTime = String(
    settings.service_close_time || "12:00"
  );

  const parseTime = value => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new Error("Invalid payment service time");
    }

    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };

  const openMinutes = parseTime(openTime);
  const closeMinutes = parseTime(closeTime);

  if (openMinutes === closeMinutes) return false;

  if (openMinutes < closeMinutes) {
    return (
      currentMinutes >= openMinutes &&
      currentMinutes < closeMinutes
    );
  }

  // Supports service hours crossing midnight.
  return (
    currentMinutes >= openMinutes ||
    currentMinutes < closeMinutes
  );
}
