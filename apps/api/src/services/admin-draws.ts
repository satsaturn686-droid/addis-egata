import { pool } from "../db.js";
import type {
  Draw,
  DrawPrize,
  PrizeType,
} from "../types.js";

interface CreateDrawInput {
  name: string;
  description?: string | null;
  prizeType: PrizeType;
  prizeName: string;
  prizeImageUrl?: string | null;
  prizeDescription?: string | null;
  displayedPrizeValue?: number | null;
  actualPrizeCost?: number | null;
  totalNumbers: number;
  entryFee: number;
  winnerCount: number;
  uniqueWinners?: boolean;
  startsAt?: string | null;
  deadlineAt?: string | null;
  drawAt?: string | null;
  prizes: Array<{
    rank: number;
    amount: number;
  }>;
}

type DrawRow = {
  id: string;
  name: string;
  description: string | null;
  prize_type: PrizeType;
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
    occupiedNumbers: [],
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

function mapPrize(
  row: DrawPrizeRow,
): DrawPrize {
  return {
    id: row.id,
    drawId: row.draw_id,
    rank: row.rank,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}

function validateText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field}_REQUIRED`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${field}_TOO_LONG`);
  }

  return normalized;
}

function validateOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new Error(`${field}_TOO_LONG`);
  }

  return normalized;
}

function validateMoney(
  value: number | null | undefined,
  field: string,
  allowZero = true,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${field}_INVALID`);
  }

  if (allowZero) {
    if (value < 0) {
      throw new Error(`${field}_INVALID`);
    }
  } else if (value <= 0) {
    throw new Error(`${field}_INVALID`);
  }

  return Math.round(value * 100) / 100;
}

function validateDate(
  value: string | null | undefined,
  field: string,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const timestamp =
    new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field}_INVALID`);
  }

  return new Date(timestamp).toISOString();
}

function validatePrizes(
  prizes: CreateDrawInput["prizes"],
  winnerCount: number,
): Array<{
  rank: number;
  amount: number;
}> {
  if (!Array.isArray(prizes)) {
    throw new Error("PRIZES_REQUIRED");
  }

  if (prizes.length !== winnerCount) {
    throw new Error(
      "PRIZE_COUNT_MUST_MATCH_WINNERS",
    );
  }

  const ranks = new Set<number>();

  const normalized = prizes.map(
    (prize) => {
      if (
        !Number.isInteger(prize.rank) ||
        prize.rank < 1 ||
        prize.rank > winnerCount
      ) {
        throw new Error(
          "INVALID_PRIZE_RANK",
        );
      }

      if (ranks.has(prize.rank)) {
        throw new Error(
          "DUPLICATE_PRIZE_RANK",
        );
      }

      ranks.add(prize.rank);

      if (
        !Number.isFinite(prize.amount) ||
        prize.amount < 0
      ) {
        throw new Error(
          "INVALID_PRIZE_AMOUNT",
        );
      }

      return {
        rank: prize.rank,
        amount:
          Math.round(prize.amount * 100) /
          100,
      };
    },
  );

  normalized.sort(
    (a, b) => a.rank - b.rank,
  );

  for (
    let index = 0;
    index < normalized.length;
    index += 1
  ) {
    if (
      normalized[index].rank !==
      index + 1
    ) {
      throw new Error(
        "PRIZE_RANKS_MUST_BE_SEQUENTIAL",
      );
    }
  }

  return normalized;
}

function validateSchedule(
  startsAt: string | null,
  deadlineAt: string | null,
  drawAt: string | null,
): void {
  const start =
    startsAt === null
      ? null
      : new Date(startsAt).getTime();

  const deadline =
    deadlineAt === null
      ? null
      : new Date(deadlineAt).getTime();

  const draw =
    drawAt === null
      ? null
      : new Date(drawAt).getTime();

  if (
    start !== null &&
    deadline !== null &&
    deadline <= start
  ) {
    throw new Error(
      "DEADLINE_MUST_BE_AFTER_START",
    );
  }

  if (
    deadline !== null &&
    draw !== null &&
    draw < deadline
  ) {
    throw new Error(
      "DRAW_TIME_MUST_BE_ON_OR_AFTER_DEADLINE",
    );
  }

  if (
    start !== null &&
    draw !== null &&
    draw < start
  ) {
    throw new Error(
      "DRAW_TIME_MUST_BE_ON_OR_AFTER_START",
    );
  }
}

