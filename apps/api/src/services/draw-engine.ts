import { randomInt } from "node:crypto";

import { pool } from "../db.js";
import type { Winner } from "../types.js";

type DrawRow = {
  id: string;
  status: string;
  total_numbers: number;
  winner_count: number;
  unique_winners: boolean;
};

type EligibleEntryRow = {
  id: string;
  draw_id: string;
  user_id: string;
  number: number;
};

type PrizeRow = {
  rank: number;
  amount: string | number;
};

type WinnerRow = {
  id: string;
  draw_id: string;
  entry_id: string;
  user_id: string;
  rank: number;
  prize_amount: string | number;
  selected_at: string;
};

export type DrawExecutionResult = {
  drawId: string;
  eligibleEntryCount: number;
  winners: Winner[];
  executedAt: string;
  publishedAt: string | null;
};

function mapWinner(
  row: WinnerRow,
): Winner {
  return {
    id: row.id,
    drawId: row.draw_id,
    entryId: row.entry_id,
    userId: row.user_id,
    rank: row.rank,
    prizeAmount: Number(row.prize_amount),
    selectedAt: row.selected_at,
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
          status,
          total_numbers,
          winner_count,
          unique_winners
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

async function getEligibleEntries(
  client: import("pg").PoolClient,
  drawId: string,
): Promise<EligibleEntryRow[]> {
  const result =
    await client.query<EligibleEntryRow>(
      `
        SELECT
          id,
          draw_id,
          user_id,
          number
        FROM entries
        WHERE draw_id = $1
          AND status = 'paid'
        ORDER BY id ASC
        FOR UPDATE
      `,
      [drawId],
    );

  return result.rows;
}

async function getPrizes(
  client: import("pg").PoolClient,
  drawId: string,
): Promise<PrizeRow[]> {
  const result =
    await client.query<PrizeRow>(
      `
        SELECT
          rank,
          amount
        FROM draw_prizes
        WHERE draw_id = $1
        ORDER BY rank ASC
      `,
      [drawId],
    );

  return result.rows;
}

function validatePrizes(
  prizes: PrizeRow[],
  winnerCount: number,
): void {
  if (
    prizes.length !== winnerCount
  ) {
    throw new Error(
      "PRIZE_COUNT_MUST_MATCH_WINNERS",
    );
  }

  for (
    let index = 0;
    index < prizes.length;
    index += 1
  ) {
    const prize = prizes[index];

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
  }
}

/*
 * Select N different array positions using
 * cryptographically secure random integers.
 *
 * The returned array contains indexes into the
 * original entries array.
 */
function selectRandomIndexes(
  count: number,
  selectionSize: number,
): number[] {
  if (
    !Number.isInteger(count) ||
    count < 1
  ) {
    throw new Error(
      "NO_ELIGIBLE_ENTRIES",
    );
  }

  if (
    !Number.isInteger(selectionSize) ||
    selectionSize < 1 ||
    selectionSize > count
  ) {
    throw new Error(
      "INVALID_WINNER_COUNT",
    );
  }

  const indexes = Array.from(
    { length: count },
    (_value, index) => index,
  );

  /*
   * Partial Fisher-Yates shuffle.
   *
   * randomInt() uses Node's cryptographic
   * random source rather than Math.random().
   */
  for (
    let i = 0;
    i < selectionSize;
    i += 1
  ) {
    const j =
      randomInt(i, count);

    const temp = indexes[i];

    indexes[i] = indexes[j];
    indexes[j] = temp;
  }

  return indexes.slice(
    0,
    selectionSize,
  );
}

function selectUniqueWinnerIndexes(
  entries: EligibleEntryRow[],
  winnerCount: number,
): number[] {
  if (
    entries.length < winnerCount
  ) {
    throw new Error(
      "NOT_ENOUGH_ELIGIBLE_ENTRIES",
    );
  }

  /*
   * Build one candidate list per user.
   * A user can have multiple paid numbers,
   * but only one of them may win when
   * unique_winners is enabled.
   */
  const byUser =
    new Map<string, number[]>();

  entries.forEach(
    (entry, index) => {
      const existing =
        byUser.get(entry.user_id);

      if (existing) {
        existing.push(index);
      } else {
        byUser.set(
          entry.user_id,
          [index],
        );
      }
    },
  );

  if (
    byUser.size < winnerCount
  ) {
    throw new Error(
      "NOT_ENOUGH_UNIQUE_WINNERS",
    );
  }

  const users = Array.from(
    byUser.keys(),
  );

  const selectedUserIndexes =
    selectRandomIndexes(
      users.length,
      winnerCount,
    );

  return selectedUserIndexes.map(
    (userIndex) => {
      const userId =
        users[userIndex];

      const candidateIndexes =
        byUser.get(userId);

      if (
        !candidateIndexes ||
        candidateIndexes.length === 0
      ) {
        throw new Error(
          "WINNER_SELECTION_FAILED",
        );
      }

      const candidatePosition =
        randomInt(
          0,
          candidateIndexes.length,
        );

      return candidateIndexes[
        candidatePosition
      ];
    },
  );
}

function createEligibleSnapshot(
  entries: EligibleEntryRow[],
): Array<{
  entryId: string;
  userId: string;
  number: number;
}> {
  return entries.map(
    (entry) => ({
      entryId: entry.id,
      userId: entry.user_id,
      number: entry.number,
    }),
  );
}

export async function executeDraw(
  adminUserId: string,
  drawId: string,
): Promise<DrawExecutionResult> {
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

    /*
     * Only a full or manually closed draw can
     * enter the drawing state.
     */
    if (
      draw.status !== "full" &&
      draw.status !== "closed"
    ) {
      throw new Error(
        "DRAW_NOT_READY_FOR_DRAWING",
      );
    }

    /*
     * Because the draw row is locked, another
     * admin cannot start a second draw execution
     * for the same draw concurrently.
     */
    const existingResult =
      await client.query<{
        id: string;
      }>(
        `
          SELECT id
          FROM draw_results
          WHERE draw_id = $1
          LIMIT 1
        `,
        [drawId],
      );

    if (
      existingResult.rows.length > 0
    ) {
      throw new Error(
        "DRAW_ALREADY_EXECUTED",
      );
    }

    const prizes =
      await getPrizes(
        client,
        drawId,
      );

    validatePrizes(
      prizes,
      draw.winner_count,
    );

    const entries =
      await getEligibleEntries(
        client,
        drawId,
      );

    if (
      entries.length <
      draw.winner_count
    ) {
      throw new Error(
        "NOT_ENOUGH_ELIGIBLE_ENTRIES",
      );
    }

    /*
     * If unique winners are required, there must
     * be at least winner_count different users.
     */
    if (
      draw.unique_winners
    ) {
      const uniqueUserCount =
        new Set(
          entries.map(
            (entry) =>
              entry.user_id,
          ),
        ).size;

      if (
        uniqueUserCount <
        draw.winner_count
      ) {
        throw new Error(
          "NOT_ENOUGH_UNIQUE_WINNERS",
        );
      }
    }

    /*
     * Put the draw into drawing state.
     *
     * IMPORTANT:
     * We intentionally do NOT mark it completed here.
     *
     * The Live Draw API will reveal the immutable
     * winners over time and will finalize the draw
     * after the reveal sequence is complete.
     */
    await client.query(
      `
        UPDATE draws
        SET
          status = 'drawing',
          updated_at = NOW()
        WHERE id = $1
      `,
      [drawId],
    );

    const selectedIndexes =
      draw.unique_winners
        ? selectUniqueWinnerIndexes(
            entries,
            draw.winner_count,
          )
        : selectRandomIndexes(
            entries.length,
            draw.winner_count,
          );

    /*
     * Snapshot the exact eligible entries used
     * by this draw before inserting winners.
     */
    const eligibleSnapshot =
      createEligibleSnapshot(
        entries,
      );

    const executedAt =
      new Date().toISOString();

    /*
     * random_seed_hash is retained for compatibility
     * with the existing schema. It records a SHA-256
     * commitment to the execution metadata rather
     * than exposing random internals.
     *
     * The actual selection itself is performed with
     * Node's cryptographically secure randomInt().
     */
    const hashInput = JSON.stringify({
      drawId,
      adminUserId,
      executedAt,
      eligibleEntryCount:
        entries.length,
      selectedIndexes,
    });

    const hashResult =
      await client.query<{
        hash: string;
      }>(
        `
          SELECT encode(
            digest($1, 'sha256'),
            'hex'
          ) AS hash
        `,
        [hashInput],
      );

    const randomSeedHash =
      hashResult.rows[0]?.hash;

    if (!randomSeedHash) {
      throw new Error(
        "DRAW_HASH_FAILED",
      );
    }

    const resultInsert =
      await client.query<{
        id: string;
        executed_at: string;
      }>(
        `
          INSERT INTO draw_results (
            draw_id,
            eligible_entry_count,
            eligible_entry_snapshot,
            random_seed_hash,
            executed_at,
            executed_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING
            id,
            executed_at
        `,
        [
          drawId,
          entries.length,
          JSON.stringify(
            eligibleSnapshot,
          ),
          randomSeedHash,
          executedAt,
          adminUserId,
        ],
      );

    const winnerRows:
      WinnerRow[] = [];

    for (
      let index = 0;
      index <
      selectedIndexes.length;
      index += 1
    ) {
      const entry =
        entries[
          selectedIndexes[index]
        ];

      const prize =
        prizes[index];

      const winnerResult =
        await client.query<WinnerRow>(
          `
            INSERT INTO winners (
              draw_id,
              entry_id,
              user_id,
              rank,
              prize_amount,
              selected_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6
            )
            RETURNING
              id,
              draw_id,
              entry_id,
              user_id,
              rank,
              prize_amount,
              selected_at
          `,
          [
            drawId,
            entry.id,
            entry.user_id,
            index + 1,
            Number(prize.amount),
            executedAt,
          ],
        );

      winnerRows.push(
        winnerResult.rows[0],
      );
    }

    /*
     * DO NOT publish the result yet.
     *
     * published_at remains NULL while the
     * Live Draw sequence is running.
     *
     * The Live Draw endpoint will publish the
     * result after the final winner has been
     * revealed.
     */
    await client.query(
      `
        UPDATE draw_results
        SET
          published_at = NULL
        WHERE draw_id = $1
      `,
      [drawId],
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
          'DRAW_STARTED',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        drawId,
        JSON.stringify({
          eligibleEntryCount:
            entries.length,
          winnerCount:
            winnerRows.length,
          uniqueWinners:
            draw.unique_winners,
          drawResultId:
            resultInsert.rows[0].id,
          randomSeedHash,
          executedAt,
          status: "drawing",
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      drawId,
      eligibleEntryCount:
        entries.length,
      winners:
        winnerRows.map(mapWinner),
      executedAt,
      publishedAt: null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
