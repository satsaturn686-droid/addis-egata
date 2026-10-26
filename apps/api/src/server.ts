import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";

import { checkDatabase, pool } from "./db.js";
import authRouter from "./routes/auth.js";
import referralsRouter from "./routes/referrals.js";
import appAuthRouter from "./routes/app-auth.js";
import fullAppWinnersRouter from "./routes/full-app-winners.js";
import drawsRouter from "./routes/draws.js";
import entriesRouter from "./routes/entries.js";
import paymentsRouter from "./routes/payments.js";
import resultsRouter from "./routes/results.js";
import adminPaymentsRouter from "./routes/admin-payments.js";
import adminDrawsRouter from "./routes/admin-draws.js";
import adminDrawListRouter from "./routes/admin-draw-list.js";
import adminDrawExecutionRouter from "./routes/admin-draw-execution.js";
import adminDrawNumbersRouter from "./routes/admin-draw-numbers.js";
import adminDrawDeleteRouter from "./routes/admin-draw-delete.js";
import adminDrawTestResetRouter from "./routes/admin-draw-test-reset.js";
import winnerPayoutsRouter from "./routes/winner-payouts.js";
import adminAnalyticsRouter from "./routes/admin-analytics.js";
import { processScheduledDraws } from "./services/scheduled-draws.js";

import {
  getPayoutByTelegramUser,
  saveWinnerScreenshot,
  startWinnerClaim,
  submitWinnerTelebirr,
  submitPhysicalWinnerRecipient,
} from "./services/winner-payouts.js";

const app = express();

const PORT =
  Number(process.env.PORT) || 10000;

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
  "";

const DEFAULT_API_URL =
  "https://addis-egata-api.onrender.com";

const WINNER_GROUP_CHAT_ID =
  process.env.WINNER_GROUP_CHAT_ID?.trim() ||
  "";

const SCHEDULED_DRAWS_CRON_TOKEN =
  process.env.SCHEDULED_DRAWS_CRON_TOKEN?.trim() ||
  "";

async function recordTelegramStart(
  telegramUserId: number,
  username?: string,
  firstName?: string,
): Promise<number> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  await pool.query(
    `
      INSERT INTO telegram_bot_daily_starts (
        telegram_user_id,
        local_date,
        username,
        first_name
      )
      VALUES (
        $1,
        (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date,
        $2,
        $3
      )
      ON CONFLICT (telegram_user_id, local_date)
      DO UPDATE SET
        username = COALESCE(
          EXCLUDED.username,
          telegram_bot_daily_starts.username
        ),
        first_name = COALESCE(
          EXCLUDED.first_name,
          telegram_bot_daily_starts.first_name
        )
    `,
    [telegramUserId, username ?? null, firstName ?? null],
  );

  return getTodayTelegramStartCount();
}

async function getTodayTelegramStartCount(): Promise<number> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM telegram_bot_daily_starts
      WHERE local_date =
        (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date
    `,
  );

  return result.rows[0]?.count ?? 0;
}

function isTelegramAnalyticsAdmin(telegramUserId: number): boolean {
  const configuredIds = (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map(Number);

  return configuredIds.includes(telegramUserId);
}

function getTelegramApiUrl(
  method: string,
): string {
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

async function telegramApi(
  method: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram bot is not configured: TELEGRAM_BOT_TOKEN is missing.",
    );
    return false;
  }

  try {
    const response = await fetch(
      getTelegramApiUrl(method),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const data =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

    if (!response.ok || !data.ok) {
      console.error(
        `Telegram API ${method} failed:`,
        data.description ?? response.statusText,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Telegram API ${method} request failed:`,
      error,
    );
    return false;
  }
}

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await telegramApi("sendMessage", body);
}

