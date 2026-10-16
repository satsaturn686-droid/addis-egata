import { pool } from "../db.js";

/*
 * Addis ዕጣ — Reservation Cleanup
 *
 * IMPORTANT:
 * There is NO draw deadline.
 *
 * A draw remains open until all numbers are successfully
 * paid. Once every number is paid, the payment verification
 * flow changes the draw status to "full".
 *
 * This job ONLY expires unpaid number reservations after
 * their 30-minute reservation period.
 *
 * It does NOT:
 * - close draws by time
 * - reject payments because of a deadline
 * - expire pending payments because of a deadline
 * - use deadline_at
 */

export async function expireDrawReservations(): Promise<{
  reservationsExpired: number;
}> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<{ id: string }>(
    `
      UPDATE entries
      SET
        status = 'expired',
        reserved_until = NULL,
        updated_at = NOW()
      WHERE status = 'reserved'
        AND reserved_until IS NOT NULL
        AND reserved_until <= NOW()
      RETURNING id
    `,
  );

  const reservationsExpired =
    result.rowCount ?? 0;

  if (reservationsExpired > 0) {
    await pool.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          NULL,
          'RESERVATION_EXPIRY_CLEANUP',
          'system',
          NULL,
          $1
        )
      `,
      [
        JSON.stringify({
          reservationsExpired,
          executedAt:
            new Date().toISOString(),
        }),
      ],
    );
  }

  return {
    reservationsExpired,
  };
}

/*
 * Keep the existing standalone job entry point.
 *
 * Render / cron can continue running:
 * expire-draws.js
 *
 * The job is now reservation-only and is no longer
 * a draw-deadline cleanup job.
 */
if (
  process.argv[1]?.endsWith(
    "expire-draws.js",
  )
) {
  expireDrawReservations()
    .then((result) => {
      console.log(
        "Addis ዕጣ reservation cleanup completed:",
        result,
      );
    })
    .catch((error) => {
      console.error(
        "Addis ዕጣ reservation cleanup failed:",
        error,
      );

      process.exitCode = 1;
    });
}
