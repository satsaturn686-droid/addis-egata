import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import { createDraw } from "../services/admin-draws.js";

import {
  closeDraw,
  openDraw,
} from "../services/draw-lifecycle.js";

import {
  notifyUsersAboutOpenedDraw,
} from "../services/telegram-notifications.js";

const router = Router();

/*
 * All admin draw routes require:
 * 1. Valid Telegram authentication
 * 2. Administrator privileges
 */
router.use(
  requireTelegramAuth,
  requireAdmin,
);

function getString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim();
}

function getNullableString(
  value: unknown,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized || null;
}

function getNumber(
  value: unknown,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : undefined;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : undefined;
  }

  return undefined;
}

function getBoolean(
  value: unknown,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return undefined;
}

function getPrizes(
  value: unknown,
): Array<{
  rank: number;
  amount: number;
}> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((prize) => {
    if (
      typeof prize !== "object" ||
      prize === null
    ) {
      return {
        rank: Number.NaN,
        amount: Number.NaN,
      };
    }

    const item =
      prize as Record<string, unknown>;

    return {
      rank:
        getNumber(item.rank) ??
        Number.NaN,
      amount:
        getNumber(item.amount) ??
        Number.NaN,
    };
  });
}

/*
 * Create a new draw.
 *
 * POST /admin/draws
 *
 * Important:
 * There is NO draw closing deadline.
 * A draw remains open until all numbers are filled
 * or an administrator closes it manually.
 */
router.post(
  "/",
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

      const body =
        typeof req.body === "object" &&
        req.body !== null
          ? req.body as Record<
              string,
              unknown
            >
          : {};

      const name =
        getString(body.name);

      const prizeType =
        getString(body.prizeType);

      const prizeName =
        getString(body.prizeName);

      const totalNumbers =
        getNumber(
          body.totalNumbers,
        );

      const entryFee =
        getNumber(body.entryFee);

      const winnerCount =
        getNumber(
          body.winnerCount,
        );

      const prizes =
        getPrizes(body.prizes);

      if (!name) {
        res.status(400).json({
          error:
            "DRAW_NAME_REQUIRED",
          message:
            "Draw name is required.",
        });
        return;
      }

      if (
        prizeType !== "cash" &&
        prizeType !== "physical"
      ) {
        res.status(400).json({
          error:
            "INVALID_PRIZE_TYPE",
          message:
            "Prize type must be cash or physical.",
        });
        return;
      }

      if (!prizeName) {
        res.status(400).json({
          error:
            "PRIZE_NAME_REQUIRED",
          message:
            "Prize name is required.",
        });
        return;
      }

      if (
        totalNumbers === undefined
      ) {
        res.status(400).json({
          error:
            "INVALID_TOTAL_NUMBERS",
          message:
            "A valid total number count is required.",
        });
        return;
      }

      if (
        entryFee === undefined
      ) {
        res.status(400).json({
          error:
            "INVALID_ENTRY_FEE",
          message:
            "A valid entry fee is required.",
        });
        return;
      }

      if (
        winnerCount === undefined
      ) {
        res.status(400).json({
          error:
            "INVALID_WINNER_COUNT",
          message:
            "A valid winner count is required.",
        });
        return;
      }

      if (!prizes) {
        res.status(400).json({
          error:
            "PRIZES_REQUIRED",
          message:
            "Prize distribution is required.",
        });
        return;
      }

      const result =
        await createDraw(
          req.user.id,
          {
            name,
            description:
              getNullableString(
                body.description,
              ),
            prizeType,
            prizeName,
            prizeImageUrl:
              getNullableString(
                body.prizeImageUrl,
              ),
            prizeDescription:
              getNullableString(
                body.prizeDescription,
              ),
            displayedPrizeValue:
              getNumber(
                body.displayedPrizeValue,
              ) ?? null,
            actualPrizeCost:
              getNumber(
                body.actualPrizeCost,
              ) ?? null,
            totalNumbers,
            entryFee,
            winnerCount,
            uniqueWinners:
              getBoolean(
                body.uniqueWinners,
              ) ?? true,
            startsAt:
              getNullableString(
                body.startsAt,
              ),

            // No closing deadline.
            deadlineAt: null,

            drawAt:
              getNullableString(
                body.drawAt,
              ),
            prizes,
          },
        );

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_CREATION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "DRAW_NAME_REQUIRED",
          "DRAW_NAME_TOO_LONG",
          "DRAW_DESCRIPTION_TOO_LONG",
          "INVALID_PRIZE_TYPE",
          "PRIZE_NAME_REQUIRED",
          "PRIZE_NAME_TOO_LONG",
          "PRIZE_IMAGE_URL_TOO_LONG",
          "PRIZE_DESCRIPTION_TOO_LONG",
          "DISPLAYED_PRIZE_VALUE_INVALID",
          "ACTUAL_PRIZE_COST_INVALID",
          "INVALID_TOTAL_NUMBERS",
          "INVALID_ENTRY_FEE",
          "INVALID_WINNER_COUNT",
          "STARTS_AT_INVALID",
          "DRAW_AT_INVALID",
          "DRAW_TIME_MUST_BE_ON_OR_AFTER_START",
          "PRIZES_REQUIRED",
          "PRIZE_COUNT_MUST_MATCH_WINNERS",
          "INVALID_PRIZE_RANK",
          "DUPLICATE_PRIZE_RANK",
          "INVALID_PRIZE_AMOUNT",
          "PRIZE_RANKS_MUST_BE_SEQUENTIAL",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message,
        });
        return;
      }

      console.error(
        "Create admin draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_CREATION_FAILED",
        message:
          "The draw could not be created.",
      });
    }
  },
);

