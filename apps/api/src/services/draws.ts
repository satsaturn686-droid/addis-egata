import { query } from "../db.js";
import type { Draw, DrawPrize } from "../types.js";

type DrawRow = {
  id: string;
  name: string;
  description: string | null;
  prize_type: "cash" | "physical";
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

type DrawPrizeRow = {
  id: string;
  draw_id: string;
  rank: number;
  amount: string | number;
  created_at: string;
};

function toNumber(value: string | number | null): number | null {
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
    displayedPrizeValue: toNumber(row.displayed_prize_value),
    actualPrizeCost: toNumber(row.actual_prize_cost),
    totalNumbers: row.total_numbers,
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

function mapDrawPrize(row: DrawPrizeRow): DrawPrize {
  return {
    id: row.id,
    drawId: row.draw_id,
    rank: row.rank,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}

export async function getDrawById(
  drawId: string,
): Promise<Draw | null> {
  const rows = await query<DrawRow>(
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
      LIMIT 1
    `,
    [drawId],
  );

  return rows.length > 0 ? mapDraw(rows[0]) : null;
}

export async function getOpenDraws(): Promise<Draw[]> {
  const rows = await query<DrawRow>(
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
      WHERE status IN ('open', 'full')
      ORDER BY
        CASE WHEN draw_at IS NULL THEN 1 ELSE 0 END,
        draw_at ASC NULLS LAST,
        created_at DESC
    `,
  );

  return rows.map(mapDraw);
}

export async function getDrawPrizes(
  drawId: string,
): Promise<DrawPrize[]> {
  const rows = await query<DrawPrizeRow>(
    `
      SELECT
        id,
        draw_id,
        rank,
        amount,
        created_at
      FROM draw_prizes
      WHERE draw_id = $1
      ORDER BY rank ASC
    `,
    [drawId],
  );

  return rows.map(mapDrawPrize);
}
