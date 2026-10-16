import { query } from "../db.js";

type DrawNotification = {
  id: string;
  name: string;
  prizeName: string;
  prizeType: "cash" | "physical";
  displayedPrizeValue: number | null;
  totalNumbers: number;
  entryFee: number;
  winnerCount: number;
};

type TelegramRecipient = {
  telegram_id: number | string;
};

type OccupancyNotificationEvent =
  | "occupancy_80"
  | "occupancy_90"
  | "draw_full";

export type PaymentNotification = {
  userId: string;
  drawId: string;
  number: number;
  amount: number;
  rejectionReason?: string | null;
};

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

function getTelegramApiUrl(
  method: string,
): string {
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram notification skipped: TELEGRAM_BOT_TOKEN is missing.",
    );

    return false;
  }

  try {
    const response = await fetch(
      getTelegramApiUrl("sendMessage"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
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

    const data = (await response.json()) as {
      ok?: boolean;
      description?: string;
    };

    if (!response.ok || !data.ok) {
      console.error(
        `Telegram notification failed for ${chatId}:`,
        data.description ??
          response.statusText,
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Telegram notification request failed for ${chatId}:`,
      error,
    );

    return false;
  }
}

function formatMoney(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDrawNumber(
  number: number,
  totalNumbers: number,
): string {
  const width = Math.max(
    2,
    String(Math.max(totalNumbers, 1)).length,
  );

  return `#${String(number).padStart(width, "0")}`;
}

function buildDrawNotification(
  draw: DrawNotification,
): string {
  const prizeLabel =
    draw.prizeType === "cash" &&
    draw.displayedPrizeValue !== null
      ? `💰 የሽልማት ዋጋ: ${formatMoney(
          draw.displayedPrizeValue,
        )} ብር`
      : `🎁 ሽልማት: ${draw.prizeName}`;

  return (
    "🎟️ ADDIS ዕጣ — አዲስ ዕጣ ተከፍቷል!\n\n" +
    `🏷️ ${draw.name}\n` +
    `🎁 ${draw.prizeName}\n` +
    `${prizeLabel}\n` +
    `💳 መግቢያ: ${formatMoney(
      draw.entryFee,
    )} ብር\n` +
    `👥 ቁጥሮች: ${draw.totalNumbers}\n` +
    `🏆 አሸናፊዎች: ${draw.winnerCount}\n\n` +
    "🔒 ቁጥሮች ሲሞሉ ዕጣው ይዘጋል።\n\n" +
    "🔢 ቁጥርህን ምረጥ፣ በTelebirr ክፈል፣ በዕጣው ተሳተፍ።"
  );
}

function buildOccupancyNotification(
  draw: DrawNotification,
  event: OccupancyNotificationEvent,
  paidCount: number,
): string {
  const percentage =
    draw.totalNumbers > 0
      ? Math.floor(
          (paidCount / draw.totalNumbers) *
            100,
        )
      : 0;

  const remaining = Math.max(
    draw.totalNumbers - paidCount,
    0,
  );

  if (event === "draw_full") {
    return (
      "🔴 ADDIS ዕጣ — ዕጣው ሞልቷል!\n\n" +
      `🏷️ ${draw.name}\n` +
      `👥 ተሳታፊዎች: ${paidCount} / ${draw.totalNumbers}\n` +
      "📊 ሙላት: 100%\n\n" +
      "🔒 ሁሉም ቁጥሮች ተይዘዋል።\n" +
      "⏳ የዕጣውን ውጤት ይጠብቁ።"
    );
  }

  if (event === "occupancy_90") {
    return (
      "🟠 ADDIS ዕጣ — ዕጣው 90% ሞልቷል!\n\n" +
      `🏷️ ${draw.name}\n` +
      `👥 ተሳታፊዎች: ${paidCount} / ${draw.totalNumbers}\n` +
      `📊 ሙላት: ${percentage}%\n` +
      `🟢 ነፃ ቁጥሮች: ${remaining}\n\n` +
      "🔥 ጥቂት ቁጥሮች ብቻ ቀርተዋል።"
    );
  }

  return (
    "🟡 ADDIS ዕጣ — ዕጣው 80% ሞልቷል!\n\n" +
    `🏷️ ${draw.name}\n` +
    `👥 ተሳታፊዎች: ${paidCount} / ${draw.totalNumbers}\n` +
    `📊 ሙላት: ${percentage}%\n` +
    `🟢 ነፃ ቁጥሮች: ${remaining}\n\n` +
    "🎟️ ቁጥርህን ለመምረጥ ADDIS ዕጣን ክፈት።"
  );
}

function buildPaymentApprovedNotification(
  drawName: string,
  payment: PaymentNotification,
): string {
  return (
    "✅ ADDIS ዕጣ — ክፍያህ ተረጋግጧል!\n\n" +
    `🏷️ ዕጣ: ${drawName}\n` +
    `🔢 ቁጥር: ${formatDrawNumber(
      payment.number,
      payment.number,
    )}\n` +
    `💳 የተከፈለ: ${formatMoney(
      payment.amount,
    )} ብር\n\n` +
    "🎉 ተሳትፎህ ተረጋግጧል። ቁጥርህ በስምህ ተመዝግቧል።"
  );
}

function buildPaymentRejectedNotification(
  drawName: string,
  payment: PaymentNotification,
): string {
  const reason =
    payment.rejectionReason?.trim() ||
    "ክፍያው በአስተዳደሩ አልተረጋገጠም።";

  return (
    "❌ ADDIS ዕጣ — ክፍያህ አልተረጋገጠም!\n\n" +
    `🏷️ ዕጣ: ${drawName}\n` +
    `🔢 ቁጥር: ${formatDrawNumber(
      payment.number,
      payment.number,
    )}\n` +
    `💳 የተከፈለ: ${formatMoney(
      payment.amount,
    )} ብር\n` +
    `📝 ምክንያት: ${reason}\n\n` +
    "🔄 እባክህ ADDIS ዕጣን ክፈትና እንደገና ተሳተፍ።"
  );
}

async function getTelegramRecipients(): Promise<
  TelegramRecipient[]
> {
  return query<TelegramRecipient>(`
    SELECT telegram_id
    FROM users
    WHERE telegram_id IS NOT NULL
    ORDER BY created_at ASC
  `);
}

async function getTelegramRecipient(
  userId: string,
): Promise<TelegramRecipient | null> {
  const rows = await query<TelegramRecipient>(
    `
      SELECT telegram_id
      FROM users
      WHERE id = $1
        AND telegram_id IS NOT NULL
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

async function getDrawName(
  drawId: string,
): Promise<string> {
  const rows = await query<{ name: string }>(
    `
      SELECT name
      FROM draws
      WHERE id = $1
      LIMIT 1
    `,
    [drawId],
  );

  return rows[0]?.name ?? "ADDIS ዕጣ";
}

async function claimNotificationEvent(
  drawId: string,
  eventType: OccupancyNotificationEvent,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `
      WITH lock AS (
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      ),
      inserted AS (
        INSERT INTO audit_logs (
          action,
          entity_type,
          entity_id,
          details
        )
        SELECT
          'DRAW_NOTIFICATION',
          'draw_notification',
          $2,
          $3::jsonb
        FROM lock
        WHERE NOT EXISTS (
          SELECT 1
          FROM audit_logs
          WHERE action = 'DRAW_NOTIFICATION'
            AND entity_type = 'draw_notification'
            AND entity_id = $2
            AND details->>'eventType' = $1
        )
        RETURNING id
      )
      SELECT id
      FROM inserted
    `,
    [
      `${drawId}:${eventType}`,
      drawId,
      JSON.stringify({
        eventType,
      }),
    ],
  );

  return result.length > 0;
}

export async function notifyUserAboutPaymentApproved(
  payment: PaymentNotification,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Payment approval notification skipped because TELEGRAM_BOT_TOKEN is missing.",
    );

    return;
  }

  try {
    const recipient =
      await getTelegramRecipient(
        payment.userId,
      );

    if (!recipient) {
      console.log(
        `No Telegram recipient found for payment approval: user=${payment.userId}`,
      );

      return;
    }

    const drawName =
      await getDrawName(
        payment.drawId,
      );

    const ok =
      await sendTelegramMessage(
        recipient.telegram_id,
        buildPaymentApprovedNotification(
          drawName,
          payment,
        ),
      );

    console.log(
      `Payment approval notification completed: user=${payment.userId}, draw=${payment.drawId}, sent=${ok}`,
    );
  } catch (error) {
    console.error(
      "Payment approval notification error:",
      error,
    );
  }
}

export async function notifyUserAboutPaymentRejected(
  payment: PaymentNotification,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Payment rejection notification skipped because TELEGRAM_BOT_TOKEN is missing.",
    );

    return;
  }

  try {
    const recipient =
      await getTelegramRecipient(
        payment.userId,
      );

    if (!recipient) {
      console.log(
        `No Telegram recipient found for payment rejection: user=${payment.userId}`,
      );

      return;
    }

    const drawName =
      await getDrawName(
        payment.drawId,
      );

    const ok =
      await sendTelegramMessage(
        recipient.telegram_id,
        buildPaymentRejectedNotification(
          drawName,
          payment,
        ),
      );

    console.log(
      `Payment rejection notification completed: user=${payment.userId}, draw=${payment.drawId}, sent=${ok}`,
    );
  } catch (error) {
    console.error(
      "Payment rejection notification error:",
      error,
    );
  }
}

export async function notifyUsersAboutOpenedDraw(
  draw: DrawNotification,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Draw notification skipped because TELEGRAM_BOT_TOKEN is missing.",
    );

    return;
  }

  const recipients =
    await getTelegramRecipients();

  if (recipients.length === 0) {
    console.log(
      "No Telegram users are available for the new draw notification.",
    );

    return;
  }

  const text =
    buildDrawNotification(draw);

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const ok =
      await sendTelegramMessage(
        recipient.telegram_id,
        text,
      );

    if (ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  console.log(
    `New draw notification completed: sent=${sent}, failed=${failed}, total=${recipients.length}`,
  );
}

export async function notifyUsersAboutDrawOccupancy(
  draw: DrawNotification,
  paidCount: number,
  event: OccupancyNotificationEvent,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Occupancy notification skipped because TELEGRAM_BOT_TOKEN is missing.",
    );

    return;
  }

  if (draw.totalNumbers <= 0) {
    return;
  }

  const normalizedPaidCount = Math.max(
    0,
    Math.min(
      Math.floor(paidCount),
      draw.totalNumbers,
    ),
  );

  const percentage =
    (normalizedPaidCount /
      draw.totalNumbers) *
    100;

  if (
    event === "occupancy_80" &&
    percentage < 80
  ) {
    return;
  }

  if (
    event === "occupancy_90" &&
    percentage < 90
  ) {
    return;
  }

  if (
    event === "draw_full" &&
    normalizedPaidCount <
      draw.totalNumbers
  ) {
    return;
  }

  const claimed =
    await claimNotificationEvent(
      draw.id,
      event,
    );

  if (!claimed) {
    console.log(
      `Draw occupancy notification already claimed: ${draw.id} ${event}`,
    );

    return;
  }

  const recipients =
    await getTelegramRecipients();

  if (recipients.length === 0) {
    console.log(
      "No Telegram users are available for the occupancy notification.",
    );

    return;
  }

  const text =
    buildOccupancyNotification(
      draw,
      event,
      normalizedPaidCount,
    );

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const ok =
      await sendTelegramMessage(
        recipient.telegram_id,
        text,
      );

    if (ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  console.log(
    `Draw occupancy notification completed: event=${event}, draw=${draw.id}, paid=${normalizedPaidCount}, sent=${sent}, failed=${failed}, total=${recipients.length}`,
  );
}
