import { pool, query } from "../db.js";

import {
  executeDraw,
} from "./draw-engine.js";

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

const ADDIS_TIME_ZONE =
  "Africa/Addis_Ababa";

const TEN_MINUTES_MS =
  10 * 60 * 1000;

const ONE_MINUTE_MS =
  60 * 1000;

type ScheduledDrawRow = {
  id: string;
  name: string;
  status: string;
  draw_at: string | Date;
  created_by: string | null;
  total_numbers: number;
  winner_count: number;
};

type TelegramRecipient = {
  telegram_id: number | string;
};

type ScheduleResult = {
  drawId: string;
  drawAt: string;
};

type ScheduledJobResult = {
  remindersSent: number;
  drawsExecuted: number;
  executionFailures: number;
};

function formatDateTime(
  value: string | Date,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "am-ET",
    {
      timeZone: ADDIS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
  ).format(date);
}

function formatRemaining(
  milliseconds: number,
): string {
  const safe = Math.max(
    0,
    milliseconds,
  );

  const totalSeconds =
    Math.floor(safe / 1000);

  const days =
    Math.floor(
      totalSeconds / 86400,
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) /
        3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60,
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
      "Scheduled draw notification skipped: TELEGRAM_BOT_TOKEN is missing.",
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

    if (!response.ok || !data.ok) {
      console.error(
        "Telegram scheduled draw notification failed:",
        data.description ??
          response.statusText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram scheduled draw notification request failed:",
      error,
    );
    return false;
  }
}

async function getRecipients(): Promise<
  TelegramRecipient[]
> {
  return query<TelegramRecipient>(
    `
      SELECT telegram_id
      FROM users
      WHERE telegram_id IS NOT NULL
      ORDER BY created_at ASC
    `,
  );
}

async function getAdminRecipients(): Promise<
  TelegramRecipient[]
> {
  return query<TelegramRecipient>(
    `
      SELECT telegram_id
      FROM users
      WHERE is_admin = TRUE
        AND telegram_id IS NOT NULL
      ORDER BY created_at ASC
    `,
  );
}

async function sendToRecipients(
  recipients: TelegramRecipient[],
  message: string,
): Promise<number> {
  let sent = 0;

  for (const recipient of recipients) {
    const ok =
      await sendTelegramMessage(
        recipient.telegram_id,
        message,
      );

    if (ok) {
      sent += 1;
    }
  }

  return sent;
}

function buildScheduledMessage(
  draw: ScheduledDrawRow,
): string {
  return (
    "⏰ ADDIS ዕጣ — የዕጣ ጊዜ ተይዟል!\n\n" +
    `🏷️ ዕጣ: ${draw.name}\n` +
    `📅 የሚወጣበት ጊዜ: ${formatDateTime(draw.draw_at)}\n` +
    `⏳ ቀሪ ጊዜ: ${formatRemaining(
      new Date(draw.draw_at).getTime() -
        Date.now(),
    )}\n\n` +
    "🔒 በዚያ ጊዜ Secure Random ስርዓት በራስ-ሰር ዕጣውን ያወጣል።\n" +
    "🎬 ከዚያ Live Number Reveal ይጀምራል።\n\n" +
    "🎟️ የADDIS ዕጣ ውጤቱን ለመከታተል ከታች ያለውን ይጫኑ።"
  );
}

function buildReminderMessage(
  draw: ScheduledDrawRow,
  reminderMinutes: 10 | 1,
): string {
  const remaining =
    new Date(draw.draw_at).getTime() -
    Date.now();

  return (
    `⏰ ADDIS ዕጣ — ${reminderMinutes} ደቂቃ ቀርቷል!\n\n` +
    `🏷️ ዕጣ: ${draw.name}\n` +
    `📅 የሚወጣበት ጊዜ: ${formatDateTime(draw.draw_at)}\n` +
    `⏳ ቀሪ ጊዜ: ${formatRemaining(remaining)}\n\n` +
    "🔒 Secure Random Draw በራስ-ሰር ይጀምራል።\n" +
    "🎬 ከዚያ Live Number Reveal ይጀምራል።\n\n" +
    "🎟️ ውጤቱን ለመከታተል ADDIS ዕጣን ክፈት።"
  );
}

