import { pool } from "../db.js";
import type { Entry } from "../types.js";

type EntryRow = {
  id: string;
  draw_id: string;
  user_id: string;
  number: number;
  status: Entry["status"];
  reserved_until: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    drawId: row.draw_id,
    userId: row.user_id,
    number: row.number,
    status: row.status,
    reservedUntil: row.reserved_until,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function reserveNumber(
  drawId: string,
  userId: string,
  number: number,
  reservationMinutes = 15,
): Promise<Entry> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!Number.isInteger(number) || number < 1) {
    throw new Error("INVALID_NUMBER");
  }

  if (
    !Number.isInteger(reservationMinutes) ||
    reservationMinutes < 1 ||
    reservationMinutes > 60
  ) {
    throw new Error("INVALID_RESERVATION_TIME");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const drawResult = await client.query<{
      total_numbers: number;
      status: string;
      entry_fee: string;
    }>(
      `
        SELECT
          total_numbers,
          status,
          entry_fee
        FROM draws
        WHERE id = $1
        FOR UPDATE
      `,
      [drawId],
    );

    if (drawResult.rows.length === 0) {
      throw new Error("DRAW_NOT_FOUND");
    }

    const draw = drawResult.rows[0];

    if (number > draw.total_numbers) {
      throw new Error("NUMBER_OUT_OF_RANGE");
    }

    if (draw.status !== "open") {
      throw new Error("DRAW_NOT_OPEN");
    }

    await client.query(
      `
        UPDATE entries
        SET
          status = 'expired',
          updated_at = NOW()
        WHERE draw_id = $1
          AND status IN ('reserved', 'pending_payment')
          AND reserved_until IS NOT NULL
          AND reserved_until <= NOW()
      `,
      [drawId],
    );

    const existingResult = await client.query<EntryRow>(
      `
        SELECT
          id,
          draw_id,
          user_id,
          number,
          status,
          reserved_until,
          paid_at,
          created_at,
          updated_at
        FROM entries
        WHERE draw_id = $1
          AND number = $2
        LIMIT 1
        FOR UPDATE
      `,
      [drawId, number],
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      if (
        existing.status === "reserved" ||
        existing.status === "pending_payment" ||
        existing.status === "paid"
      ) {
        throw new Error("NUMBER_UNAVAILABLE");
      }

      await client.query(
        `
          DELETE FROM entries
          WHERE id = $1
        `,
        [existing.id],
      );
    }

    const reservationResult = await client.query<EntryRow>(
      `
        INSERT INTO entries (
          draw_id,
          user_id,
          number,
          status,
          reserved_until
        )
        VALUES (
          $1,
          $2,
          $3,
          'reserved',
          NOW() + ($4 * INTERVAL '1 minute')
        )
        RETURNING
          id,
          draw_id,
          user_id,
          number,
          status,
          reserved_until,
          paid_at,
          created_at,
          updated_at
      `,
      [drawId, userId, number, reservationMinutes],
    );

    await client.query("COMMIT");

    return mapEntry(reservationResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getEntryById(
  entryId: string,
): Promise<Entry | null> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<EntryRow>(
    `
      SELECT
        id,
        draw_id,
        user_id,
        number,
        status,
        reserved_until,
        paid_at,
        created_at,
        updated_at
      FROM entries
      WHERE id = $1
      LIMIT 1
    `,
    [entryId],
  );

  return result.rows.length > 0
    ? mapEntry(result.rows[0])
    : null;
}

export async function getUserEntries(
  userId: string,
): Promise<Entry[]> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<EntryRow>(
    `
      SELECT
        id,
        draw_id,
        user_id,
        number,
        status,
        reserved_until,
        paid_at,
        created_at,
        updated_at
      FROM entries
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows.map(mapEntry);
}