export async function createDraw(
  adminUserId: string,
  input: CreateDrawInput,
): Promise<{
  draw: Draw;
  prizes: DrawPrize[];
}> {
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

  const name = validateText(
    input.name,
    "DRAW_NAME",
    200,
  );

  const description =
    validateOptionalText(
      input.description,
      "DRAW_DESCRIPTION",
      2000,
    );

  if (
    input.prizeType !== "cash" &&
    input.prizeType !== "physical"
  ) {
    throw new Error(
      "INVALID_PRIZE_TYPE",
    );
  }

  const prizeName = validateText(
    input.prizeName,
    "PRIZE_NAME",
    200,
  );

  const prizeImageUrl =
    validateOptionalText(
      input.prizeImageUrl,
      "PRIZE_IMAGE_URL",
      2000,
    );

  const prizeDescription =
    validateOptionalText(
      input.prizeDescription,
      "PRIZE_DESCRIPTION",
      5000,
    );

  const displayedPrizeValue =
    validateMoney(
      input.displayedPrizeValue,
      "DISPLAYED_PRIZE_VALUE",
    );

  const actualPrizeCost =
    validateMoney(
      input.actualPrizeCost,
      "ACTUAL_PRIZE_COST",
    );

  if (
    !Number.isInteger(
      input.totalNumbers,
    ) ||
    input.totalNumbers < 5 ||
    input.totalNumbers > 1_000_000
  ) {
    throw new Error(
      "INVALID_TOTAL_NUMBERS",
    );
  }

  if (
    !Number.isFinite(input.entryFee) ||
    input.entryFee <= 0
  ) {
    throw new Error(
      "INVALID_ENTRY_FEE",
    );
  }

  const entryFee =
    Math.round(input.entryFee * 100) /
    100;

  if (
    !Number.isInteger(
      input.winnerCount,
    ) ||
    input.winnerCount < 5 ||
    input.winnerCount >
      input.totalNumbers
  ) {
    throw new Error(
      "INVALID_WINNER_COUNT",
    );
  }

  const startsAt = validateDate(
    input.startsAt,
    "STARTS_AT",
  );

  const deadlineAt = validateDate(
    input.deadlineAt,
    "DEADLINE_AT",
  );

  const drawAt = validateDate(
    input.drawAt,
    "DRAW_AT",
  );

  validateSchedule(
    startsAt,
    deadlineAt,
    drawAt,
  );

  const prizes = validatePrizes(
    input.prizes,
    input.winnerCount,
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const drawResult =
      await client.query<DrawRow>(
        `
          INSERT INTO draws (
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
            created_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            'draft',
            $13,
            $14,
            $15,
            $16
          )
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
        [
          name,
          description,
          input.prizeType,
          prizeName,
          prizeImageUrl,
          prizeDescription,
          displayedPrizeValue,
          actualPrizeCost,
          input.totalNumbers,
          entryFee,
          input.winnerCount,
          input.uniqueWinners ?? true,
          startsAt,
          deadlineAt,
          drawAt,
          adminUserId,
        ],
      );

    const draw = mapDraw(
      drawResult.rows[0],
    );

    const prizeRows: DrawPrizeRow[] =
      [];

    for (const prize of prizes) {
      const result =
        await client.query<DrawPrizeRow>(
          `
            INSERT INTO draw_prizes (
              draw_id,
              rank,
              amount
            )
            VALUES (
              $1,
              $2,
              $3
            )
            RETURNING
              id,
              draw_id,
              rank,
              amount,
              created_at
          `,
          [
            draw.id,
            prize.rank,
            prize.amount,
          ],
        );

      prizeRows.push(
        result.rows[0],
      );
    }

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
          'DRAW_CREATED',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        draw.id,
        JSON.stringify({
          name: draw.name,
          totalNumbers:
            draw.totalNumbers,
          entryFee: draw.entryFee,
          winnerCount:
            draw.winnerCount,
          uniqueWinners:
            draw.uniqueWinners,
          prizeType:
            draw.prizeType,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      draw,
      prizes:
        prizeRows.map(mapPrize),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
