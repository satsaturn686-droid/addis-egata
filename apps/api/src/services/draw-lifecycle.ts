import { pool } from "../db.js";
import type { Draw } from "../types.js";

type DrawRow = {
  id: string;
  name: string;
  description: string | null;
  prize_type: Draw["prizeType"];
  prize_name: string;
  prize_image_url: string | null;
  prize_description: string | null;
  displayed_prize_value: string | number | null;
  actual_prize_cost: string | number | null;
  total_numbers: number;
  entry_fee: string | number;
  winner_count: number;
  unique_winners: boolean;
  status: Draw["status"];
  starts_at: string | null;
  deadline_at: string | null;
  draw_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PrizeRow = {
  rank: number;
  amount: string | number;
};

function toNumber(
  value: string | number | null,
): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
}

function mapDraw(row: DrawRow): Draw {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prizeType: row.prize_type,
    prizeName: row.prize_name,
    prizeImageUrl: row.prize_image_url,
    prizeDescription: row.prize_description,
    displayedPrizeValue: toNumber(
      row.displayed_prize_value,
    ),
    actualPrizeCost: toNumber(
      row.actual_prize_cost,
    ),
    totalNumbers: row.total_numbers,
    filledNumbers: 0,
    entryFee: Number(row.entry_fee),
    winnerCount: row.winner_count,
    uniqueWinners: row.unique_winners,
    status: row.status,
    startsAt: row.starts_at,
    deadlineAt: row.deadline_at,
    drawAt: row.draw_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDrawForUpdate(
  client: import("pg").PoolClient,
  drawId: string,
): Promise<DrawRow> {
  const result =
    await client.query<DrawRow>(
      `
        SELECT
          id,
          name,
          description,
          prize_type,
          prize_name,
          prize_image_url,
          prize_description,
          displayed_prize_value,
          actual_prize_cost,
          total_numbers,
          entry_fee,
          winner_count,
          unique_winners,
          status,
          starts_at,
          deadline_at,
          draw_at,
          created_by,
          created_at,
          updated_at
        FROM draws
        WHERE id = $1
        FOR UPDATE
      `,
      [drawId],
    );

  if (result.rows.length === 0) {
    throw new Error("DRAW_NOT_FOUND");
  }

  return result.rows[0];
}

async function validateDrawReady(
  client: import("pg").PoolClient,
  draw: DrawRow,
): Promise<void> {
  if (
    draw.status !== "draft"
  ) {
    throw new Error(
      "DRAW_NOT_EDITABLE",
    );
  }

  if (
    draw.total_numbers < 5
  ) {
    throw new Error(
      "INVALID_TOTAL_NUMBERS",
    );
  }

  const entryFee = Number(
    draw.entry_fee,
  );

  if (
    !Number.isFinite(entryFee) ||
    entryFee <= 0
  ) {
    throw new Error(
      "INVALID_ENTRY_FEE",
    );
  }

  if (
    draw.winner_count < 5 ||
    draw.winner_count >
      draw.total_numbers
  ) {
    throw new Error(
      "INVALID_WINNER_COUNT",
    );
  }

  const prizeResult =
    await client.query<PrizeRow>(
      `
        SELECT
          rank,
          amount
        FROM draw_prizes
        WHERE draw_id = $1
        ORDER BY rank ASC
      `,
      [draw.id],
    );

  if (
    prizeResult.rows.length !==
    draw.winner_count
  ) {
    throw new Error(
      "PRIZE_COUNT_MUST_MATCH_WINNERS",
    );
  }

  let totalPrize = 0;

  for (
    let index = 0;
    index <
    prizeResult.rows.length;
    index += 1
  ) {
    const prize =
      prizeResult.rows[index];

    if (
      prize.rank !== index + 1
    ) {
      throw new Error(
        "PRIZE_RANKS_MUST_BE_SEQUENTIAL",
      );
    }

    const amount =
      Number(prize.amount);

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw new Error(
        "INVALID_PRIZE_AMOUNT",
      );
    }

    totalPrize += amount;
  }

  if (totalPrize <= 0) {
    throw new Error(
      "PRIZE_POOL_MUST_BE_GREATER_THAN_ZERO",
    );
  }

  const now = Date.now();

  if (
    draw.starts_at !== null &&
    new Date(
      draw.starts_at,
    ).getTime() < now
  ) {
    /*
     * A draw may still be opened after its
     * configured start time. It becomes open
     * immediately, which is safer than creating
     * an unusable draw.
     */
  }

  if (
    draw.deadline_at !== null &&
    new Date(
      draw.deadline_at,
    ).getTime() <= now
  ) {
    throw new Error(
      "DRAW_DEADLINE_ALREADY_PASSED",
    );
  }

  if (
    draw.draw_at !== null &&
    new Date(
      draw.draw_at,
    ).getTime() < now
  ) {
    throw new Error(
      "DRAW_TIME_ALREADY_PASSED",
    );
  }
}

export async function openDraw(
  adminUserId: string,
  drawId: string,
): Promise<Draw> {
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

  if (!drawId.trim()) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draw =
      await getDrawForUpdate(
        client,
        drawId,
      );

    await validateDrawReady(
      client,
      draw,
    );

    const result =
      await client.query<DrawRow>(
        `
          UPDATE draws
          SET
            status = 'open',
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            name,
            description,
            prize_type,
            prize_name,
            prize_image_url,
            prize_description,
            displayed_prize_value,
            actual_prize_cost,
            total_numbers,
            entry_fee,
            winner_count,
            unique_winners,
            status,
            starts_at,
            deadline_at,
            draw_at,
            created_by,
            created_at,
            updated_at
        `,
        [drawId],
      );

    const updatedDraw =
      mapDraw(result.rows[0]);

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
          'DRAW_OPENED',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        drawId,
        JSON.stringify({
          previousStatus:
            draw.status,
          newStatus:
            updatedDraw.status,
        }),
      ],
    );

    await client.query("COMMIT");

    return updatedDraw;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDraw(
  adminUserId: string,
  drawId: string,
): Promise<Draw> {
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

  if (!drawId.trim()) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const draw =
      await getDrawForUpdate(
        client,
        drawId,
      );

    if (
      draw.status !== "open" &&
      draw.status !== "full"
    ) {
      throw new Error(
        "DRAW_NOT_CLOSEABLE",
      );
    }

    const result =
      await client.query<DrawRow>(
        `
          UPDATE draws
          SET
            status = 'closed',
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            name,
            description,
            prize_type,
            prize_name,
            prize_image_url,
            prize_description,
            displayed_prize_value,
            actual_prize_cost,
            total_numbers,
            entry_fee,
            winner_count,
            unique_winners,
            status,
            starts_at,
            deadline_at,
            draw_at,
            created_by,
            created_at,
            updated_at
        `,
        [drawId],
      );

    const updatedDraw =
      mapDraw(result.rows[0]);

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
          'DRAW_CLOSED',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        drawId,
        JSON.stringify({
          previousStatus:
            draw.status,
          newStatus:
            updatedDraw.status,
        }),
      ],
    );

    await client.query("COMMIT");

    return updatedDraw;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