/*
 * Open a draft or safely reopen a closed draw.
 *
 * POST /admin/draws/:drawId/open
 *
 * Opening a draw is not blocked by a deadline.
 *
 * After a successful open:
 * Telegram users receive the new-draw notification.
 *
 * Notification failure does NOT fail the draw opening.
 */
router.post(
  "/:drawId/open",
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

      const draw =
        await openDraw(
          req.user.id,
          drawId,
        );

      /*
       * Telegram notification is intentionally
       * executed after the draw has successfully
       * opened.
       *
       * A Telegram API failure must never undo
       * the successful draw opening.
       */
      try {
        await notifyUsersAboutOpenedDraw(
          {
            id: draw.id,
            name: draw.name,
            prizeName:
              draw.prizeName,
            prizeType:
              draw.prizeType,
            displayedPrizeValue:
              draw.displayedPrizeValue,
            totalNumbers:
              draw.totalNumbers,
            entryFee:
              draw.entryFee,
            winnerCount:
              draw.winnerCount,
          },
        );
      } catch (notificationError) {
        console.error(
          "Open draw notification error:",
          notificationError,
        );
      }

      res.status(200).json({
        draw,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_OPEN_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_NOT_FOUND",
          "DRAW_NOT_EDITABLE",
          "DRAW_ALREADY_EXECUTED",
          "INVALID_TOTAL_NUMBERS",
          "INVALID_ENTRY_FEE",
          "INVALID_WINNER_COUNT",
          "PRIZE_COUNT_MUST_MATCH_WINNERS",
          "PRIZE_RANKS_MUST_BE_SEQUENTIAL",
          "INVALID_PRIZE_AMOUNT",
          "PRIZE_POOL_MUST_BE_GREATER_THAN_ZERO",
          "DRAW_TIME_ALREADY_PASSED",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The draw could not be opened.",
        });
        return;
      }

      console.error(
        "Open draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_OPEN_FAILED",
        message:
          "The draw could not be opened.",
      });
    }
  },
);

/*
 * Close an open/full draw.
 *
 * POST /admin/draws/:drawId/close
 *
 * This is a manual administrative close.
 * It is NOT triggered by a time deadline.
 */
router.post(
  "/:drawId/close",
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

      const draw =
        await closeDraw(
          req.user.id,
          drawId,
        );

      res.status(200).json({
        draw,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_CLOSE_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_NOT_FOUND",
          "DRAW_NOT_CLOSEABLE",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The draw could not be closed.",
        });
        return;
      }

      console.error(
        "Close draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_CLOSE_FAILED",
        message:
          "The draw could not be closed.",
      });
    }
  },
);

export default router;
