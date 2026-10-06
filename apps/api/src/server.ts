import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";

import { checkDatabase } from "./db.js";
import authRouter from "./routes/auth.js";
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

import {
  getPayoutByTelegramUser,
  saveWinnerScreenshot,
  startWinnerClaim,
  submitWinnerTelebirr,
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

    if (
      !response.ok ||
      !data.ok
    ) {
      console.error(
        `Telegram API ${method} failed:`,
        data.description ??
          response.statusText,
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
  replyMarkup?: Record<
    string,
    unknown
  >,
): Promise<void> {
  const body: Record<
    string,
    unknown
  > = {
    chat_id: chatId,
    text,
  };

  if (replyMarkup) {
    body.reply_markup =
      replyMarkup;
  }

  await telegramApi(
    "sendMessage",
    body,
  );
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
      `💰 የሚያገኙት፦ ${payout.prizeAmount.toLocaleString()} ETB\n\n` +
      "📸 እባክዎ የአሸናናፊነትዎን ማረጋገጫ screenshot እዚህ ይላኩ።\n\n" +
      "⚠️ Screenshot በዚህ private chat ብቻ ይላኩ።",
  );
}

async function sendScreenshotReceived(
  chatId: number,
): Promise<void> {
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
    "🏆 ADDIS ዕጣ — አዲስ የአሸናናፊ ክፍያ ጥያቄ\n\n" +
      `🎟️ ዕጣ፦ ${payout.drawName}\n` +
      `🔢 ቁጥር፦ ${payout.number}\n` +
      `💰 ሽልማት፦ ${payout.prizeAmount.toLocaleString()} ETB\n\n` +
      "🔐 የWinner የግል Telebirr መረጃ በዚህ group አይጋራም።\n" +
      "👨‍💼 እባክዎ Admin Panel ላይ ያረጋግጡ።",
  );
}

