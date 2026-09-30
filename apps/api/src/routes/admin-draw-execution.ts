import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  executeDraw,
} from "../services/draw-engine.js";

const router = Router();

/*
 * All admin draw execution routes require:
 * 1. Valid Telegram authentication
 * 2. Administrator privileges
 */
router.use(
  requireTelegramAuth,
  requireAdmin,
);

/*
 * Execute a draw and select winners.
 *
 * POST /admin/draw-execution/:drawId/execute
 *
 * Only draws in "full" or "closed" status can
 * be executed by the draw engine.
 *
 * Winner selection is performed server-side using
 * cryptographically secure randomness.
 */
router.post(
  "/:drawId/execute",
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

      const result =
        await executeDraw(
          req.user.id,
          drawId,
        );

      res.status(200).json({
        result,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_EXECUTION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_NOT_FOUND",
          "DRAW_NOT_READY_FOR_DRAWING",
          "DRAW_ALREADY_EXECUTED",
          "PRIZE_COUNT_MUST_MATCH_WINNERS",
          "PRIZE_RANKS_MUST_BE_SEQUENTIAL",
          "INVALID_PRIZE_AMOUNT",
          "NO_ELIGIBLE_ENTRIES",
          "INVALID_WINNER_COUNT",
          "NOT_ENOUGH_ELIGIBLE_ENTRIES",
          "NOT_ENOUGH_UNIQUE_WINNERS",
          "WINNER_SELECTION_FAILED",
          "DRAW_HASH_FAILED",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The draw could not be executed.",
        });
        return;
      }

      console.error(
        "Execute admin draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_EXECUTION_FAILED",
        message:
          "The draw could not be executed.",
      });
    }
  },
);

export default router;