async function sendTelegramWelcome(
  chatId: number,
): Promise<void> {
  await sendTelegramMessage(
    chatId,
    "🎟️ ADDIS ዕጣ\n\n" +
      "እድልህን ዲጂታል አድርግ።\n\n" +
      "🎯 የሚከፈቱ ዕጣዎችን ይመልከቱ\n" +
      "🎟️ ቁጥርዎን ይምረጡ\n" +
      "💳 በTelebirr ይክፈሉ\n" +
      "🏆 አሸናናፊ ይሁኑ\n\n" +
      "👇 ዕጣውን ለመጀመር ከታች ያለውን ይጫኑ።",
    {
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
  );
}

async function sendTelegramHelp(
  chatId: number,
): Promise<void> {
  await sendTelegramMessage(
    chatId,
    "🎟️ ADDIS ዕጣ\n\n" +
      "ዕጣዎችን ለማየት፣ ቁጥር ለመያዝ እና " +
      "በTelebirr ለመክፈል ከታች ያለውን " +
      "ADDIS ዕጣ ክፈት ይጫኑ።",
    {
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
  );
}

async function sendWinnerClaimStarted(
  chatId: number,
  payout: {
    prizeAmount: number;
    drawName: string;
    number: number;
  },
): Promise<void> {
  await sendTelegramMessage(
    chatId,
    "🎉 እንኳን ደስ አለዎት!\n\n" +
      `🏆 ዕጣ፦ ${payout.drawName}\n` +
      `🎟️ የእርስዎ ቁጥር፦ ${payout.number}\n` +
      `🎁 ሽልማት፦ ${payout.prizeAmount.toLocaleString()} ETB\n\n` +
      "📸 እባክዎ የአሸናናፊነትዎን ማረጋገጫ screenshot እዚህ ይላኩ።\n\n" +
      "⚠️ Screenshot በዚህ private chat ብቻ ይላኩ።",
  );
}

async function sendScreenshotReceived(
  chatId: number,
  prizeType: string,
): Promise<void> {
  if (prizeType === "physical") {
    await sendTelegramMessage(
      chatId,
      "✅ Screenshot ተቀብለናል።\n\n" +
        "🎁 ሽልማትዎ በአካል የሚሰጥ ስለሆነ፣ የሽልማቱን ተቀባይ መረጃ ያስገቡ።\n\n" +
        "በዚህ ቅርጽ ይላኩ፦\n" +
        "ሙሉ ስም | ስልክ ቁጥር\n\n" +
        "ለምሳሌ፦\n" +
        "Pink Getahun | 0912345678\n\n" +
        "⚠️ ስምዎንና ስልክ ቁጥርዎን በዚህ private chat ብቻ ይላኩ።",
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    "✅ Screenshot ተቀብለናል።\n\n" +
      "አሁን የሚከፈልበትን Telebirr መለያ ያስገቡ።\n\n" +
      "በዚህ ቅርጽ ይላኩ፦\n" +
      "09XXXXXXXX | ሙሉ ስም\n\n" +
      "ለምሳሌ፦\n" +
      "0912345678 | Pink Getahun",
  );
}

async function sendPayoutSubmitted(
  chatId: number,
  payout: {
    prizeAmount: number;
    drawName: string;
    telebirrNumber: string | null;
  },
): Promise<void> {
  await sendTelegramMessage(
    chatId,
    "✅ የክፍያ ጥያቄዎ ተልኳል።\n\n" +
      `🏆 ${payout.drawName}\n` +
      `💰 ${payout.prizeAmount.toLocaleString()} ETB\n` +
      `📱 Telebirr፦ ${payout.telebirrNumber ?? ""}\n\n` +
      "👨‍💼 አስተዳደሩ መረጃውን ካረጋገጠ በኋላ ክፍያዎ ይፈጸማል።",
  );
}

async function sendPhysicalRecipientSubmitted(
  chatId: number,
  payout: {
    drawName: string;
    recipientFullName: string | null;
  },
): Promise<void> {
  await sendTelegramMessage(
    chatId,
    "✅ የሽልማት ተቀባይ መረጃዎ ተመዝግቧል።\n\n" +
      `🏆 ዕጣ፦ ${payout.drawName}\n` +
      `👤 ተቀባይ፦ ${payout.recipientFullName ?? ""}\n\n` +
      "👨‍💼 አስተዳደሩ መረጃውን ካረጋገጠ በኋላ ሽልማትዎን ለማስረከብ ያነጋግርዎታል።",
  );
}

async function sendWinnerGroupNotification(
  payout: {
    drawName: string;
    number: number;
    prizeAmount: number;
  },
): Promise<void> {
  if (!WINNER_GROUP_CHAT_ID) {
    return;
  }

  await sendTelegramMessage(
    WINNER_GROUP_CHAT_ID,
    "🏆 ADDIS ዕጣ — አዲስ የአሸናናፊ ጥያቄ\n\n" +
      `🎟️ ዕጣ፦ ${payout.drawName}\n` +
      `🔢 ቁጥር፦ ${payout.number}\n` +
      `🎁 ሽልማት፦ ${payout.prizeAmount.toLocaleString()} ETB\n\n` +
      "🔐 የአሸናናፊው የግል መረጃ በዚህ group አይጋራም።\n" +
      "👨‍💼 እባክዎ Admin Panel ላይ ያረጋግጡ።",
  );
}

function parseWinnerStartPayload(
  text: string,
): string | null {
  const match = text.match(
    /^\/start(?:@\w+)?\s+claim[_:]([A-Za-z0-9-]+)$/i,
  );

  return match?.[1] ?? null;
}

function parseTelebirrMessage(
  text: string,
): {
  number: string;
  accountName: string;
} | null {
  const separatorIndex = text.indexOf("|");

  if (separatorIndex < 0) {
    return null;
  }

  const number = text
    .slice(0, separatorIndex)
    .trim();

  const accountName = text
    .slice(separatorIndex + 1)
    .trim();

  if (!number || !accountName) {
    return null;
  }

  return {
    number,
    accountName,
  };
}

function parsePhysicalRecipientMessage(
  text: string,
): {
  fullName: string;
  phone: string;
} | null {
  const separatorIndex = text.indexOf("|");

  if (separatorIndex < 0) {
    return null;
  }

  const fullName = text
    .slice(0, separatorIndex)
    .trim();

  const phone = text
    .slice(separatorIndex + 1)
    .trim();

  if (!fullName || !phone) {
    return null;
  }

  return {
    fullName,
    phone,
  };
}

async function handleWinnerStartClaim(
  chatId: number,
  winnerId: string,
): Promise<void> {
  try {
    const payout = await startWinnerClaim(
      winnerId,
      chatId,
    );

    await sendWinnerClaimStarted(
      chatId,
      payout,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "";

    if (message === "WINNER_NOT_AUTHORIZED") {
      await sendTelegramMessage(
        chatId,
        "⚠️ ይህ የአሸናናፊ ጥያቄ ከእርስዎ Telegram መለያ ጋር አልተመዘገበም።\n\n" +
          "እባክዎ በራስዎ አሸናናፊ መለያ ይጠቀሙ።",
      );
      return;
    }

    console.error(
      "Winner claim Telegram error:",
      error,
    );

    await sendTelegramMessage(
      chatId,
      "⚠️ የአሸናናፊ ጥያቄዎን አሁን ማስጀመር አልተቻለም።\n\n" +
        "እባክዎ እንደገና ይሞክሩ።",
    );
  }
}

async function handleWinnerPhoto(
  chatId: number,
  photo: Array<{
    file_id?: string;
    file_unique_id?: string;
    width?: number;
    height?: number;
  }>,
): Promise<void> {
  if (!photo.length) {
    return;
  }

  const payout =
    await getPayoutByTelegramUser(chatId);

  if (!payout) {
    return;
  }

  if (payout.status !== "awaiting_screenshot") {
    if (payout.status === "awaiting_telebirr") {
      await sendTelegramMessage(
        chatId,
        "ℹ️ Screenshot ቀድሞ ተቀብሏል።\n\n" +
          "አሁን Telebirr number + account name ይላኩ።\n" +
          "ምሳሌ፦ 0912345678 | Pink Getahun",
      );
    } else if (
      payout.status === "awaiting_recipient"
    ) {
      await sendTelegramMessage(
        chatId,
        "ℹ️ Screenshot ቀድሞ ተቀብሏል።\n\n" +
          "አሁን ሙሉ ስምዎንና ስልክ ቁጥርዎን ይላኩ።\n" +
          "ምሳሌ፦ Pink Getahun | 0912345678",
      );
    }

    return;
  }

  const bestPhoto = [...photo].sort(
    (a, b) =>
      (b.width ?? 0) * (b.height ?? 0) -
      (a.width ?? 0) * (a.height ?? 0),
  )[0];

  if (!bestPhoto?.file_id) {
    await sendTelegramMessage(
      chatId,
      "⚠️ Screenshot ፋይሉን ማንበብ አልተቻለም።\n\n" +
        "እባክዎ screenshot እንደገና ይላኩ።",
    );
    return;
  }

  try {
    const savedPayout =
      await saveWinnerScreenshot(
        payout.id,
        chatId,
        bestPhoto.file_id,
        bestPhoto.file_unique_id,
      );

    await sendScreenshotReceived(
      chatId,
      savedPayout.prizeType,
    );
  } catch (error) {
    console.error(
      "Winner screenshot error:",
      error,
    );

    await sendTelegramMessage(
      chatId,
      "⚠️ Screenshot መቀበል አልተቻለም።\n\n" +
        "እባክዎ እንደገና ይላኩ።",
    );
  }
}

async function handleWinnerTelebirrText(
  chatId: number,
  text: string,
): Promise<boolean> {
  const payout =
    await getPayoutByTelegramUser(chatId);

  if (!payout) {
    return false;
  }

  if (payout.status !== "awaiting_telebirr") {
    return false;
  }

  const parsed = parseTelebirrMessage(text);

  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      "⚠️ የTelebirr መረጃው ትክክል አይደለም።\n\n" +
        "እባክዎ በዚህ ቅርጽ ይላኩ፦\n" +
        "09XXXXXXXX | ሙሉ ስም\n\n" +
        "ምሳሌ፦\n" +
        "0912345678 | Pink Getahun",
    );
    return true;
  }

  try {
    const submitted =
      await submitWinnerTelebirr(
        payout.id,
        chatId,
        parsed.number,
        parsed.accountName,
      );

    await sendPayoutSubmitted(
      chatId,
      submitted,
    );

    await sendWinnerGroupNotification(
      submitted,
    );

    return true;
  } catch (error) {
    console.error(
      "Winner Telebirr submission error:",
      error,
    );

    await sendTelegramMessage(
      chatId,
      "⚠️ የTelebirr መረጃውን ማስገባት አልተቻለም።\n\n" +
        "እባክዎ ቁጥሩን እና ስሙን በድጋሚ ይላኩ።",
    );

    return true;
  }
}

async function handleWinnerPhysicalRecipientText(
  chatId: number,
  text: string,
): Promise<boolean> {
  const payout =
    await getPayoutByTelegramUser(chatId);

  if (!payout) {
    return false;
  }

  if (payout.status !== "awaiting_recipient") {
    return false;
  }

  const parsed =
    parsePhysicalRecipientMessage(text);

  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      "⚠️ የተቀባይ መረጃው ትክክል አይደለም።\n\n" +
        "እባክዎ በዚህ ቅርጽ ይላኩ፦\n" +
        "ሙሉ ስም | ስልክ ቁጥር\n\n" +
        "ምሳሌ፦\n" +
        "Pink Getahun | 0912345678",
    );
    return true;
  }

  try {
    const submitted =
      await submitPhysicalWinnerRecipient(
        payout.id,
        chatId,
        parsed.fullName,
        parsed.phone,
      );

    await sendPhysicalRecipientSubmitted(
      chatId,
      submitted,
    );

    await sendWinnerGroupNotification(
      submitted,
    );

    return true;
  } catch (error) {
    console.error(
      "Physical winner recipient submission error:",
      error,
    );

    await sendTelegramMessage(
      chatId,
      "⚠️ የተቀባይ መረጃውን ማስገባት አልተቻለም።\n\n" +
        "እባክዎ ሙሉ ስምዎንና ስልክ ቁጥርዎን እንደገና ይላኩ።",
    );

    return true;
  }
}

