import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  resetTestDraw,
} from "../services/admin-draw-test-reset.js";

const router = Router();

router.use(
  requireTelegramAuth,
  requireAdmin,
);

router.post(
  "/:drawId",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error:
            "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const drawId =
        req.params.drawId?.trim();

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });
        return;
      }

      await resetTestDraw(
        req.user.id,
        drawId,
      );

      res.status(200).json({
        ok: true,
        drawId,
        status: "full",
        message:
          "Test draw reset successfully.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "TEST_DRAW_RESET_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_NOT_FOUND",
          "TEST_DRAW_ONLY",
          "TEST_DRAW_NOT_COMPLETED",
          "TEST_DRAW_RESULT_NOT_FOUND",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The test draw could not be reset.",
        });
        return;
      }

      console.error(
        "Reset test draw error:",
        error,
      );

      res.status(500).json({
        error:
          "TEST_DRAW_RESET_FAILED",
        message:
          "The test draw could not be reset.",
      });
    }
  },
);

export default router;
