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

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

const MINI_APP_URL =
  process.env.MINI_APP_URL?.trim() ||
  "https://addis-egata-web.onrender.com";

const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

const DEFAULT_API_URL =
  "https://addis-egata-api.onrender.com";

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

    const data = (await response.json()) as {
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

async function sendTelegramWelcome(
  chatId: number,
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text:
      "🎟️ ADDIS ዕጣ\n\n" +
      "እድልህን ዲጂታል አድርግ።\n\n" +
      "🎯 የሚከፈቱ ዕጣዎችን ይመልከቱ\n" +
      "🎟️ ቁጥርዎን ይምረጡ\n" +
      "💳 በTelebirr ይክፈሉ\n" +
      "🏆 አሸናናፊ ይሁኑ\n\n" +
      "👇 ዕጣውን ለመጀመር ከታች ያለውን ይጫኑ።",
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
  });
}

async function sendTelegramHelp(
  chatId: number,
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text:
      "🎟️ ADDIS ዕጣ\n\n" +
      "ዕጣዎችን ለማየት፣ ቁጥር ለመያዝ እና " +
      "በTelebirr ለመክፈል ከታች ያለውን " +
      "ADDIS ዕጣ ክፈት ይጫኑ።",
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
  });
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

  const webhookConfigured = await telegramApi(
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

    const update = req.body as {
      message?: {
        chat?: {
          id?: number;
        };
        text?: string;
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
    const text =
      typeof message.text === "string"
        ? message.text.trim()
        : "";

    if (
      text === "/start" ||
      text.startsWith("/start ")
    ) {
      await sendTelegramWelcome(chatId);
      return;
    }

    if (
      text === "/help" ||
      text.startsWith("/help ")
    ) {
      await sendTelegramHelp(chatId);
      return;
    }

    if (text) {
      await sendTelegramWelcome(chatId);
    }
  },
);

/*
 * Health check
 *
 * GET /health
 */
app.get("/health", async (_req, res) => {
  const databaseOk = await checkDatabase();

  res.status(databaseOk ? 200 : 503).json({
    ok: databaseOk,
    service: "addis-egata-api",
    database: databaseOk
      ? "connected"
      : "unavailable",
    timestamp: new Date().toISOString(),
  });
});

/*
 * API root
 */
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Addis ዕጣ",
    message: "API is running",
  });
});

/*
 * Telegram authentication
 *
 * GET /auth/me
 */
app.use("/auth", authRouter);

/*
 * Public draws
 *
 * GET /draws
 * GET /draws/:drawId
 */
app.use("/draws", drawsRouter);

/*
 * Public published results
 *
 * GET /results
 * GET /results/:drawId
 */
app.use("/results", resultsRouter);

/*
 * Entries and number reservations
 *
 * GET /entries/mine
 * POST /entries/reserve
 * GET /entries/:entryId
 */
app.use("/entries", entriesRouter);

/*
 * Manual Telebirr payments
 *
 * GET /payments/mine
 * POST /payments/telebirr
 * GET /payments/:paymentId
 */
app.use("/payments", paymentsRouter);

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
app.use((_req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message:
      "The requested endpoint does not exist.",
  });
});

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

    void configureTelegramBot();
  },
);
