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

type DrawRow = {
  total_numbers: number;
  status: string;
  starts_at: string | null;
  deadline_at: string | null;
};

const RESERVATION_MINUTES = 30;

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

function isBeforeStart(startsAt: string | null): boolean {
  if (!startsAt) {
    return false;
  }

  return new Date(startsAt).getTime() > Date.now();
}

function isAfterDeadline(deadlineAt: string | null): boolean {
  if (!deadlineAt) {
    return false;
  }

  return new Date(deadlineAt).getTime() <= Date.now();
}

export async function reserveNumber(
  drawId: string,
  userId: string,
  number: number,
): Promise<Entry> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!drawId.trim()) {
    throw new Error("INVALID_DRAW_ID");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  if (!Number.isInteger(number) || number < 1) {
    throw new Error("INVALID_NUMBER");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Lock the draw while reserving a number.
     *
     * This serializes reservations for the same draw and
     * prevents two concurrent users from successfully taking
     * the same number.
     */
    const drawResult = await client.query<DrawRow>(
      `
        SELECT
          total_numbers,
          status,
          starts_at,
          deadline_at
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

    if (isBeforeStart(draw.starts_at)) {
      throw new Error("DRAW_NOT_STARTED");
    }

    if (isAfterDeadline(draw.deadline_at)) {
      throw new Error("DRAW_DEADLINE_PASSED");
    }

    /*
     * Release expired reservations before checking the requested
     * number. Historical rows are preserved; only their status
     * changes to expired.
     */
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
          AND status IN ('reserved', 'pending_payment', 'paid')
        LIMIT 1
        FOR UPDATE
      `,
      [drawId, number],
    );

    if (existingResult.rows.length > 0) {
      throw new Error("NUMBER_UNAVAILABLE");
    }

    /*
     * Reservation duration is controlled by the server.
     * The client cannot choose a shorter or longer reservation.
     */
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
      [drawId, userId, number, RESERVATION_MINUTES],
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

  if (!entryId.trim()) {
    throw new Error("INVALID_ENTRY_ID");
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

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
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
