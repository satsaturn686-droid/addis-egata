import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  validateTelegramInitData,
  type TelegramUser,
} from "../services/telegram.js";

import {
  isAdminUser,
  upsertTelegramUser,
  type User,
} from "../services/users.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      telegramUser?: TelegramUser;
    }
  }
}

function getInitData(req: Request): string {
  const headerValue = req.header(
    "x-telegram-init-data",
  );

  if (headerValue?.trim()) {
    return headerValue.trim();
  }

  const authorization = req.header("authorization");

  if (authorization?.startsWith("tma ")) {
    return authorization.slice(4).trim();
  }

  if (
    typeof req.body === "object" &&
    req.body !== null &&
    typeof req.body.initData === "string"
  ) {
    return req.body.initData.trim();
  }

  return "";
}

export async function requireTelegramAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const initData = getInitData(req);

    if (!initData) {
      res.status(401).json({
        error: "TELEGRAM_AUTH_REQUIRED",
        message: "Telegram authentication is required.",
      });
      return;
    }

    const auth = validateTelegramInitData(
      initData,
    );

    const user = await upsertTelegramUser(
      auth.user,
    );

    req.user = user;
    req.telegramUser = auth.user;

    next();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "TELEGRAM_AUTH_FAILED";

    const authErrors = new Set([
      "TELEGRAM_AUTH_REQUIRED",
      "TELEGRAM_INIT_DATA_REQUIRED",
      "TELEGRAM_INIT_DATA_TOO_LONG",
      "TELEGRAM_HASH_MISSING",
      "TELEGRAM_AUTH_DATE_MISSING",
      "TELEGRAM_AUTH_DATE_INVALID",
      "TELEGRAM_AUTH_DATE_IN_FUTURE",
      "TELEGRAM_INIT_DATA_EXPIRED",
      "TELEGRAM_INIT_DATA_INVALID",
      "TELEGRAM_USER_MISSING",
      "TELEGRAM_USER_INVALID",
      "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED",
    ]);

    if (authErrors.has(message)) {
      res.status(401).json({
        error: message,
        message: "Telegram authentication failed.",
      });
      return;
    }

    console.error(
      "Telegram authentication error:",
      error,
    );

    res.status(500).json({
      error: "AUTHENTICATION_ERROR",
      message: "Authentication could not be completed.",
    });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
      });
      return;
    }

    const admin = await isAdminUser(
      req.user.id,
    );

    if (!admin) {
      res.status(403).json({
        error: "ADMIN_ACCESS_REQUIRED",
        message: "Administrator access is required.",
      });
      return;
    }

    next();
  } catch (error) {
    console.error(
      "Admin authorization error:",
      error,
    );

    res.status(500).json({
      error: "AUTHORIZATION_ERROR",
      message: "Authorization could not be completed.",
    });
  }
}
