import { pool } from "../db.js";

export type PublicWinner = {
  id: string;
  rank: number;
  number: number;
  prizeAmount: number;
  selectedAt: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

export type PublicDrawResult = {
  drawId: string;
  drawName: string;
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  displayedPrizeValue: number | null;
  winnerCount: number;
  eligibleEntryCount: number;
  executedAt: string;
  publishedAt: string;
  winners: PublicWinner[];
};

export type LiveDrawState = {
  status: "drawing" | "completed";
  result: {
    drawId: string;
    drawName: string;
    prizeType: "cash" | "physical";
    prizeName: string;
    prizeImageUrl: string | null;
    displayedPrizeValue: number | null;
    winnerCount: number;
    eligibleEntryCount: number;
    executedAt: string;
  };
  revealCount: number;
  totalWinners: number;
  nextRevealAt: string | null;
  revealedWinners: PublicWinner[];
};

type ResultRow = {
  draw_id: string;
  draw_name: string;
  prize_type: "cash" | "physical";
  prize_name: string;
  prize_image_url: string | null;
  displayed_prize_value: string | number | null;
  winner_count: number;
  eligible_entry_count: number;
  executed_at: string;
  published_at: string | null;
};

type WinnerRow = {
  id: string;
  rank: number;
  number: number;
  prize_amount: string | number;
  selected_at: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

const FIRST_REVEAL_DELAY_MS = 3000;
const REVEAL_INTERVAL_MS = 5000;

function mapWinner(
  winner: WinnerRow,
): PublicWinner {
  return {
    id: winner.id,
    rank: winner.rank,
    number: winner.number,
    prizeAmount: Number(
      winner.prize_amount,
    ),
    selectedAt: winner.selected_at,
    firstName: winner.first_name,
    lastName: winner.last_name,
    username: winner.username,
  };
}

function mapResult(
  row: ResultRow,
  winners: WinnerRow[],
): PublicDrawResult {
  if (!row.published_at) {
    throw new Error(
      "RESULT_NOT_PUBLISHED",
    );
  }

  return {
    drawId: row.draw_id,
    drawName: row.draw_name,
    prizeType: row.prize_type,
    prizeName: row.prize_name,
    prizeImageUrl: row.prize_image_url,
    displayedPrizeValue:
      row.displayed_prize_value === null
        ? null
        : Number(
            row.displayed_prize_value,
          ),
    winnerCount: row.winner_count,
    eligibleEntryCount:
      row.eligible_entry_count,
    executedAt: row.executed_at,
    publishedAt: row.published_at,
    winners: winners.map(mapWinner),
  };
}

async function getResultRow(
  drawId: string,
): Promise<ResultRow | null> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<ResultRow>(
      `
        SELECT
          d.id AS draw_id,
          d.name AS draw_name,
          d.prize_type,
          d.prize_name,
          d.prize_image_url,
          d.displayed_prize_value,
          d.winner_count,
          dr.eligible_entry_count,
          dr.executed_at,
          dr.published_at
        FROM draw_results dr
        INNER JOIN draws d
          ON d.id = dr.draw_id
        WHERE dr.draw_id = $1
        LIMIT 1
      `,
      [drawId],
    );

  return result.rows[0] ?? null;
}

async function getWinnerRows(
  drawId: string,
): Promise<WinnerRow[]> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<WinnerRow>(
      `
        SELECT
          w.id,
          w.rank,
          e.number,
          w.prize_amount,
          w.selected_at,
          u.first_name,
          u.last_name,
          u.username
        FROM winners w
        INNER JOIN entries e
          ON e.id = w.entry_id
        INNER JOIN users u
          ON u.id = w.user_id
        WHERE w.draw_id = $1
        ORDER BY w.rank ASC
      `,
      [drawId],
    );

  return result.rows;
}

function getRevealCount(
  executedAt: string,
  totalWinners: number,
  nowMs: number,
): number {
  const executedMs =
    new Date(executedAt).getTime();

  if (!Number.isFinite(executedMs)) {
    return 0;
  }

  const elapsed =
    nowMs - executedMs;

  if (
    elapsed <
    FIRST_REVEAL_DELAY_MS
  ) {
    return 0;
  }

  return Math.min(
    totalWinners,
    Math.floor(
      (elapsed -
        FIRST_REVEAL_DELAY_MS) /
        REVEAL_INTERVAL_MS,
    ) + 1,
  );
}

