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
  published_at: string;
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

function mapResult(
  row: ResultRow,
  winners: WinnerRow[],
): PublicDrawResult {
  return {
    drawId: row.draw_id,
    drawName: row.draw_name,
    prizeType: row.prize_type,
    prizeName: row.prize_name,
    prizeImageUrl: row.prize_image_url,
    displayedPrizeValue:
      row.displayed_prize_value === null
        ? null
        : Number(row.displayed_prize_value),
    winnerCount: row.winner_count,
    eligibleEntryCount:
      row.eligible_entry_count,
    executedAt: row.executed_at,
    publishedAt: row.published_at,
    winners: winners.map(
      (winner) => ({
        id: winner.id,
        rank: winner.rank,
        number: winner.number,
        prizeAmount:
          Number(winner.prize_amount),
        selectedAt: winner.selected_at,
        firstName:
          winner.first_name,
        lastName:
          winner.last_name,
        username:
          winner.username,
      }),
    ),
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
        WHERE dr.draw_id = $1
          AND dr.published_at IS NOT NULL
          AND d.status = 'completed'
        LIMIT 1
      `,
      [drawId],
    );

  const resultRow =
    resultRows.rows[0];

  if (!resultRow) {
    return null;
  }

  const winnerRows =
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

  return mapResult(
    resultRow,
    winnerRows.rows,
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

  if (resultRows.rows.length === 0) {
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