function parseWinnerStartPayload(
  text: string,
): string | null {
  const match =
    text.match(
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
  const separatorIndex =
    text.indexOf("|");

  if (separatorIndex < 0) {
    return null;
  }

  const number =
    text
      .slice(0, separatorIndex)
      .trim();

  const accountName =
    text
      .slice(separatorIndex + 1)
      .trim();

  if (
    !number ||
    !accountName
  ) {
    return null;
  }

  return {
    number,
    accountName,
  };
}

async function handleWinnerStartClaim(
  chatId: number,
  winnerId: string,
): Promise<void> {
  try {
    const payout =
      await startWinnerClaim(
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

    if (
      message ===
      "WINNER_NOT_AUTHORIZED"
    ) {
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
    await getPayoutByTelegramUser(
      chatId,
    );

  if (!payout) {
    return;
  }

  if (
    payout.status !==
    "awaiting_screenshot"
  ) {
    if (
      payout.status ===
      "awaiting_telebirr"
    ) {
      await sendTelegramMessage(
        chatId,
        "ℹ️ Screenshot ቀድሞ ተቀብሏል።\n\n" +
          "አሁን Telebirr number + account name ይላኩ።\n" +
          "ምሳሌ፦ 0912345678 | Pink Getahun",
      );
    }

    return;
  }

  const bestPhoto =
    [...photo].sort(
      (a, b) =>
        (b.width ?? 0) *
          (b.height ?? 0) -
        (a.width ?? 0) *
          (a.height ?? 0),
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
    await saveWinnerScreenshot(
      payout.id,
      chatId,
      bestPhoto.file_id,
      bestPhoto.file_unique_id,
    );

    await sendScreenshotReceived(
      chatId,
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
    await getPayoutByTelegramUser(
      chatId,
    );

  if (!payout) {
    return false;
  }

  if (
    payout.status !==
    "awaiting_telebirr"
  ) {
    return false;
  }

  const parsed =
    parseTelebirrMessage(text);

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

  await telegramApi(
    "setMyCommands",
    {
      commands: [
        {
          command: "start",
          description:
            "ADDIS ዕጣን ጀምር",
        },
        {
          command: "help",
          description: "እገዛ",
        },
      ],
    },
  );

  await telegramApi(
    "setChatMenuButton",
    {
      menu_button: {
        type: "web_app",
        text: "🎟️ ADDIS ዕጣ",
        web_app: {
          url: MINI_APP_URL,
        },
      },
    },
  );

  const webhookBody: Record<
    string,
    unknown
  > = {
    url: webhookUrl,
    allowed_updates: [
      "message",
    ],
  };

  if (TELEGRAM_WEBHOOK_SECRET) {
    webhookBody.secret_token =
      TELEGRAM_WEBHOOK_SECRET;
  }

  const webhookConfigured =
    await telegramApi(
      "setWebhook",
      webhookBody,
    );

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

    const update =
      req.body as {
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

    const message =
      update.message;

    if (
      !message?.chat ||
      typeof message.chat.id !==
        "number"
    ) {
      return;
    }

    const chatId =
      message.chat.id;

    const telegramUserId =
      typeof message.from?.id ===
      "number"
        ? message.from.id
        : chatId;

    const isPrivateChat =
      message.chat.type ===
      "private";

    const text =
      typeof message.text ===
      "string"
        ? message.text.trim()
        : "";

    /*
     * Winner screenshot
     *
     * Winner payout screenshots are
     * accepted only from a private
     * Telegram chat.
     */
    if (
      isPrivateChat &&
      Array.isArray(
        message.photo,
      ) &&
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
     *
     * Claims are accepted only from
     * a private Telegram chat.
     */
    const winnerId =
      parseWinnerStartPayload(
        text,
      );

    if (
      isPrivateChat &&
      winnerId
    ) {
      await handleWinnerStartClaim(
        telegramUserId,
        winnerId,
      );

      return;
    }

    /*
     * Normal /start
     */
    if (
      text === "/start" ||
      text.startsWith("/start ")
    ) {
      await sendTelegramWelcome(
        chatId,
      );
      return;
    }

    /*
     * Help
     */
    if (
      text === "/help" ||
      text.startsWith("/help ")
    ) {
      await sendTelegramHelp(
        chatId,
      );
      return;
    }

    /*
     * Winner Telebirr submission
     *
     * Sensitive payout information
     * is accepted only from a private
     * Telegram chat.
     */
    if (
      isPrivateChat &&
      text
    ) {
      const handled =
        await handleWinnerTelebirrText(
          telegramUserId,
          text,
        );

      if (handled) {
        return;
      }

      await sendTelegramWelcome(
        chatId,
      );
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
    const databaseOk =
      await checkDatabase();

    res
      .status(
        databaseOk
          ? 200
          : 503,
      )
      .json({
        ok: databaseOk,
        service:
          "addis-egata-api",
        database: databaseOk
          ? "connected"
          : "unavailable",
        timestamp:
          new Date().toISOString(),
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
      message:
        "API is running",
    });
  },
);

/*
 * Telegram authentication
 *
 * GET /auth/me
 */
app.use(
  "/auth",
  authRouter,
);

/*
 * Public draws
 *
 * GET /draws
 * GET /draws/:drawId
 */
app.use(
  "/draws",
  drawsRouter,
);

/*
 * Public published results
 *
 * GET /results
 * GET /results/:drawId
 */
app.use(
  "/results",
  resultsRouter,
);

/*
 * Entries and number reservations
 *
 * GET /entries/mine
 * POST /entries/reserve
 * GET /entries/:entryId
 */
app.use(
  "/entries",
  entriesRouter,
);

/*
 * Manual Telebirr payments
 *
 * GET /payments/mine
 * POST /payments/telebirr
 * GET /payments/:paymentId
 */
app.use(
  "/payments",
  paymentsRouter,
);

/*
 * Admin payment verification
 *
 * GET /admin/payments/pending
 * POST /admin/payments/:paymentId/approve
 * POST /admin/payments/:paymentId/reject
 */
app.use(
  "/admin/payments",
  adminPaymentsRouter,
);

/*
 * Winner payout and claim flow
 *
 * GET  /winner-payouts/mine
 * GET  /winner-payouts/:payoutId
 * GET  /winner-payouts/claim-link/:winnerId
 * POST /winner-payouts/claim/:winnerId
 * POST /winner-payouts/:payoutId/screenshot
 * POST /winner-payouts/:payoutId/telebirr
 *
 * Admin:
 * GET  /winner-payouts/admin/pending
 * POST /winner-payouts/admin/:payoutId/approve
 * POST /winner-payouts/admin/:payoutId/reject
 * POST /winner-payouts/admin/:payoutId/paid
 */
app.use(
  "/winner-payouts",
  winnerPayoutsRouter,
);

/*
 * Admin draw management
 *
 * POST /admin/draws
 * POST /admin/draws/:drawId/open
 * POST /admin/draws/:drawId/close
 */
app.use(
  "/admin/draws",
  adminDrawsRouter,
);

/*
 * Admin draw list
 *
 * GET /admin/draw-list
 */
app.use(
  "/admin/draw-list",
  adminDrawListRouter,
);

/*
 * Admin draw number list
 *
 * GET /admin/draw-numbers/:drawId/numbers
 */
app.use(
  "/admin/draw-numbers",
  adminDrawNumbersRouter,
);

/*
 * Admin draw execution
 *
 * POST /admin/draw-execution/:drawId/execute
 */
app.use(
  "/admin/draw-execution",
  adminDrawExecutionRouter,
);

/*
 * Admin draw deletion
 *
 * DELETE /admin/draw-delete/:drawId
 */
app.use(
  "/admin/draw-delete",
  adminDrawDeleteRouter,
);

/*
 * Admin test draw reset
 *
 * POST /admin/draw-test-reset/:drawId
 */
app.use(
  "/admin/draw-test-reset",
  adminDrawTestResetRouter,
);

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
      error:
        "INTERNAL_SERVER_ERROR",
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

    void configureTelegramBot();
  },
);