export async function getLiveDrawState(
  drawId: string,
): Promise<LiveDrawState | null> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  if (!drawId.trim()) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const row =
    await getResultRow(drawId);

  if (!row) {
    return null;
  }

  if (
    row.published_at !== null
  ) {
    const winners =
      await getWinnerRows(drawId);

    return {
      status: "completed",
      result: {
        drawId: row.draw_id,
        drawName: row.draw_name,
        prizeType: row.prize_type,
        prizeName: row.prize_name,
        prizeImageUrl:
          row.prize_image_url,
        displayedPrizeValue:
          row.displayed_prize_value === null
            ? null
            : Number(
                row.displayed_prize_value,
              ),
        winnerCount:
          row.winner_count,
        eligibleEntryCount:
          row.eligible_entry_count,
        executedAt:
          row.executed_at,
      },
      revealCount:
        winners.length,
      totalWinners:
        row.winner_count,
      nextRevealAt: null,
      revealedWinners:
        winners.map(mapWinner),
    };
  }

  const winners =
    await getWinnerRows(drawId);

  const nowMs =
    Date.now();

  const revealCount =
    getRevealCount(
      row.executed_at,
      winners.length,
      nowMs,
    );

  const finalRevealAtMs =
    new Date(
      row.executed_at,
    ).getTime() +
    FIRST_REVEAL_DELAY_MS +
    winners.length *
      REVEAL_INTERVAL_MS;

  if (
    revealCount >=
      winners.length &&
    winners.length > 0 &&
    nowMs >= finalRevealAtMs
  ) {
    const publishedAt =
      new Date().toISOString();

    const client =
      await pool.connect();

    try {
      await client.query("BEGIN");

      const publishResult =
        await client.query<{
          draw_id: string;
        }>(
          `
            UPDATE draw_results
            SET published_at = COALESCE(
              published_at,
              $2
            )
            WHERE draw_id = $1
              AND published_at IS NULL
            RETURNING draw_id
          `,
          [
            drawId,
            publishedAt,
          ],
        );

      await client.query(
        `
          UPDATE draws
          SET
            status = 'completed',
            updated_at = NOW()
          WHERE id = $1
            AND status = 'drawing'
        `,
        [drawId],
      );

      await client.query("COMMIT");

      if (
        publishResult.rows.length > 0
      ) {
        console.log(
          `Live draw completed: ${drawId}`,
        );
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const completedRow =
      await getResultRow(drawId);

    if (
      completedRow?.published_at
    ) {
      return {
        status: "completed",
        result: {
          drawId:
            completedRow.draw_id,
          drawName:
            completedRow.draw_name,
          prizeType:
            completedRow.prize_type,
          prizeName:
            completedRow.prize_name,
          prizeImageUrl:
            completedRow.prize_image_url,
          displayedPrizeValue:
            completedRow.displayed_prize_value ===
            null
              ? null
              : Number(
                  completedRow.displayed_prize_value,
                ),
          winnerCount:
            completedRow.winner_count,
          eligibleEntryCount:
            completedRow.eligible_entry_count,
          executedAt:
            completedRow.executed_at,
        },
        revealCount:
          winners.length,
        totalWinners:
          winners.length,
        nextRevealAt: null,
        revealedWinners:
          winners.map(mapWinner),
      };
    }
  }

  const nextRevealIndex =
    Math.max(
      revealCount,
      0,
    );

  const nextRevealAt =
    nextRevealIndex >=
    winners.length
      ? null
      : new Date(
          new Date(
            row.executed_at,
          ).getTime() +
            FIRST_REVEAL_DELAY_MS +
            nextRevealIndex *
              REVEAL_INTERVAL_MS,
        ).toISOString();

  return {
    status: "drawing",
    result: {
      drawId: row.draw_id,
      drawName: row.draw_name,
      prizeType: row.prize_type,
      prizeName: row.prize_name,
      prizeImageUrl:
        row.prize_image_url,
      displayedPrizeValue:
        row.displayed_prize_value === null
          ? null
          : Number(
              row.displayed_prize_value,
            ),
      winnerCount:
        row.winner_count,
      eligibleEntryCount:
        row.eligible_entry_count,
      executedAt:
        row.executed_at,
    },
    revealCount,
    totalWinners:
      winners.length,
    nextRevealAt,
    revealedWinners:
      winners
        .slice(0, revealCount)
        .map(mapWinner),
  };
}

export async function getPublicDrawResult(
  drawId: string,
): Promise<PublicDrawResult | null> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  if (!drawId.trim()) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const resultRow =
    await getResultRow(drawId);

  if (
    !resultRow ||
    !resultRow.published_at
  ) {
    return null;
  }

  const winnerRows =
    await getWinnerRows(drawId);

  return mapResult(
    resultRow,
    winnerRows,
  );
}

export async function getPublishedResults(): Promise<
  PublicDrawResult[]
> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const resultRows =
    await pool.query<ResultRow>(
      `
        SELECT
          d.id AS draw_id,
          d.name AS draw_name,
          d.prize_type,
          d.prize_name,
          d.prize_image_url,
          d.displayed_prize_value,
          d.winner_count,
          dr.eligible_entry_count,
          dr.executed_at,
          dr.published_at
        FROM draw_results dr
        INNER JOIN draws d
          ON d.id = dr.draw_id
        WHERE dr.published_at IS NOT NULL
          AND d.status = 'completed'
        ORDER BY
          dr.published_at DESC,
          d.created_at DESC
      `,
    );

  if (
    resultRows.rows.length === 0
  ) {
    return [];
  }

  const drawIds =
    resultRows.rows.map(
      (row) => row.draw_id,
    );

  const winnerRows =
    await pool.query<
      WinnerRow & {
        draw_id: string;
      }
    >(
      `
        SELECT
          w.draw_id,
          w.id,
          w.rank,
          e.number,
          w.prize_amount,
          w.selected_at,
          u.first_name,
          u.last_name,
          u.username
        FROM winners w
        INNER JOIN entries e
          ON e.id = w.entry_id
        INNER JOIN users u
          ON u.id = w.user_id
        WHERE w.draw_id = ANY($1::uuid[])
        ORDER BY
          w.draw_id,
          w.rank ASC
      `,
      [drawIds],
    );

  const winnersByDraw =
    new Map<
      string,
      WinnerRow[]
    >();

  for (
    const winner of winnerRows.rows
  ) {
    const existing =
      winnersByDraw.get(
        winner.draw_id,
      );

    if (existing) {
      existing.push(winner);
    } else {
      winnersByDraw.set(
        winner.draw_id,
        [winner],
      );
    }
  }

  return resultRows.rows.map(
    (row) =>
      mapResult(
        row,
        winnersByDraw.get(
          row.draw_id,
        ) ?? [],
      ),
  );
}
