import { Router } from "express";
import { requireTelegramAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/me",
  requireTelegramAuth,
  (req, res) => {
    if (!req.user || !req.telegramUser) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
      });
      return;
    }

    res.status(200).json({
      user: {
        id: req.user.id,
        telegramId: req.user.telegramId,
        username: req.user.username,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        isAdmin: req.user.isAdmin,
      },
      telegram: {
        authDate: undefined,
        queryId: undefined,
      },
    });
  },
);

export default router;
