import { pool } from "../db.js";

const TEST_DRAW_NAME = "መከራ ዕጣ";

export async function resetTestDraw(
  adminUserId: string,
  drawId: string,
): Promise<void> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const normalizedDrawId = drawId.trim();

  if (!normalizedDrawId) {
    throw new Error("INVALID_DRAW_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const drawResult = await client.query<{
      id: string;
      name: string;
      status: string;
    }>(
      `
        SELECT
          id,
          name,
          status
        FROM draws
        WHERE id = $1
        FOR UPDATE
      `,
      [normalizedDrawId],
    );

    const draw = drawResult.rows[0];

    if (!draw) {
      throw new Error("DRAW_NOT_FOUND");
    }

    /*
     * This endpoint is deliberately locked to the dedicated
     * test draw. Production draws cannot be reset through it.
     */
    if (draw.name !== TEST_DRAW_NAME) {
      throw new Error("TEST_DRAW_ONLY");
    }

    if (draw.status !== "completed") {
      throw new Error("TEST_DRAW_NOT_COMPLETED");
    }

    const resultCheck = await client.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM draw_results
        WHERE draw_id = $1
        FOR UPDATE
      `,
      [normalizedDrawId],
    );

    if (resultCheck.rows.length === 0) {
      throw new Error("TEST_DRAW_RESULT_NOT_FOUND");
    }

    /*
     * Remove only the generated result/winner records.
     * Paid entries, payments, numbers, and draw configuration
     * are intentionally preserved so the same test draw can
     * be executed again.
     */
    await client.query(
      `
        DELETE FROM winners
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    await client.query(
      `
        DELETE FROM draw_results
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    await client.query(
      `
        UPDATE draws
        SET
          status = 'full',
          draw_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [normalizedDrawId],
    );

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
          $1,
          'TEST_DRAW_RESET',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        normalizedDrawId,
        JSON.stringify({
          name: draw.name,
          previousStatus: draw.status,
          resetAt: new Date().toISOString(),
          preservedPaidEntries: true,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
