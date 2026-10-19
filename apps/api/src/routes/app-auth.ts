
import { Router } from "express";

import {
  getAppUserByToken,
  loginAppUser,
  logoutAppUser,
  registerAppUser,
} from "../services/app-auth.js";

const router = Router();

function getBearerToken(
  authorization: string | undefined,
): string {
  if (!authorization) {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() ?? "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "UNKNOWN_ERROR";
}

function sendAuthError(
  res: import("express").Response,
  error: unknown,
): void {
  const message = getErrorMessage(error);

  if (message === "INVALID_CREDENTIALS") {
    res.status(401).json({
      error: message,
      message: "Username/phone number or password is incorrect.",
    });
    return;
  }

  if (message === "LOGIN_IDENTIFIER_ALREADY_USED") {
    res.status(409).json({
      error: message,
      message: "This username or phone number is already registered.",
    });
    return;
  }

  if (message === "INVALID_LOGIN_IDENTIFIER") {
    res.status(400).json({
      error: message,
      message: "Enter a valid username or phone number.",
    });
    return;
  }

  if (message === "INVALID_PASSWORD_LENGTH") {
    res.status(400).json({
      error: message,
      message: "Password must be between 8 and 128 characters.",
    });
    return;
  }

  if (message === "NAME_TOO_LONG") {
    res.status(400).json({
      error: message,
      message: "First name or last name is too long.",
    });
    return;
  }

  console.error("App authentication error:", error);

  res.status(500).json({
    error: "AUTHENTICATION_ERROR",
    message: "Authentication could not be completed.",
  });
}

router.post("/register", async (req, res): Promise<void> => {
  try {
    const {
      loginIdentifier,
      password,
      firstName,
      lastName,
    } = req.body ?? {};

    if (
      typeof loginIdentifier !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Username/phone number and password are required.",
      });
      return;
    }

    if (
      firstName !== undefined &&
      typeof firstName !== "string"
    ) {
      res.status(400).json({
        error: "INVALID_FIRST_NAME",
        message: "First name must be text.",
      });
      return;
    }

    if (
      lastName !== undefined &&
      typeof lastName !== "string"
    ) {
      res.status(400).json({
        error: "INVALID_LAST_NAME",
        message: "Last name must be text.",
      });
      return;
    }

    const user = await registerAppUser({
      loginIdentifier,
      password,
      firstName,
      lastName,
    });

    res.status(201).json({
      user,
      message: "Account created successfully. Please log in.",
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/login", async (req, res): Promise<void> => {
  try {
    const { loginIdentifier, password } = req.body ?? {};

    if (
      typeof loginIdentifier !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Username/phone number and password are required.",
      });
      return;
    }

    const result = await loginAppUser({
      loginIdentifier,
      password,
    });

    res.status(200).json({
      user: result.user,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.get("/me", async (req, res): Promise<void> => {
  try {
    const token = getBearerToken(req.header("authorization"));

    if (!token) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Please log in to continue.",
      });
      return;
    }

    const user = await getAppUserByToken(token);

    if (!user) {
      res.status(401).json({
        error: "INVALID_OR_EXPIRED_SESSION",
        message: "Your session has expired. Please log in again.",
      });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("App session lookup failed:", error);

    res.status(500).json({
      error: "AUTHENTICATION_ERROR",
      message: "Could not verify your session.",
    });
  }
});

router.post("/logout", async (req, res): Promise<void> => {
  try {
    const token = getBearerToken(req.header("authorization"));

    if (!token) {
      res.status(200).json({
        message: "Logged out successfully.",
      });
      return;
    }

    await logoutAppUser(token);

    res.status(200).json({
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("App logout failed:", error);

    res.status(500).json({
      error: "LOGOUT_ERROR",
      message: "Could not complete logout.",
    });
  }
});

export default router;
