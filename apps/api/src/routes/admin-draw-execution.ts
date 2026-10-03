import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  executeDraw,
} from "../services/draw-engine.js";

import {
  scheduleDraw,
} from "../services/scheduled-draws.js";

const router = Router();

router.use(
  requireTelegramAuth,
  requireAdmin,
);

/*
 * POST /admin/draw-execution/:drawId/schedule
 *
 * A draw must already be full.
 * Scheduling does not execute the draw.
 * It only sets draw_at.
 */
router.post(
  "/:drawId/schedule",
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

      const drawAt =
        typeof req.body?.drawAt ===
        "string"
          ? req.body.drawAt.trim()
          : "";

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });
        return;
      }

      if (!drawAt) {
        res.status(400).json({
          error:
            "DRAW_TIME_REQUIRED",
          message:
            "Draw time is required.",
        });
        return;
      }

      const scheduledAt =
        await scheduleDraw(
          req.user.id,
          drawId,
          drawAt,
        );

      res.status(200).json({
        drawId,
        drawAt: scheduledAt,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_SCHEDULE_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_TIME_INVALID",
          "DRAW_TIME_MUST_BE_IN_FUTURE",
          "DRAW_NOT_FOUND",
          "DRAW_MUST_BE_FULL_TO_SCHEDULE",
          "DRAW_ALREADY_EXECUTED",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The draw could not be scheduled.",
        });
        return;
      }

      console.error(
        "Schedule admin draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_SCHEDULE_FAILED",
        message:
          "The draw could not be scheduled.",
      });
    }
  },
);

/*
 * POST /admin/draw-execution/:drawId/execute
 *
 * Existing Secure Random Draw.
 *
 * IMPORTANT:
 * This endpoint and the underlying draw engine
 * remain unchanged in behavior.
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

      if (
        clientErrors.has(message)
      ) {
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
