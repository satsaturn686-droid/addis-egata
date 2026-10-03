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
