import { pool } from "../db.js";
import type { TelegramUser } from "./telegram.js";

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

type UserRow = {
  id: string;
  telegram_id: string | number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateTelegramUser(user: TelegramUser): void {
  if (
    !Number.isSafeInteger(user.id) ||
    user.id <= 0
  ) {
    throw new Error("INVALID_TELEGRAM_USER_ID");
  }

  if (
    user.username !== undefined &&
    user.username.length > 255
  ) {
    throw new Error("TELEGRAM_USERNAME_TOO_LONG");
  }

  if (
    user.first_name !== undefined &&
    user.first_name.length > 255
  ) {
    throw new Error("TELEGRAM_FIRST_NAME_TOO_LONG");
  }

  if (
    user.last_name !== undefined &&
    user.last_name.length > 255
  ) {
    throw new Error("TELEGRAM_LAST_NAME_TOO_LONG");
  }
}

export async function getUserById(
  userId: string,
): Promise<User | null> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  const result = await pool.query<UserRow>(
    `
      SELECT
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        is_admin,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows.length > 0
    ? mapUser(result.rows[0])
    : null;
}

export async function getUserByTelegramId(
  telegramId: number,
): Promise<User | null> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new Error("INVALID_TELEGRAM_USER_ID");
  }

  const result = await pool.query<UserRow>(
    `
      SELECT
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        is_admin,
        created_at,
        updated_at
      FROM users
      WHERE telegram_id = $1
      LIMIT 1
    `,
    [telegramId],
  );

  return result.rows.length > 0
    ? mapUser(result.rows[0])
    : null;
}

export async function upsertTelegramUser(
  telegramUser: TelegramUser,
): Promise<User> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  validateTelegramUser(telegramUser);

  const result = await pool.query<UserRow>(
    `
      INSERT INTO users (
        telegram_id,
        username,
        first_name,
        last_name
      )
      VALUES (
        $1,
        $2,
        $3,
        $4
      )
      ON CONFLICT (telegram_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = NOW()
      RETURNING
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        is_admin,
        created_at,
        updated_at
    `,
    [
      telegramUser.id,
      telegramUser.username ?? null,
      telegramUser.first_name ?? null,
      telegramUser.last_name ?? null,
    ],
  );

  return mapUser(result.rows[0]);
}

export async function isAdminUser(
  userId: string,
): Promise<boolean> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!userId.trim()) {
    return false;
  }

  const result = await pool.query<{
    is_admin: boolean;
  }>(
    `
      SELECT is_admin
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows.length > 0 &&
    result.rows[0].is_admin === true;
}
