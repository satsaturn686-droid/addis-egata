import { pool } from "../db.js";
import { executeDraw } from "../services/draw-engine.js";

type ScheduledDrawRow = {
  id: string;
  name: string;
  draw_at: string;
  created_by: string | null;
};

type RecipientRow = {
  telegram_id: number | string;
};

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

function formatDateTime(
  value: string,
): string {
  return new Intl.DateTimeFormat(
    "am-ET",
    {
      timeZone: "Africa/Addis_Ababa",
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function formatRemaining(
  milliseconds: number,
): string {
  const totalSeconds = Math.max(
    Math.ceil(milliseconds / 1000),
    0,
  );

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds =
    totalSeconds % 60;

  if (days > 0) {
    return `${days} ቀን ${hours} ሰዓት ${minutes} ደቂቃ`;
  }

  if (hours > 0) {
    return `${hours} ሰዓት ${minutes} ደቂቃ`;
  }

  if (minutes > 0) {
    return `${minutes} ደቂቃ ${seconds} ሰከንድ`;
  }

  return `${seconds} ሰከንድ`;
}

async function sendTelegramMessage(
  chatId: number | string,
  message: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Scheduled draw Telegram notification skipped: TELEGRAM_BOT_TOKEN is missing.",
    );

    return false;
  }

  try {
    const response = await fetch(
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
                  text: "🎟️ ADDIS ዕጣ ክፈት",
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

    const payload =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

    if (!response.ok || !payload.ok) {
      console.error(
        "Scheduled draw Telegram error:",
        payload.description ??
          response.statusText,
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Scheduled draw Telegram request failed:",
      error,
    );

    return false;
  }
}

async function getRecipients(): Promise<
  RecipientRow[]
> {
  if (!pool) {
    return [];
  }

  const result =
    await pool.query<RecipientRow>(
      `
        SELECT telegram_id
        FROM users
        WHERE telegram_id IS NOT NULL
        ORDER BY id
      `,
    );

  return result.rows;
}

async function getAdmins(): Promise<
  RecipientRow[]
> {
  if (!pool) {
    return [];
  }

  const result =
    await pool.query<RecipientRow>(
      `
        SELECT telegram_id
        FROM users
        WHERE is_admin = TRUE
          AND telegram_id IS NOT NULL
        ORDER BY id
      `,
    );

  return result.rows;
}

async function claimEvent(
  drawId: string,
  event: string,
): Promise<boolean> {
  if (!pool) {
    return false;
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [`scheduled-draw:${drawId}:${event}`],
    );

    const existing =
      await client.query(
        `
          SELECT 1
          FROM audit_logs
          WHERE action = 'SCHEDULED_DRAW_NOTIFICATION'
            AND entity_type = 'draw'
            AND entity_id = $1
            AND details->>'event' = $2
          LIMIT 1
        `,
        [drawId, event],
      );

    if (
      (existing.rowCount ?? 0) > 0
    ) {
      await client.query("ROLLBACK");
      return false;
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
          NULL,
          'SCHEDULED_DRAW_NOTIFICATION',
          'draw',
          $1,
          $2
        )
      `,
      [
        drawId,
        JSON.stringify({
          event,
          createdAt:
            new Date().toISOString(),
        }),
      ],
    );

    await client.query("COMMIT");

    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function notifyRecipients(
  recipients: RecipientRow[],
  message: string,
): Promise<void> {
  for (const recipient of recipients) {
    await sendTelegramMessage(
      recipient.telegram_id,
      message,
    );
  }
}

export async function scheduleDraw(
  adminUserId: string,
  drawId: string,
  drawAt: string,
): Promise<string> {
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

  const timestamp =
    new Date(drawAt);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    throw new Error(
      "DRAW_TIME_INVALID",
    );
  }

  if (
    timestamp.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "DRAW_TIME_MUST_BE_IN_FUTURE",
    );
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const result =
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
        [drawId],
      );

    const draw =
      result.rows[0];

    if (!draw) {
      throw new Error(
        "DRAW_NOT_FOUND",
      );
    }

    if (
      draw.status !== "full"
    ) {
      throw new Error(
        "DRAW_MUST_BE_FULL_TO_SCHEDULE",
      );
    }

    const existingResult =
      await client.query(
        `
          SELECT 1
          FROM draw_results
          WHERE draw_id = $1
          LIMIT 1
        `,
        [drawId],
      );

    if (
      (existingResult.rowCount ?? 0) >
      0
    ) {
      throw new Error(
        "DRAW_ALREADY_EXECUTED",
      );
    }

    await client.query(
      `
        UPDATE draws
        SET
          draw_at = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [
        timestamp.toISOString(),
        drawId,
      ],
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
          'DRAW_SCHEDULED',
          'draw',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        drawId,
        JSON.stringify({
          drawAt:
            timestamp.toISOString(),
          scheduledAt:
            new Date().toISOString(),
        }),
      ],
    );

    await client.query("COMMIT");

    return timestamp.toISOString();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processScheduledDraws(): Promise<{
  remindersSent: number;
  drawsExecuted: number;
  executionFailures: number;
}> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  let remindersSent = 0;
  let drawsExecuted = 0;
  let executionFailures = 0;

  const upcoming =
    await pool.query<ScheduledDrawRow>(
      `
        SELECT
          id,
          name,
          draw_at,
          created_by
        FROM draws
        WHERE status = 'full'
          AND draw_at IS NOT NULL
          AND draw_at > NOW()
          AND draw_at <= NOW() + INTERVAL '10 minutes'
        ORDER BY draw_at ASC
      `,
    );

  const recipients =
    await getRecipients();

  for (const draw of upcoming.rows) {
    const remaining =
      new Date(
        draw.draw_at,
      ).getTime() - Date.now();

    const event =
      remaining <= 60_000
        ? "reminder_1_minute"
        : "reminder_10_minutes";

    const claimed =
      await claimEvent(
        draw.id,
        event,
      );

    if (!claimed) {
      continue;
    }

    const message =
      remaining <= 60_000
        ? (
            "⏰ ADDIS ዕጣ — 1 ደቂቃ ቀርቷል!\n\n" +
            `🎟️ ${draw.name}\n` +
            `🕐 የሚወጣበት ጊዜ: ${formatDateTime(draw.draw_at)}\n` +
            "🎲 Secure Random Draw በራስ-ሰር ይጀምራል።"
          )
        : (
            "⏳ ADDIS ዕጣ — Countdown ጀምሯል!\n\n" +
            `🎟️ ${draw.name}\n` +
            `🕐 የሚወጣበት ጊዜ: ${formatDateTime(draw.draw_at)}\n` +
            `⏱️ የቀረው: ${formatRemaining(remaining)}\n\n` +
            "🎲 ጊዜው ሲደርስ Secure Random Draw በራስ-ሰር ይጀምራል።"
          );

    await notifyRecipients(
      recipients,
      message,
    );

    remindersSent += 1;
  }

  const due =
    await pool.query<ScheduledDrawRow>(
      `
        SELECT
          id,
          name,
          draw_at,
          created_by
        FROM draws
        WHERE status = 'full'
          AND draw_at IS NOT NULL
          AND draw_at <= NOW()
        ORDER BY draw_at ASC
        LIMIT 50
      `,
    );

  for (const draw of due.rows) {
    if (!draw.created_by) {
      executionFailures += 1;
      continue;
    }

    try {
      await executeDraw(
        draw.created_by,
        draw.id,
      );

      drawsExecuted += 1;

      const claimed =
        await claimEvent(
          draw.id,
          "draw_started",
        );

      if (claimed) {
        await notifyRecipients(
          recipients,
          (
            "🎲 ADDIS ዕጣ — ዕጣው ጀምሯል!\n\n" +
            `🎟️ ${draw.name}\n\n` +
            "🔐 Secure Random Draw ተፈጽሟል።\n" +
            "📺 Live Number Reveal አሁን ይጀምራል።"
          ),
        );
      }
    } catch (error) {
      executionFailures += 1;

      const message =
        error instanceof Error
          ? error.message
          : "DRAW_EXECUTION_FAILED";

      const claimed =
        await claimEvent(
          draw.id,
          `execution_failed:${message}`,
        );

      if (claimed) {
        const admins =
          await getAdmins();

        await notifyRecipients(
          admins,
          (
            "⚠️ ADDIS ዕጣ — Automatic Draw አልተሳካም\n\n" +
            `🎟️ ${draw.name}\n` +
            `❌ ${message}\n\n` +
            "ዕጣው አልተሰረዘም።"
          ),
        );
      }

      console.error(
        `Scheduled draw failed: ${draw.id}`,
        error,
      );
    }
  }

  return {
    remindersSent,
    drawsExecuted,
    executionFailures,
  };
}
