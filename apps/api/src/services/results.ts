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
  drawId: string;
  drawName: string;
  status: "drawing" | "completed";
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  displayedPrizeValue: number | null;
  winnerCount: number;
  eligibleEntryCount: number;
  executedAt: string;
  publishedAt: string | null;
  revealedWinnerCount: number;
  totalWinnerCount: number;
  winners: PublicWinner[];
};

type ResultRow = {
  draw_id: string;
  draw_name: string;
  prize_type: "cash" | "physical";
  prize_name: string;
  prize_image_url: string | null;
  displayed_prize_value:
    | string
    | number
    | null;
  winner_count: number;
  eligible_entry_count: number;
  executed_at: string;
  published_at: string | null;
};

type WinnerRow = {
  id: string;
  rank: number;
  number: number;
  prize_amount:
    | string
    | number;
  selected_at: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

type WinnerNotificationRow = {
  winner_id: string;
  telegram_id:
    | number
    | string
    | null;
  rank: number;
  number: number;
  prize_amount:
    | string
    | number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

const FIRST_REVEAL_DELAY_MS = 5000;
const REVEAL_INTERVAL_MS = 8000;

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ??
  "";

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

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
    selectedAt:
      winner.selected_at,
    firstName:
      winner.first_name,
    lastName:
      winner.last_name,
    username:
      winner.username,
  };
}

function getPrizeValue(
  value:
    | string
    | number
    | null,
): number | null {
  if (value === null) {
    return null;
  }

  const numberValue =
    Number(value);

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : null;
}

function mapLiveState(
  row: ResultRow,
  winners: WinnerRow[],
  revealedWinners: PublicWinner[],
  status:
    | "drawing"
    | "completed",
): LiveDrawState {
  return {
    drawId: row.draw_id,
    drawName: row.draw_name,
    status,
    prizeType:
      row.prize_type,
    prizeName:
      row.prize_name,
    prizeImageUrl:
      row.prize_image_url,
    displayedPrizeValue:
      getPrizeValue(
        row.displayed_prize_value,
      ),
    winnerCount:
      row.winner_count,
    eligibleEntryCount:
      row.eligible_entry_count,
    executedAt:
      row.executed_at,
    publishedAt:
      row.published_at,
    revealedWinnerCount:
      revealedWinners.length,
    totalWinnerCount:
      winners.length,
    winners:
      revealedWinners,
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
    prizeType:
      row.prize_type,
    prizeName:
      row.prize_name,
    prizeImageUrl:
      row.prize_image_url,
    displayedPrizeValue:
      getPrizeValue(
        row.displayed_prize_value,
      ),
    winnerCount:
      row.winner_count,
    eligibleEntryCount:
      row.eligible_entry_count,
    executedAt:
      row.executed_at,
    publishedAt:
      row.published_at,
    winners:
      winners.map(mapWinner),
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

  return (
    result.rows[0] ?? null
  );
}

async function sendTelegramResultMessage(
  chatId: number | string,
  message: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram result notification skipped: TELEGRAM_BOT_TOKEN is missing.",
    );
    return false;
  }

  try {
    const response =
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🎟️ ADDIS ዕጣ ክፈት",
                    web_app: {
                      url: MINI_APP_URL,
                    },
                  },
                ],
              ],
            },
          }),
        },
      );

    const data =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

    if (
      !response.ok ||
      !data.ok
    ) {
      console.error(
        "Telegram result notification failed:",
        data.description ??
          response.statusText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram result notification request failed:",
      error,
    );
    return false;
  }
}

async function sendTelegramWinnerClaimMessage(
  chatId: number | string,
  message: string,
  claimUrl: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram winner claim notification skipped: TELEGRAM_BOT_TOKEN is missing.",
    );
    return false;
  }

  try {
    const response =
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🏆 የሽልማት ጥያቄ ጀምር",
                    url: claimUrl,
                  },
                ],
                [
                  {
                    text:
                      "🎟️ ADDIS ዕጣ ክፈት",
                    web_app: {
                      url: MINI_APP_URL,
                    },
                  },
                ],
              ],
            },
          }),
        },
      );

    const data =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

    if (
      !response.ok ||
      !data.ok
    ) {
      console.error(
        "Telegram winner claim notification failed:",
        data.description ??
          response.statusText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram winner claim notification request failed:",
      error,
    );
    return false;
  }
}

async function getTelegramBotUsername(): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    return null;
  }

  try {
    const response =
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
        {
          method: "GET",
          headers: {
            accept:
              "application/json",
          },
        },
      );

    const data =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
        result?: {
          username?: string;
        };
      };

    if (
      !response.ok ||
      !data.ok ||
      !data.result?.username
    ) {
      console.error(
        "Telegram bot username lookup failed:",
        data.description ??
          response.statusText,
      );
      return null;
    }

    return data.result.username;
  } catch (error) {
    console.error(
      "Telegram bot username lookup request failed:",
      error,
    );
    return null;
  }
}