async function configureTelegramBot(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram bot setup skipped because TELEGRAM_BOT_TOKEN is missing.",
    );
    return;
  }

  const webhookBaseUrl =
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    DEFAULT_API_URL;

  const webhookUrl =
    `${webhookBaseUrl.replace(/\/+$/, "")}/telegram/webhook`;

  await telegramApi("setMyCommands", {
    commands: [
      {
        command: "start",
        description: "ADDIS ዕጣን ጀምር",
      },
      {
        command: "help",
        description: "እገዛ",
      },
    ],
  });

  await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "🎟️ ADDIS ዕጣ",
      web_app: {
        url: MINI_APP_URL,
      },
    },
  });

  const webhookBody: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message"],
  };

  if (TELEGRAM_WEBHOOK_SECRET) {
    webhookBody.secret_token =
      TELEGRAM_WEBHOOK_SECRET;
  }

  const webhookConfigured =
    await telegramApi("setWebhook", webhookBody);

  if (webhookConfigured) {
    console.log(
      `Telegram webhook configured: ${webhookUrl}`,
    );
  }
}

/*
 * CORS
 */
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

/*
 * JSON body parser
 */
app.use(
  express.json({
    limit: "5mb",
  }),
);

/*
 * Telegram bot webhook
 *
 * POST /telegram/webhook
 */
