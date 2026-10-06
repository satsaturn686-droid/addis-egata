import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  approveWinnerPayout,
  getPendingWinnerPayouts,
  getPayoutByTelegramUser,
  rejectWinnerPayout,
  saveWinnerScreenshot,
  startWinnerClaim,
  submitWinnerTelebirr,
  markWinnerPayoutPaid,
} from "../services/winner-payouts.js";

const router = Router();

/*
 * All winner payout routes require
 * valid Telegram authentication.
 */
router.use(requireTelegramAuth);

/*
 * GET /winner-payouts/mine
 *
 * Returns the authenticated user's current
 * winner payout claim.
 */
router.get(
  "/mine",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payout =
        await getPayoutByTelegramUser(
          Number(req.user.telegramId),
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      console.error(
        "Get my winner payout error:",
        error,
      );

      res.status(500).json({
        error:
          "WINNER_PAYOUT_LOAD_FAILED",
        message:
          "Winner payout could not be loaded.",
      });
    }
  },
);

/*
 * ADMIN
 *
 * GET /winner-payouts/admin/pending
 *
 * Returns submitted/approved payouts.
 *
 * IMPORTANT:
 * Admin routes must appear before
 * the dynamic /:payoutId route.
 */
router.get(
  "/admin/pending",
  requireAdmin,
  async (_req, res) => {
    try {
      const payouts =
        await getPendingWinnerPayouts();

      res.status(200).json({
        payouts,
      });
    } catch (error) {
      console.error(
        "Get pending winner payouts error:",
        error,
      );

      res.status(500).json({
        error:
          "PENDING_WINNER_PAYOUTS_LOAD_FAILED",
        message:
          "Pending winner payouts could not be loaded.",
      });
    }
  },
);

/*
 * ADMIN
 *
 * POST /winner-payouts/admin/:payoutId/approve
 */
router.post(
  "/admin/:payoutId/approve",
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      const payout =
        await approveWinnerPayout(
          payoutId,
          req.user.id,
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYOUT_APPROVAL_FAILED";

      const clientErrors =
        new Set([
          "INVALID_PAYOUT_ID",
          "INVALID_ADMIN_USER_ID",
          "PAYOUT_NOT_APPROVABLE",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The winner payout could not be approved.",
        });
        return;
      }

      console.error(
        "Approve winner payout error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYOUT_APPROVAL_FAILED",
        message:
          "The winner payout could not be approved.",
      });
    }
  },
);

/*
 * ADMIN
 *
 * POST /winner-payouts/admin/:payoutId/reject
 */
router.post(
  "/admin/:payoutId/reject",
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      const reason =
        typeof req.body?.reason === "string"
          ? req.body.reason.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          error:
            "REJECTION_REASON_REQUIRED",
          message:
            "A rejection reason is required.",
        });
        return;
      }

      const payout =
        await rejectWinnerPayout(
          payoutId,
          req.user.id,
          reason,
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYOUT_REJECTION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_PAYOUT_ID",
          "INVALID_ADMIN_USER_ID",
          "REJECTION_REASON_REQUIRED",
          "REJECTION_REASON_TOO_LONG",
          "PAYOUT_NOT_REJECTABLE",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The winner payout could not be rejected.",
        });
        return;
      }

      console.error(
        "Reject winner payout error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYOUT_REJECTION_FAILED",
        message:
          "The winner payout could not be rejected.",
      });
    }
  },
);

/*
 * ADMIN
 *
 * POST /winner-payouts/admin/:payoutId/paid
 *
 * Records the actual Telebirr payout.
 */
router.post(
  "/admin/:payoutId/paid",
  requireAdmin,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      const paymentReference =
        typeof req.body?.paymentReference ===
        "string"
          ? req.body.paymentReference.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      if (!paymentReference) {
        res.status(400).json({
          error:
            "PAYMENT_REFERENCE_REQUIRED",
          message:
            "Payment reference is required.",
        });
        return;
      }

      const payout =
        await markWinnerPayoutPaid(
          payoutId,
          req.user.id,
          paymentReference,
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYOUT_PAYMENT_FAILED";

      const clientErrors =
        new Set([
          "INVALID_PAYOUT_ID",
          "INVALID_ADMIN_USER_ID",
          "PAYMENT_REFERENCE_REQUIRED",
          "PAYMENT_REFERENCE_TOO_LONG",
          "PAYOUT_NOT_PAYABLE",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The winner payout could not be marked as paid.",
        });
        return;
      }

      console.error(
        "Mark winner payout paid error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYOUT_PAYMENT_FAILED",
        message:
          "The winner payout could not be marked as paid.",
      });
    }
  },
);

/*
 * GET /winner-payouts/:payoutId
 *
 * Returns a payout only when it belongs to
 * the authenticated Telegram user.
 *
 * IMPORTANT:
 * This dynamic route is intentionally
 * placed AFTER all /admin routes.
 */