function getWinnerDisplayName(
  winner: PublicWinner,
): string {
  const fullName = [
    winner.firstName,
    winner.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (winner.username) {
    return `@${winner.username}`;
  }

  return "ተሳታፊ";
}

async function ensureWinnerPayoutRows(
  drawId: string,
): Promise<void> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  await pool.query(
    `
      INSERT INTO winner_payouts (
        winner_id,
        draw_id,
        user_id,
        prize_amount
      )
      SELECT
        w.id,
        w.draw_id,
        w.user_id,
        w.prize_amount
      FROM winners w
      WHERE w.draw_id = $1
      ON CONFLICT (winner_id)
      DO NOTHING
    `,
    [drawId],
  );
}

async function getWinnerNotificationRows(
  drawId: string,
): Promise<WinnerNotificationRow[]> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<WinnerNotificationRow>(
      `
        SELECT
          w.id AS winner_id,
          u.telegram_id,
          w.rank,
          e.number,
          w.prize_amount,
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

async function sendWinnerClaimNotifications(
  row: ResultRow,
): Promise<void> {
  if (
    !pool ||
    !TELEGRAM_BOT_TOKEN
  ) {
    return;
  }

  await ensureWinnerPayoutRows(
    row.draw_id,
  );

  const botUsername =
    await getTelegramBotUsername();

  if (!botUsername) {
    return;
  }

  const winners =
    await getWinnerNotificationRows(
      row.draw_id,
    );

  if (
    winners.length === 0
  ) {
    return;
  }

  for (
    const winner of winners
  ) {
    if (
      winner.telegram_id === null ||
      winner.telegram_id === undefined
    ) {
      continue;
    }

    const alreadySent =
      await pool.query(
        `
          SELECT id
          FROM audit_logs
          WHERE action =
            'WINNER_CLAIM_TELEGRAM_NOTIFICATION'
            AND entity_type = 'winner'
            AND entity_id = $1
          LIMIT 1
        `,
        [winner.winner_id],
      );

    if (
      alreadySent.rows.length > 0
    ) {
      continue;
    }

    const claimUrl =
      `https://t.me/${botUsername}?start=claim_${winner.winner_id}`;

    const winnerName =
      [
        winner.first_name,
        winner.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      (winner.username
        ? `@${winner.username}`
        : "ተሳታፊ");

    const message =
      "🏆 ADDIS ዕጣ — አሸናፊ ነዎት!\n\n" +
      `🏷️ ዕጣ: ${row.draw_name}\n` +
      `🥇 ደረጃ: ${winner.rank}ኛ\n` +
      `🎟️ የዕጣ ቁጥር: #${winner.number}\n` +
      `👤 ስም: ${winnerName}\n` +
      `💰 ሽልማት: ${Number(
        winner.prize_amount,
      ).toLocaleString(
        "en-US",
      )} ብር\n\n` +
      "የሽልማት ጥያቄዎን ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ።\n" +
      "ከዚያ የአሸናፊነትዎን ማረጋገጫ ስክሪንሾት በግል ይላኩ።";

    const sent =
      await sendTelegramWinnerClaimMessage(
        winner.telegram_id,
        message,
        claimUrl,
      );

    if (!sent) {
      continue;
    }

    await pool.query(
      `
        UPDATE winner_payouts
        SET
          telegram_claim_message_id = NULLIF(
            telegram_claim_message_id,
            telegram_claim_message_id
          ),
          updated_at = NOW()
        WHERE winner_id = $1
      `,
      [winner.winner_id],
    );

    await pool.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        SELECT
          w.user_id,
          'WINNER_CLAIM_TELEGRAM_NOTIFICATION',
          'winner',
          w.id,
          $2
        FROM winners w
        WHERE w.id = $1
      `,
      [
        winner.winner_id,
        JSON.stringify({
          sentAt:
            new Date().toISOString(),
          telegramId:
            winner.telegram_id,
          claimUrl,
        }),
      ],
    );
  }
}

async function sendPublishedResultToTelegram(
  row: ResultRow,
  winners: PublicWinner[],
): Promise<void> {
  if (
    !pool ||
    !TELEGRAM_BOT_TOKEN
  ) {
    return;
  }

  const existing =
    await pool.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM audit_logs
        WHERE action =
          'DRAW_RESULT_TELEGRAM_NOTIFICATION'
          AND entity_type = 'draw'
          AND entity_id = $1
        LIMIT 1
      `,
      [row.draw_id],
    );

  if (
    existing.rows.length === 0
  ) {
    const recipients =
      await pool.query<{
        telegram_id:
          | number
          | string;
      }>(
        `
          SELECT telegram_id
          FROM users
          WHERE telegram_id IS NOT NULL
          ORDER BY created_at ASC
        `,
      );

    if (
      recipients.rows.length > 0
    ) {
      const winnerLines =
        winners
          .slice()
          .sort(
            (a, b) =>
              a.rank - b.rank,
          )
          .map(
            (winner) =>
              `${winner.rank}ኛ — ${getWinnerDisplayName(
                winner,
              )} — #${winner.number} — ${winner.prizeAmount.toLocaleString(
                "en-US",
              )} ብር`,
          )
          .join("\n");

      const message =
        "🎉 ADDIS ዕጣ — የመጨረሻ ውጤት!\n\n" +
        `🏷️ ዕጣ: ${row.draw_name}\n` +
        `🏆 ሽልማት: ${row.prize_name}\n\n` +
        "🥇 አሸናፊዎች:\n" +
        winnerLines +
        "\n\n🔐 Secure Random Draw\n" +
        "✅ ውጤቱ በተሳካ ሁኔታ ታትሟል။";

      let sent = 0;

      for (
        const recipient of
          recipients.rows
      ) {
        if (
          await sendTelegramResultMessage(
            recipient.telegram_id,
            message,
          )
        ) {
          sent += 1;
        }
      }

      if (sent > 0) {
        await pool.query(
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
              'DRAW_RESULT_TELEGRAM_NOTIFICATION',
              'draw',
              $1,
              $2
            )
          `,
          [
            row.draw_id,
            JSON.stringify({
              sent,
              sentAt:
                new Date().toISOString(),
            }),
          ],
        );
      }
    }
  }

  /*
   * Winner-specific claim notification
   * is deliberately independent from the
   * broadcast-result audit above.
   *
   * This means an old draw-result notification
   * can never prevent the winner claim link
   * from being created/sent.
   */
  try {
    await sendWinnerClaimNotifications(
      row,
    );
  } catch (error) {
    console.error(
      "Failed to send winner claim notifications:",
      error,
    );
  }
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
  if (
    totalWinners <= 0
  ) {
    return 0;
  }

  const executedMs =
    new Date(
      executedAt,
    ).getTime();

  if (
    !Number.isFinite(
      executedMs,
    )
  ) {
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

function getFinalRevealAtMs(
  executedAt: string,
  totalWinners: number,
): number {
  const executedMs =
    new Date(
      executedAt,
    ).getTime();

  if (
    !Number.isFinite(
      executedMs,
    )
  ) {
    return Number.POSITIVE_INFINITY;
  }

  if (
    totalWinners <= 0
  ) {
    return executedMs;
  }

  return (
    executedMs +
    FIRST_REVEAL_DELAY_MS +
    Math.max(
      0,
      totalWinners - 1,
    ) *
      REVEAL_INTERVAL_MS
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
    await getResultRow(
      drawId,
    );

  if (!row) {
    return null;
  }

  const winners =
    await getWinnerRows(
      drawId,
    );

  const allWinners =
    winners.map(mapWinner);

  if (
    row.published_at !== null
  ) {
    return mapLiveState(
      row,
      winners,
      allWinners,
      "completed",
    );
  }

  const nowMs =
    Date.now();

  const revealCount =
    getRevealCount(
      row.executed_at,
      winners.length,
      nowMs,
    );

  const finalRevealAtMs =
    getFinalRevealAtMs(
      row.executed_at,
      winners.length,
    );

  if (
    winners.length > 0 &&
    revealCount >=
      winners.length &&
    nowMs >= finalRevealAtMs
  ) {
    const publishedAt =
      new Date().toISOString();

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const publishResult =
        await client.query<{
          draw_id: string;
        }>(
          `
            UPDATE draw_results
            SET
              published_at =
                COALESCE(
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

      await client.query(
        "COMMIT",
      );

      if (
        publishResult.rows.length > 0
      ) {
        console.log(
          `Live draw completed: ${drawId}`,
        );

        try {
          const completedRowForTelegram =
            await getResultRow(
              drawId,
            );

          if (
            completedRowForTelegram
          ) {
            await sendPublishedResultToTelegram(
              completedRowForTelegram,
              allWinners,
            );
          }
        } catch (
          notificationError
        ) {
          console.error(
            "Failed to send final draw result to Telegram:",
            notificationError,
          );
        }
      }
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );
      throw error;
    } finally {
      client.release();
    }

    const completedRow =
      await getResultRow(
        drawId,
      );

    if (
      completedRow?.published_at
    ) {
      return mapLiveState(
        completedRow,
        winners,
        allWinners,
        "completed",
      );
    }
  }

  const revealedWinners =
    allWinners.slice(
      0,
      revealCount,
    );

  return mapLiveState(
    row,
    winners,
    revealedWinners,
    "drawing",
  );
}

/**
 * Finds the currently running live draw
 * directly from the draw_results/draws state.
 *
 * The public Mini App uses this endpoint
 * for discovery so it does not depend on the
 * normal /draws list being up to date.
 */
export async function getCurrentLiveDrawState(): Promise<
  LiveDrawState | null
> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM draws
        WHERE status = 'drawing'
        ORDER BY
          updated_at DESC,
          created_at DESC
        LIMIT 1
      `,
    );

  const drawId =
    result.rows[0]?.id;

  if (!drawId) {
    return null;
  }

  return getLiveDrawState(
    drawId,
  );
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
    await getResultRow(
      drawId,
    );

  if (
    !resultRow ||
    !resultRow.published_at
  ) {
    return null;
  }

  const winnerRows =
    await getWinnerRows(
      drawId,
    );

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
        WHERE w.draw_id = ANY(
          $1::uuid[]
        )
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
    const winner of
      winnerRows.rows
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
