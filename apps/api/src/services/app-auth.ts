
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { pool } from "../db.js";

const scrypt = promisify(scryptCallback);

const SESSION_DAYS = 30;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export type AppAuthUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
};

type CredentialRow = {
  user_id: string;
  login_identifier: string;
  password_hash: string;
  salt: string;
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
};

function getPool() {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }
  return pool;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function validateIdentifier(value: string): string {
  const identifier = normalizeIdentifier(value);

  if (
    identifier.length < 3 ||
    identifier.length > 255 ||
    !/^[a-z0-9@.+_-]+$/.test(identifier)
  ) {
    throw new Error("INVALID_LOGIN_IDENTIFIER");
  }

  return identifier;
}

function validatePassword(password: string): void {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error("INVALID_PASSWORD_LENGTH");
  }
}

async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const result = (await scrypt(
    password,
    salt,
    64,
  )) as Buffer;

  return result.toString("hex");
}

function mapUser(row: CredentialRow): AppAuthUser {
  return {
    id: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
  };
}

export async function registerAppUser(input: {
  loginIdentifier: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<AppAuthUser> {
  const db = getPool();
  const identifier = validateIdentifier(
    input.loginIdentifier,
  );
  validatePassword(input.password);

  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;

  if (
    (firstName?.length ?? 0) > 255 ||
    (lastName?.length ?? 0) > 255
  ) {
    throw new Error("NAME_TOO_LONG");
  }

  const salt = randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(
    input.password,
    salt,
  );

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT 1
       FROM app_credentials
       WHERE login_identifier = $1
       LIMIT 1`,
      [identifier],
    );

    if (existing.rows.length > 0) {
      throw new Error("LOGIN_IDENTIFIER_ALREADY_USED");
    }

    const userResult = await client.query<{
      id: string;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      is_admin: boolean;
    }>(
      `INSERT INTO users (
         telegram_id,
         username,
         first_name,
         last_name,
         is_admin
       )
       VALUES (NULL, NULL, $1, $2, FALSE)
       RETURNING id, username, first_name, last_name, is_admin`,
      [firstName, lastName],
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO app_credentials (
         user_id,
         login_identifier,
         password_hash,
         salt
       )
       VALUES ($1, $2, $3, $4)`,
      [user.id, identifier, passwordHash, salt],
    );

    await client.query("COMMIT");

    return {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: user.is_admin,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loginAppUser(input: {
  loginIdentifier: string;
  password: string;
}): Promise<{
  user: AppAuthUser;
  token: string;
  expiresAt: string;
}> {
  const db = getPool();
  const identifier = validateIdentifier(
    input.loginIdentifier,
  );

  if (
    typeof input.password !== "string" ||
    input.password.length === 0 ||
    input.password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const result = await db.query<CredentialRow>(
    `SELECT
       c.user_id,
       c.login_identifier,
       c.password_hash,
       c.salt,
       u.id,
       u.username,
       u.first_name,
       u.last_name,
       u.is_admin
     FROM app_credentials c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.login_identifier = $1
     LIMIT 1`,
    [identifier],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const candidate = await hashPassword(
    input.password,
    row.salt,
  );

  const expected = Buffer.from(row.password_hash, "hex");
  const actual = Buffer.from(candidate, "hex");

  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashPassword(
    token,
    "addis-egata-session-token",
  );

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );

  await db.query(
    `INSERT INTO app_sessions (
       user_id,
       token_hash,
       expires_at
     )
     VALUES ($1, $2, $3)`,
    [row.user_id, tokenHash, expiresAt.toISOString()],
  );

  return {
    user: mapUser(row),
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getAppUserByToken(
  token: string,
): Promise<AppAuthUser | null> {
  if (
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 256
  ) {
    return null;
  }

  const db = getPool();
  const tokenHash = await hashPassword(
    token,
    "addis-egata-session-token",
  );

  const result = await db.query<CredentialRow>(
    `SELECT
       c.user_id,
       c.login_identifier,
       c.password_hash,
       c.salt,
       u.id,
       u.username,
       u.first_name,
       u.last_name,
       u.is_admin
     FROM app_sessions s
     INNER JOIN users u ON u.id = s.user_id
     INNER JOIN app_credentials c ON c.user_id = u.id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  return result.rows[0]
    ? mapUser(result.rows[0])
    : null;
}

export async function logoutAppUser(
  token: string,
): Promise<void> {
  if (
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 256
  ) {
    return;
  }

  const db = getPool();
  const tokenHash = await hashPassword(
    token,
    "addis-egata-session-token",
  );

  await db.query(
    `DELETE FROM app_sessions WHERE token_hash = $1`,
    [tokenHash],
  );
}