app.post(
  "/telegram/webhook",
  async (req, res) => {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const receivedSecret =
        req.header(
          "x-telegram-bot-api-secret-token",
        ) ?? "";

      if (
        receivedSecret !==
        TELEGRAM_WEBHOOK_SECRET
      ) {
        res.status(401).json({
          error: "UNAUTHORIZED",
        });
        return;
      }
    }

    res.status(200).json({
      ok: true,
    });

    const update = req.body as {
      message?: {
        chat?: {
          id?: number;
          type?:
            | "private"
            | "group"
            | "supergroup"
            | "channel";
        };
        from?: {
          id?: number;
          username?: string;
          first_name?: string;
        };
        text?: string;
        photo?: Array<{
          file_id?: string;
          file_unique_id?: string;
          width?: number;
          height?: number;
        }>;
      };
    };

    const message = update.message;

    if (
      !message?.chat ||
      typeof message.chat.id !== "number"
    ) {
      return;
    }

    const chatId = message.chat.id;

    const telegramUserId =
      typeof message.from?.id === "number"
        ? message.from.id
        : chatId;

    const isPrivateChat =
      message.chat.type === "private";

    const text =
      typeof message.text === "string"
        ? message.text.trim()
        : "";

    /*
     * Winner screenshot
     */
    if (
      isPrivateChat &&
      Array.isArray(message.photo) &&
      message.photo.length > 0
    ) {
      await handleWinnerPhoto(
        telegramUserId,
        message.photo,
      );
      return;
    }

    /*
     * Winner deep-link claim
     *
     * /start claim_<winnerId>
     */
    const winnerId =
      parseWinnerStartPayload(text);

    if (isPrivateChat && winnerId) {
      await handleWinnerStartClaim(
        telegramUserId,
        winnerId,
      );
      return;
    }

    /*
     * Admin daily unique-start statistics
     */
    if (
      isPrivateChat &&
      /^\/stats(?:@\w+)?(?:\s|$)/.test(text)
    ) {
      if (!isTelegramAnalyticsAdmin(telegramUserId)) {
        return;
      }

      try {
        const count = await getTodayTelegramStartCount();
        await sendTelegramMessage(
          chatId,
          "📊 ADDIS ዕጣ — የዛሬ ሪፖርት\n\n" +
            `👥 ዛሬ Start ያደረጉ የተለዩ ሰዎች፦ ${count}\n\n` +
            "🕒 የሰዓት ቀጣና፦ Ethiopia (UTC+3)",
        );
      } catch (error) {
        console.error("Telegram analytics command failed:", error);
        await sendTelegramMessage(
          chatId,
          "⚠️ የዛሬን ሪፖርት ማውጣት አልተቻለም።",
        );
      }
      return;
    }

    /*
     * Normal /start
     */
    if (
      text === "/start" ||
      text.startsWith("/start ")
    ) {
      if (isPrivateChat) {
        try {
          const count = await recordTelegramStart(
            telegramUserId,
            message.from?.username,
            message.from?.first_name,
          );
          console.log(`[Telegram Analytics] Today unique starts: ${count}`);
        } catch (error) {
          console.error("Telegram start analytics failed:", error);
        }
      }

      await sendTelegramWelcome(chatId);
      return;
    }

    /*
     * Help
     */
    if (
      text === "/help" ||
      text.startsWith("/help ")
    ) {
      await sendTelegramHelp(chatId);
      return;
    }

    /*
     * Winner private-chat text submissions
     */
    if (isPrivateChat && text) {
      const physicalHandled =
        await handleWinnerPhysicalRecipientText(
          telegramUserId,
          text,
        );

      if (physicalHandled) {
        return;
      }

      const telebirrHandled =
        await handleWinnerTelebirrText(
          telegramUserId,
          text,
        );

      if (telebirrHandled) {
        return;
      }

      await sendTelegramWelcome(chatId);
    }
  },
);

