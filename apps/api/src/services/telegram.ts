import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramAuthResult {
  user: TelegramUser;
  authDate: number;
  queryId?: string;
}

const DEFAULT_MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  }

  return token;
}

function getMaxAuthAgeSeconds(): number {
  const configured = Number(
    process.env.TELEGRAM_MAX_AUTH_AGE_SECONDS,
  );

  if (
    Number.isInteger(configured) &&
    configured > 0 &&
    configured <= 7 * 24 * 60 * 60
  ) {
    return configured;
  }

  return DEFAULT_MAX_AUTH_AGE_SECONDS;
}

function buildDataCheckString(
  params: URLSearchParams,
): string {
  return Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function calculateTelegramHash(
  dataCheckString: string,
  botToken: string,
): Buffer {
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
}

function isValidHash(
  receivedHash: string,
  calculatedHash: Buffer,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return false;
  }

  const receivedBuffer = Buffer.from(
    receivedHash,
    "hex",
  );

  if (receivedBuffer.length !== calculatedHash.length) {
    return false;
  }

  return timingSafeEqual(
    receivedBuffer,
    calculatedHash,
  );
}

function parseTelegramUser(
  rawUser: string | null,
): TelegramUser {
  if (!rawUser) {
    throw new Error("TELEGRAM_USER_MISSING");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawUser);
  } catch {
    throw new Error("TELEGRAM_USER_INVALID");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed)
  ) {
    throw new Error("TELEGRAM_USER_INVALID");
  }

  const user = parsed as Record<string, unknown>;

  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0
  ) {
    throw new Error("TELEGRAM_USER_INVALID");
  }

  return {
    id: user.id,
    first_name:
      typeof user.first_name === "string"
        ? user.first_name
        : undefined,
    last_name:
      typeof user.last_name === "string"
        ? user.last_name
        : undefined,
    username:
      typeof user.username === "string"
        ? user.username
        : undefined,
    language_code:
      typeof user.language_code === "string"
        ? user.language_code
        : undefined,
    is_premium:
      typeof user.is_premium === "boolean"
        ? user.is_premium
        : undefined,
  };
}

export function validateTelegramInitData(
  initData: string,
): TelegramAuthResult {
  const normalizedInitData = initData.trim();

  if (!normalizedInitData) {
    throw new Error("TELEGRAM_INIT_DATA_REQUIRED");
  }

  if (normalizedInitData.length > 10000) {
    throw new Error("TELEGRAM_INIT_DATA_TOO_LONG");
  }

  const params = new URLSearchParams(
    normalizedInitData,
  );

  const receivedHash = params.get("hash");

  if (!receivedHash) {
    throw new Error("TELEGRAM_HASH_MISSING");
  }

  const authDateRaw = params.get("auth_date");

  if (!authDateRaw) {
    throw new Error("TELEGRAM_AUTH_DATE_MISSING");
  }

  const authDate = Number(authDateRaw);

  if (
    !Number.isInteger(authDate) ||
    authDate <= 0
  ) {
    throw new Error("TELEGRAM_AUTH_DATE_INVALID");
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = getMaxAuthAgeSeconds();

  if (authDate > now + 60) {
    throw new Error("TELEGRAM_AUTH_DATE_IN_FUTURE");
  }

  if (now - authDate > maxAge) {
    throw new Error("TELEGRAM_INIT_DATA_EXPIRED");
  }

  const dataCheckString =
    buildDataCheckString(params);

  const calculatedHash = calculateTelegramHash(
    dataCheckString,
    getBotToken(),
  );

  if (!isValidHash(receivedHash, calculatedHash)) {
    throw new Error("TELEGRAM_INIT_DATA_INVALID");
  }

  const user = parseTelegramUser(
    params.get("user"),
  );

  const queryId = params.get("query_id") ?? undefined;

  return {
    user,
    authDate,
    queryId,
  };
}