function buildExecutionStartedMessage(
  draw: ScheduledDrawRow,
): string {
  return (
    "🎲 ADDIS ዕጣ — ዕጣው ተጀምሯል!\n\n" +
    `🏷️ ዕጣ: ${draw.name}\n\n` +
    "🔐 Secure Random Draw ተፈጽሟል።\n" +
    "🎬 Live Number Reveal አሁን ተጀምሯል።\n\n" +
    "🏆 አሸናፊዎቹ በቅደም ተከተል በLive ይገለጣሉ።"
  );
}

function buildExecutionFailureMessage(
  draw: ScheduledDrawRow,
  errorCode: string,
): string {
  return (
    "⚠️ ADDIS ዕጣ — የራስ-ሰር ዕጣ አልተፈጸመም!\n\n" +
    `🏷️ ዕጣ: ${draw.name}\n` +
    `❗ ምክንያት: ${errorCode}\n\n` +
    "🔒 የዕጣ ውጤት በከፊል አልተፈጠረም።\n" +
    "👤 እባክዎ የAdmin ገጹን ይመልከቱ።"
  );
}

async function getScheduledDraw(
  drawId: string,
): Promise<ScheduledDrawRow | null> {
  const rows =
    await query<ScheduledDrawRow>(
      `
        SELECT
          id,
          name,
          status,
          draw_at,
          created_by,
          total_numbers,
          winner_count
        FROM draws
        WHERE id = $1
        LIMIT 1
      `,
      [drawId],
    );

  return rows[0] ?? null;
}

async function notificationAlreadySent(
  drawId: string,
  eventType: string,
): Promise<boolean> {
  const rows =
    await query<{ id: string }>(
      `
        SELECT id
        FROM audit_logs
        WHERE action = 'DRAW_SCHEDULE_NOTIFICATION'
          AND entity_type = 'draw'
          AND entity_id = $1
          AND details->>'eventType' = $2
        LIMIT 1
      `,
      [
        drawId,
        eventType,
      ],
    );

  return rows.length > 0;
}