/*
 * Health check
 *
 * GET /health
 */
app.get(
  "/health",
  async (_req, res) => {
    const databaseOk = await checkDatabase();

    res
      .status(databaseOk ? 200 : 503)
      .json({
        ok: databaseOk,
        service: "addis-egata-api",
        database: databaseOk
          ? "connected"
          : "unavailable",
        timestamp: new Date().toISOString(),
      });
  },
);

/*
 * API root
 */
app.get(
  "/",
  (_req, res) => {
    res.status(200).json({
      name: "Addis ዕጣ",
      message: "API is running",
    });
  },
);

/*
 * Telegram authentication
 */
app.use("/auth", authRouter);
app.use("/app-auth", appAuthRouter);
app.use("/referrals", referralsRouter);
app.use("/full-app/winners", fullAppWinnersRouter);

/*
 * Public draws
 */
app.use("/draws", drawsRouter);

/*
 * Public published results
 */
app.use("/", resultsRouter);

/*
 * Entries and number reservations
 */
app.use("/entries", entriesRouter);

/*
 * Manual Telebirr payments
 */
app.use("/payments", paymentsRouter);

/*
 * Admin payment verification
 */
app.use("/admin/payments", adminPaymentsRouter);

/*
 * Admin analytics dashboard API
 */
app.use("/admin/analytics", adminAnalyticsRouter);

