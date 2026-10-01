import { query } from "../db.js";

type AdminDrawRow = {
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
  starts_at: string;
  deadline_at: string;
  draw_at: string;
  status:
    | "draft"
    | "open"
    | "full"
    | "closed"
    | "drawing"
    | "completed"
    | "cancelled";
  created_at: string;
  updated_at: string;
};

export type AdminDraw = {
  id: string;
  name: string;
  description: string | null;
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  prizeDescription: string | null;
  displayedPrizeValue: number | null;
  actualPrizeCost: number | null;
  totalNumbers: number;
  entryFee: number;
  winnerCount: number;
  uniqueWinners: boolean;
  startsAt: string;
  deadlineAt: string;
  drawAt: string;
  status:
    | "draft"
    | "open"
    | "full"
    | "closed"
    | "drawing"
    | "completed"
    | "cancelled";
  createdAt: string;
  updatedAt: string;
};

function toNullableNumber(
  value: string | number | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function mapAdminDraw(
  row: AdminDrawRow,
): AdminDraw {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prizeType: row.prize_type,
    prizeName: row.prize_name,
    prizeImageUrl:
      row.prize_image_url,
    prizeDescription:
      row.prize_description,
    displayedPrizeValue:
      toNullableNumber(
        row.displayed_prize_value,
      ),
    actualPrizeCost:
      toNullableNumber(
        row.actual_prize_cost,
      ),
    totalNumbers:
      Number(row.total_numbers),
    entryFee:
      Number(row.entry_fee),
    winnerCount:
      Number(row.winner_count),
    uniqueWinners:
      Boolean(row.unique_winners),
    startsAt:
      row.starts_at,
    deadlineAt:
      row.deadline_at,
    drawAt:
      row.draw_at,
    status:
      row.status,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

export async function getAdminDrawList(): Promise<
  AdminDraw[]
> {
  const rows =
    await query<AdminDrawRow>(
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
          starts_at,
          deadline_at,
          draw_at,
          status,
          created_at,
          updated_at
        FROM draws
        ORDER BY
          CASE status
            WHEN 'open' THEN 1
            WHEN 'full' THEN 2
            WHEN 'draft' THEN 3
            WHEN 'closed' THEN 4
            WHEN 'drawing' THEN 5
            WHEN 'completed' THEN 6
            WHEN 'cancelled' THEN 7
            ELSE 8
          END,
          draw_at ASC,
          created_at DESC
      `,
    );

  return rows.map(mapAdminDraw);
}
