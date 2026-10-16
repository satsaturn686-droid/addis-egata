import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  resetTestDraw,
} from "../services/admin-draw-test-reset.js";

const router = Router();

router.use(requireTelegramAuth, requireAdmin);

router.post("/:drawId", async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
      });
      return;
    }

    const drawId = req.params.drawId?.trim();

    if (!drawId) {
      res.status(400).json({
        error: "INVALID_DRAW_ID",
        message: "Draw ID is required.",
      });
      return;
    }

    await resetTestDraw(req.user.id, drawId);

    res.status(200).json({
      ok: true,
      drawId,
      status: "full",
      message: "Test draw reset successfully.",
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "TEST_DRAW_RESET_FAILED";

    const messages: Record<string, string> = {
      INVALID_ADMIN_USER_ID: "Admin authentication is invalid.",
      INVALID_DRAW_ID: "Draw ID is invalid.",
      DRAW_NOT_FOUND: "Draw was not found.",
      TEST_DRAW_ONLY: "Only the dedicated test draw can be reset.",
      TEST_DRAW_NOT_COMPLETED: "The draw must be completed before reset.",
      TEST_DRAW_RESULT_NOT_FOUND: "Draw results were not found.",
      TEST_DRAW_WALLET_CREDIT_INVALID:
        "Wallet payout records need investigation; reset was cancelled.",
      TEST_DRAW_WALLET_NOT_FOUND:
        "The winner wallet was not found; reset was cancelled.",
      TEST_DRAW_PAYOUT_ALREADY_SPENT:
        "The credited prize has already been spent or the wallet balance is insufficient. Reset was cancelled to protect the wallet balance.",
    };

    if (messages[code]) {
      res.status(400).json({
        error: code,
        message: messages[code],
      });
      return;
    }

    console.error("Reset test draw error:", error);

    res.status(500).json({
      error: "TEST_DRAW_RESET_FAILED",
      message: "The test draw could not be reset.",
    });
  }
});

export default router;