async function markNotificationSent(
  drawId: string,
  eventType: string,
): Promise<void> {
  await query(
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
        'DRAW_SCHEDULE_NOTIFICATION',
        'draw',
        $1,
        $2
      )
    `,
    [
      drawId,
      JSON.stringify({
        eventType,
        sentAt:
          new Date().toISOString(),
      }),
    ],
  );
}

export async function scheduleDraw(
  adminUserId: string,
  drawId: string,
  drawAtInput: string,
): Promise<ScheduleResult> {
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

  const drawAt =
    new Date(drawAtInput);

  if (Number.isNaN(drawAt.getTime())) {
    throw new Error(
      "DRAW_TIME_INVALID",
    );
  }

  if (drawAt.getTime() <= Date.now()) {
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
        status: string;
        draw_at: string | null;
        created_by: string | null;
      }>(
        `
          SELECT
            id,
            status,
            draw_at,
            created_by
          FROM draws
          WHERE id = $1
          FOR UPDATE
        `,
        [drawId],
      );

    if (result.rows.length === 0) {
      throw new Error(
        "DRAW_NOT_FOUND",
      );
    }

    const draw =
      result.rows[0];

    if (draw.status !== "full") {
      throw new Error(
        "DRAW_MUST_BE_FULL_TO_SCHEDULE",
      );
    }

    const wasScheduled =
      Boolean(draw.draw_at);

    await client.query(
      `
        UPDATE draws
        SET
          draw_at = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [
        drawAt.toISOString(),
        drawId,
      ],
    );

    if (wasScheduled) {
      await client.query(
        `
          DELETE FROM audit_logs
          WHERE action = 'DRAW_SCHEDULE_NOTIFICATION'
            AND entity_type = 'draw'
            AND entity_id = $1
            AND details->>'eventType' IN (
              'REMINDER_10_MINUTES',
              'REMINDER_1_MINUTE'
            )
        `,
        [drawId],
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
          $2,
          'draw',
          $3,
          $4
        )
      `,
      [
        adminUserId,
        wasScheduled
          ? "DRAW_RESCHEDULED"
          : "DRAW_SCHEDULED",
        drawId,
        JSON.stringify({
          drawAt:
            drawAt.toISOString(),
          previousDrawAt:
            draw.draw_at,
          scheduledAt:
            new Date().toISOString(),
        }),
      ],
    );

    await client.query("COMMIT");

    const drawForNotification =
      await getScheduledDraw(
        drawId,
      );

    if (drawForNotification) {
      const recipients =
        await getRecipients();

      await sendToRecipients(
        recipients,
        buildScheduledMessage(
          drawForNotification,
        ),
      );
    }

    return {
      drawId,
      drawAt:
        drawAt.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processUpcomingDraw(
  draw: ScheduledDrawRow,
): Promise<number> {
  const drawTime =
    new Date(draw.draw_at).getTime();

  const remaining =
    drawTime - Date.now();

  if (
    remaining <= 0 ||
    remaining > TEN_MINUTES_MS
  ) {
    return 0;
  }

  const reminderType =
    remaining <= ONE_MINUTE_MS
      ? "REMINDER_1_MINUTE"
      : "REMINDER_10_MINUTES";

  if (
    await notificationAlreadySent(
      draw.id,
      reminderType,
    )
  ) {
    return 0;
  }

  const recipients =
    await getRecipients();

  const reminderMinutes =
    remaining <= ONE_MINUTE_MS
      ? 1
      : 10;

  const sent =
    await sendToRecipients(
      recipients,
      buildReminderMessage(
        draw,
        reminderMinutes,
      ),
    );

  if (sent > 0) {
    await markNotificationSent(
      draw.id,
      reminderType,
    );
  }

  return sent;
}

async function executeScheduledDraw(
  draw: ScheduledDrawRow,
): Promise<{
  executed: boolean;
  failed: boolean;
}> {
  if (!draw.created_by) {
    throw new Error(
      "SCHEDULED_DRAW_CREATED_BY_MISSING",
    );
  }

  try {
    await executeDraw(
      draw.created_by,
      draw.id,
    );

    const updatedDraw =
      (await getScheduledDraw(
        draw.id,
      )) ?? draw;

    const recipients =
      await getRecipients();

    await sendToRecipients(
      recipients,
      buildExecutionStartedMessage(
        updatedDraw,
      ),
    );

    return {
      executed: true,
      failed: false,
    };
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message
        : "DRAW_EXECUTION_FAILED";

    const benignExecutionRace =
      errorCode ===
        "DRAW_ALREADY_EXECUTED" ||
      errorCode ===
        "DRAW_NOT_READY_FOR_DRAWING";

    if (benignExecutionRace) {
      console.log(
        `Scheduled draw skipped because it is already being processed or completed: draw=${draw.id}, error=${errorCode}`,
      );

      return {
        executed: false,
        failed: false,
      };
    }

    console.error(
      `Scheduled draw failed: draw=${draw.id}, error=${errorCode}`,
    );

    const admins =
      await getAdminRecipients();

    await sendToRecipients(
      admins,
      buildExecutionFailureMessage(
        draw,
        errorCode,
      ),
    );

    return {
      executed: false,
      failed: true,
    };
  }
}

export async function processScheduledDraws(): Promise<
  ScheduledJobResult
> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const rows =
    await query<ScheduledDrawRow>(
      `
        SELECT
          id,
          name,
          status,
          draw_at,
          created_by,
          total_numbers,
          winner_count
        FROM draws
        WHERE status = 'full'
          AND draw_at IS NOT NULL
        ORDER BY draw_at ASC
      `,
    );

  let remindersSent = 0;
  let drawsExecuted = 0;
  let executionFailures = 0;

  for (const draw of rows) {
    const drawTime =
      new Date(
        draw.draw_at,
      ).getTime();

    if (Number.isNaN(drawTime)) {
      console.error(
        `Invalid scheduled draw time: draw=${draw.id}`,
      );
      continue;
    }

    if (drawTime > Date.now()) {
      remindersSent +=
        await processUpcomingDraw(
          draw,
        );
      continue;
    }

    const execution =
      await executeScheduledDraw(
        draw,
      );

    if (execution.executed) {
      drawsExecuted += 1;
    }

    if (execution.failed) {
      executionFailures += 1;
    }
  }

  return {
    remindersSent,
    drawsExecuted,
    executionFailures,
  };
}
