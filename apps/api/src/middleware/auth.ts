
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
  getUserById,
  isAdminUser,
  upsertTelegramUser,
  type User,
} from "../services/users.js";

import {
  getAppUserByToken,
} from "../services/app-auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      telegramUser?: TelegramUser;
      telegramAuthDate?: number;
      telegramQueryId?: string;
      appSessionAuth?: boolean;
    }
  }
}

function getInitData(req: Request): string {
  const headerValue = req.header("x-telegram-init-data");

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

function getBearerToken(
  req: Request,
): string {
  const authorization = req.header("authorization");

  if (!authorization) {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() ?? "";
}

function sendAuthRequired(res: Response): void {
  res.status(401).json({
    error: "AUTHENTICATION_REQUIRED",
    message: "Please open the app or log in to continue.",
  });
}

/**
 * Accepts either validated Telegram Mini App initData
 * or a valid standalone Android app session.
 *
 * Telegram initData remains validated using the existing
 * Telegram verification service.
 */
export async function requireTelegramAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const initData = getInitData(req);

    // Preserve the existing Telegram authentication flow.
    if (initData) {
      const auth = validateTelegramInitData(initData);
      const user = await upsertTelegramUser(auth.user);

      req.user = user;
      req.telegramUser = auth.user;
      req.telegramAuthDate = auth.authDate;
      req.telegramQueryId = auth.queryId;
      req.appSessionAuth = false;

      next();
      return;
    }

    // Allow the standalone app to authenticate with its session.
    const token = getBearerToken(req);

    if (!token) {
      sendAuthRequired(res);
      return;
    }

    const appUser = await getAppUserByToken(token);

    if (!appUser) {
      res.status(401).json({
        error: "INVALID_OR_EXPIRED_SESSION",
        message: "Your session has expired. Please log in again.",
      });
      return;
    }

    const user = await getUserById(appUser.id);

    if (!user) {
      res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "This account could not be found.",
      });
      return;
    }

    req.user = user;
    req.appSessionAuth = true;

    next();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AUTHENTICATION_FAILED";

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

    console.error("Authentication error:", error);

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
      sendAuthRequired(res);
      return;
    }

    const admin = await isAdminUser(req.user.id);

    if (!admin) {
      res.status(403).json({
        error: "ADMIN_ACCESS_REQUIRED",
        message: "Administrator access is required.",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Admin authorization error:", error);

    res.status(500).json({
      error: "AUTHORIZATION_ERROR",
      message: "Authorization could not be completed.",
    });
  }
}