/*
 * Winner payout and claim flow
 */
app.use("/winner-payouts", winnerPayoutsRouter);

/*
 * Admin draw management
 */
app.use("/admin/draws", adminDrawsRouter);

/*
 * Admin draw list
 */
app.use("/admin/draw-list", adminDrawListRouter);

/*
 * Admin draw number list
 */
app.use("/admin/draw-numbers", adminDrawNumbersRouter);

/*
 * Admin draw execution
 */
app.use("/admin/draw-execution", adminDrawExecutionRouter);

/*
 * Admin draw deletion
 */
app.use("/admin/draw-delete", adminDrawDeleteRouter);

/*
 * Admin test draw reset
 */
app.use("/admin/draw-test-reset", adminDrawTestResetRouter);

/*
 * Internal scheduled-draw worker
 */
app.post(
  "/internal/scheduled-draws",
  async (req, res) => {
    if (!SCHEDULED_DRAWS_CRON_TOKEN) {
      res.status(503).json({
        error:
          "SCHEDULED_DRAWS_CRON_TOKEN_NOT_CONFIGURED",
      });
      return;
    }

    const authorization =
      req.header("authorization") ?? "";

    const expected =
      `Bearer ${SCHEDULED_DRAWS_CRON_TOKEN}`;

    if (authorization !== expected) {
      res.status(401).json({
        error: "UNAUTHORIZED",
      });
      return;
    }

    try {
      const result = await processScheduledDraws();

      res.status(200).json({
        ok: true,
        ...result,
        processedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        "Scheduled draw worker failed:",
        error,
      );

      res.status(500).json({
        ok: false,
        error:
          "SCHEDULED_DRAWS_PROCESSING_FAILED",
      });
    }
  },
);

/*
 * In-process scheduled draw worker
 */
const SCHEDULED_DRAWS_INTERVAL_MS = 60_000;

let scheduledDrawsRunning = false;

async function runScheduledDrawsLoop(): Promise<void> {
  if (scheduledDrawsRunning) {
    return;
  }

  scheduledDrawsRunning = true;

  try {
    const result = await processScheduledDraws();

    console.log(
      "Scheduled draws worker tick:",
      result,
    );
  } catch (error) {
    console.error(
      "Scheduled draws worker tick failed:",
      error,
    );
  } finally {
    scheduledDrawsRunning = false;
  }
}

function startScheduledDrawsLoop(): void {
  void runScheduledDrawsLoop();

  setInterval(
    () => {
      void runScheduledDrawsLoop();
    },
    SCHEDULED_DRAWS_INTERVAL_MS,
  );
}

/*
 * 404
 */
app.use(
  (_req, res) => {
    res.status(404).json({
      error: "NOT_FOUND",
      message:
        "The requested endpoint does not exist.",
    });
  },
);

/*
 * Global error handler
 */
app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(
      "Unhandled server error:",
      err,
    );

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message:
        "An unexpected server error occurred.",
    });
  },
);

/*
 * Start API
 */
app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Addis ዕጣ API running on port ${PORT}`,
    );

    startScheduledDrawsLoop();

    void configureTelegramBot();
  },
);