router.get(
  "/:payoutId",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      const payout =
        await getPayoutByTelegramUser(
          Number(req.user.telegramId),
          payoutId,
        );

      if (!payout) {
        res.status(404).json({
          error:
            "WINNER_PAYOUT_NOT_FOUND",
          message:
            "Winner payout was not found.",
        });
        return;
      }

      res.status(200).json({
        payout,
      });
    } catch (error) {
      console.error(
        "Get winner payout error:",
        error,
      );

      res.status(500).json({
        error:
          "WINNER_PAYOUT_LOAD_FAILED",
        message:
          "Winner payout could not be loaded.",
      });
    }
  },
);

/*
 * POST /winner-payouts/claim/:winnerId
 *
 * Starts a winner claim.
 *
 * Security:
 * winnerId alone is not enough.
 * The winner must belong to the authenticated
 * Telegram account.
 */
router.post(
  "/claim/:winnerId",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const winnerId =
        req.params.winnerId?.trim();

      if (!winnerId) {
        res.status(400).json({
          error: "INVALID_WINNER_ID",
          message:
            "Winner ID is required.",
        });
        return;
      }

      const payout =
        await startWinnerClaim(
          winnerId,
          Number(req.user.telegramId),
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WINNER_CLAIM_FAILED";

      const clientErrors =
        new Set([
          "INVALID_WINNER_ID",
          "INVALID_TELEGRAM_USER_ID",
          "WINNER_NOT_AUTHORIZED",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The winner claim could not be started.",
        });
        return;
      }

      console.error(
        "Start winner claim error:",
        error,
      );

      res.status(500).json({
        error: "WINNER_CLAIM_FAILED",
        message:
          "The winner claim could not be started.",
      });
    }
  },
);

/*
 * POST /winner-payouts/:payoutId/screenshot
 *
 * Telegram sends the screenshot file_id.
 *
 * The actual image is NOT uploaded to our
 * public server. Telegram file_id is stored.
 */
router.post(
  "/:payoutId/screenshot",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      const fileId =
        typeof req.body?.fileId === "string"
          ? req.body.fileId.trim()
          : "";

      const fileUniqueId =
        typeof req.body?.fileUniqueId ===
        "string"
          ? req.body.fileUniqueId.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      if (!fileId) {
        res.status(400).json({
          error:
            "SCREENSHOT_FILE_ID_REQUIRED",
          message:
            "Screenshot file ID is required.",
        });
        return;
      }

      const payout =
        await saveWinnerScreenshot(
          payoutId,
          Number(req.user.telegramId),
          fileId,
          fileUniqueId || undefined,
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "SCREENSHOT_SAVE_FAILED";

      const clientErrors =
        new Set([
          "INVALID_PAYOUT_ID",
          "INVALID_TELEGRAM_USER_ID",
          "SCREENSHOT_FILE_ID_REQUIRED",
          "SCREENSHOT_NOT_ACCEPTED",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The screenshot could not be saved.",
        });
        return;
      }

      console.error(
        "Save winner screenshot error:",
        error,
      );

      res.status(500).json({
        error:
          "SCREENSHOT_SAVE_FAILED",
        message:
          "The screenshot could not be saved.",
      });
    }
  },
);

/*
 * POST /winner-payouts/:payoutId/telebirr
 *
 * Winner submits Telebirr number and
 * account name after screenshot verification.
 */
router.post(
  "/:payoutId/telebirr",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        req.params.payoutId?.trim();

      const telebirrNumber =
        typeof req.body?.telebirrNumber ===
        "string"
          ? req.body.telebirrNumber.trim()
          : "";

      const accountName =
        typeof req.body?.accountName ===
        "string"
          ? req.body.accountName.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error: "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      if (!telebirrNumber) {
        res.status(400).json({
          error:
            "TELEBIRR_NUMBER_REQUIRED",
          message:
            "Telebirr number is required.",
        });
        return;
      }

      if (!accountName) {
        res.status(400).json({
          error:
            "TELEBIRR_ACCOUNT_NAME_REQUIRED",
          message:
            "Telebirr account name is required.",
        });
        return;
      }

      const payout =
        await submitWinnerTelebirr(
          payoutId,
          Number(req.user.telegramId),
          telebirrNumber,
          accountName,
        );

      res.status(200).json({
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYOUT_SUBMISSION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_PAYOUT_ID",
          "INVALID_TELEGRAM_USER_ID",
          "TELEBIRR_NUMBER_REQUIRED",
          "TELEBIRR_ACCOUNT_NAME_REQUIRED",
          "TELEBIRR_NUMBER_TOO_LONG",
          "TELEBIRR_ACCOUNT_NAME_TOO_LONG",
          "PAYOUT_SUBMISSION_NOT_ALLOWED",
          "PAYOUT_NOT_FOUND",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The Telebirr information could not be submitted.",
        });
        return;
      }

      console.error(
        "Submit winner Telebirr error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYOUT_SUBMISSION_FAILED",
        message:
          "The Telebirr information could not be submitted.",
      });
    }
  },
);

export default router;
