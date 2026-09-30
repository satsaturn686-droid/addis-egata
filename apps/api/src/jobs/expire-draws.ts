import { pool } from "../db.js";

/*
 * Expire data that can no longer be completed after
 * a draw deadline has passed.
 *
 * Rules:
 * - Open draws become closed after their deadline.
 * - Unpaid reservations become expired.
 * - Pending payments become rejected and their entries expire.
 * - Full draws remain "full" because they are ready for drawing.
 * - Completed/cancelled/drawing draws are not modified.
 */
export async function expireDraws(): Promise<{
  drawsClosed: number;
  reservationsExpired: number;
  paymentsRejected: number;
  entriesExpired: number;
}> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const client = await pool.connect();

  let drawsClosed = 0;
  let reservationsExpired = 0;
  let paymentsRejected = 0;
  let entriesExpired = 0;

  try {
    await client.query("BEGIN");

    /*
     * Close draws that are still open after their deadline.
     *
     * Full draws are intentionally not changed because they
     * are already eligible for draw execution.
     */
    const closedDraws =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE draws
          SET
            status = 'closed',
            updated_at = NOW()
          WHERE status = 'open'
            AND deadline_at IS NOT NULL
            AND deadline_at <= NOW()
          RETURNING id
        `,
      );

    drawsClosed =
      closedDraws.rowCount ?? 0;

    /*
     * Any unpaid reservation whose deadline has passed
     * is no longer valid.
     */
    const expiredReservations =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE entries e
          SET
            status = 'expired',
            reserved_until = NULL,
            updated_at = NOW()
          FROM draws d
          WHERE e.draw_id = d.id
            AND e.status = 'reserved'
            AND d.deadline_at IS NOT NULL
            AND d.deadline_at <= NOW()
          RETURNING e.id
        `,
      );

    reservationsExpired =
      expiredReservations.rowCount ?? 0;

    /*
     * A payment that was submitted before the deadline
     * but is still pending cannot be approved after the
     * draw deadline.
     *
     * Mark the payment rejected so it is no longer an
     * unresolved financial transaction.
     */
    const rejectedPayments =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE payments p
          SET
            status = 'rejected',
            rejection_reason =
              'Draw deadline passed before payment verification.',
            updated_at = NOW()
          FROM entries e
          INNER JOIN draws d
            ON d.id = e.draw_id
          WHERE p.entry_id = e.id
            AND p.status = 'pending'
            AND e.status = 'pending_payment'
            AND d.deadline_at IS NOT NULL
            AND d.deadline_at <= NOW()
          RETURNING p.id
        `,
      );

    paymentsRejected =
      rejectedPayments.rowCount ?? 0;

    /*
     * Release the numbers belonging to those rejected
     * pending payments.
     */
    const expiredPendingEntries =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE entries e
          SET
            status = 'expired',
            reserved_until = NULL,
            updated_at = NOW()
          FROM draws d
          WHERE e.draw_id = d.id
            AND e.status = 'pending_payment'
            AND d.deadline_at IS NOT NULL
            AND d.deadline_at <= NOW()
          RETURNING e.id
        `,
      );

    entriesExpired =
      expiredPendingEntries.rowCount ?? 0;

    /*
     * Record a compact audit event for automatic lifecycle
     * processing. user_id remains NULL because this is a
     * system-generated action rather than an admin action.
     */
    if (
      drawsClosed > 0 ||
      reservationsExpired > 0 ||
      paymentsRejected > 0 ||
      entriesExpired > 0
    ) {
      await client.query(
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
            'DRAW_DEADLINE_CLEANUP',
            'system',
            NULL,
            $1
          )
        `,
        [
          JSON.stringify({
            drawsClosed,
            reservationsExpired,
            paymentsRejected,
            entriesExpired,
            executedAt:
              new Date().toISOString(),
          }),
        ],
      );
    }

    await client.query("COMMIT");

    return {
      drawsClosed,
      reservationsExpired,
      paymentsRejected,
      entriesExpired,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/*
 * CLI entry point for Render Cron Job.
 *
 * The process performs one cleanup run and exits.
 */
if (
  process.argv[1]?.endsWith(
    "expire-draws.js",
  )
) {
  expireDraws()
    .then((result) => {
      console.log(
        "Addis ዕጣ deadline cleanup completed:",
        result,
      );
    })
    .catch((error) => {
      console.error(
        "Addis ዕጣ deadline cleanup failed:",
        error,
      );

      process.exitCode = 1;
    });
}
