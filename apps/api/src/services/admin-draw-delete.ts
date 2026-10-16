import { pool } from "../db.js";

export async function deleteAdminDraw(
  adminUserId: string,
  drawId: string,
): Promise<void> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  if (!adminUserId.trim()) {
    throw new Error(
      "INVALID_ADMIN_USER_ID",
    );
  }

  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const drawResult =
      await client.query<{
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

    const draw =
      drawResult.rows[0];

    if (!draw) {
      throw new Error(
        "DRAW_NOT_FOUND",
      );
    }

    /*
     * A draw that is already being executed
     * or already completed must never be deleted.
     */
    if (
      draw.status === "drawing" ||
      draw.status === "completed"
    ) {
      throw new Error(
        "DRAW_NOT_DELETABLE",
      );
    }

    /*
     * A draw result means the draw engine has
     * already created an official result.
     */
    const resultCheck =
      await client.query(
        `
          SELECT 1
          FROM draw_results
          WHERE draw_id = $1
          LIMIT 1
        `,
        [normalizedDrawId],
      );

    if (
      (resultCheck.rowCount ?? 0) > 0
    ) {
      throw new Error(
        "DRAW_NOT_DELETABLE",
      );
    }

    /*
     * Delete payments first because payments
     * reference entries.
     */
    await client.query(
      `
        DELETE FROM payments
        WHERE entry_id IN (
          SELECT id
          FROM entries
          WHERE draw_id = $1
        )
      `,
      [normalizedDrawId],
    );

    /*
     * Winners should normally be zero here,
     * but deleting them makes this operation
     * safe for any non-executed historical rows.
     */
    await client.query(
      `
        DELETE FROM winners
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    /*
     * No result should normally exist because
     * of the check above. Keep this cleanup
     * for transactional safety.
     */
    await client.query(
      `
        DELETE FROM draw_results
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    /*
     * Entries reference the draw.
     */
    await client.query(
      `
        DELETE FROM entries
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    /*
     * Prize rows reference the draw.
     */
    await client.query(
      `
        DELETE FROM draw_prizes
        WHERE draw_id = $1
      `,
      [normalizedDrawId],
    );

    /*
     * Keep an audit record.
     * audit_logs.entity_id does not reference
     * draws with a foreign key, so the deleted
     * draw can still be identified historically.
     */
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
          'DRAW_DELETED',
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
          status: draw.status,
          deletedAt:
            new Date().toISOString(),
        }),
      ],
    );

    /*
     * Finally delete the draw itself.
     */
    await client.query(
      `
        DELETE FROM draws
        WHERE id = $1
      `,
      [normalizedDrawId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
