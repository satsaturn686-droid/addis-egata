import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  approvePayment,
  getPendingPayments,
  rejectPayment,
} from "../services/payment-verification.js";

import {
  getPaymentSettings,
  updateTelebirrNumber,
} from "../services/payment-settings.js";

const router = Router();

/*
 * All routes in this file require:
 * 1. Valid Telegram authentication
 * 2. Administrator privileges
 */

router.use(
  requireTelegramAuth,
  requireAdmin,
);

/*
 * GET /admin/payments/settings
 *
 * Returns the current Telebirr payment settings.
 */
router.get(
  "/settings",
  async (_req, res) => {
    try {
      const settings =
        await getPaymentSettings();

      res.status(200).json({
        settings,
      });
    } catch (error) {
      console.error(
        "Get payment settings error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENT_SETTINGS_LOAD_FAILED",
        message:
          "Payment settings could not be loaded.",
      });
    }
  },
);

/*
 * POST /admin/payments/settings
 *
 * Updates the Telebirr receiving number.
 */
router.post(
  "/settings",
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

      const telebirrNumber =
        typeof req.body?.telebirrNumber ===
        "string"
          ? req.body.telebirrNumber.trim()
          : "";

      if (!telebirrNumber) {
        res.status(400).json({
          error:
            "TELEBIRR_NUMBER_REQUIRED",
          message:
            "Telebirr number is required.",
        });
        return;
      }

      if (telebirrNumber.length > 100) {
        res.status(400).json({
          error:
            "TELEBIRR_NUMBER_TOO_LONG",
          message:
            "Telebirr number is too long.",
        });
        return;
      }

      const settings =
        await updateTelebirrNumber(
          telebirrNumber,
          req.user.id,
        );

      res.status(200).json({
        settings,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYMENT_SETTINGS_UPDATE_FAILED";

      const clientErrors = new Set([
        "INVALID_ADMIN_USER_ID",
        "TELEBIRR_NUMBER_REQUIRED",
        "TELEBIRR_NUMBER_TOO_LONG",
      ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The Telebirr number could not be saved.",
        });
        return;
      }

      console.error(
        "Update payment settings error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENT_SETTINGS_UPDATE_FAILED",
        message:
          "The Telebirr number could not be saved.",
      });
    }
  },
);

/*
 * GET /admin/payments/pending
 *
 * Returns payments waiting for manual Telebirr verification.
 */
router.get(
  "/pending",
  async (_req, res) => {
    try {
      const payments =
        await getPendingPayments();

      res.status(200).json({
        payments,
      });
    } catch (error) {
      console.error(
        "Get pending payments error:",
        error,
      );

      res.status(500).json({
        error:
          "PENDING_PAYMENTS_LOAD_FAILED",
        message:
          "Pending payments could not be loaded.",
      });
    }
  },
);

/*
 * POST /admin/payments/:paymentId/approve
 *
 * Approves a pending Telebirr payment.
 *
 * Important:
 * The 30-minute reservation applies to payment
 * submission. Once the payment has been submitted
 * and remains pending, it can still be approved
 * after the reservation period, provided the draw
 * deadline has not passed.
 */
router.post(
  "/:paymentId/approve",
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

      const paymentId =
        req.params.paymentId?.trim();

      if (!paymentId) {
        res.status(400).json({
          error:
            "INVALID_PAYMENT_ID",
          message:
            "Payment ID is required.",
        });
        return;
      }

      const payment =
        await approvePayment(
          paymentId,
          req.user.id,
        );

      res.status(200).json({
        payment,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYMENT_APPROVAL_FAILED";

      const clientErrors = new Set([
        "INVALID_ADMIN_USER_ID",
        "PAYMENT_NOT_FOUND",
        "PAYMENT_ALREADY_PROCESSED",
        "ENTRY_NOT_FOUND",
        "PAYMENT_ENTRY_MISMATCH",
        "PAYMENT_AMOUNT_MISMATCH",
        "ENTRY_NOT_VERIFIABLE",
        "DRAW_NOT_VERIFIABLE",
        "DRAW_NOT_STARTED",
        "DRAW_DEADLINE_PASSED",
        "ENTRY_ALREADY_PAID",
      ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The payment could not be approved.",
        });
        return;
      }

      console.error(
        "Approve payment error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENT_APPROVAL_FAILED",
        message:
          "The payment could not be approved.",
      });
    }
  },
);

/*
 * POST /admin/payments/:paymentId/reject
 *
 * Rejects a pending Telebirr payment and
 * releases the selected number.
 */
router.post(
  "/:paymentId/reject",
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

      const paymentId =
        req.params.paymentId?.trim();

      const rejectionReason =
        typeof req.body?.rejectionReason ===
        "string"
          ? req.body.rejectionReason.trim()
          : "";

      if (!paymentId) {
        res.status(400).json({
          error:
            "INVALID_PAYMENT_ID",
          message:
            "Payment ID is required.",
        });
        return;
      }

      if (!rejectionReason) {
        res.status(400).json({
          error:
            "REJECTION_REASON_REQUIRED",
          message:
            "A rejection reason is required.",
        });
        return;
      }

      const payment =
        await rejectPayment(
          paymentId,
          req.user.id,
          rejectionReason,
        );

      res.status(200).json({
        payment,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYMENT_REJECTION_FAILED";

      const clientErrors = new Set([
        "INVALID_ADMIN_USER_ID",
        "REJECTION_REASON_REQUIRED",
        "REJECTION_REASON_TOO_LONG",
        "PAYMENT_NOT_FOUND",
        "PAYMENT_ALREADY_PROCESSED",
        "ENTRY_NOT_FOUND",
        "PAYMENT_ENTRY_MISMATCH",
        "ENTRY_NOT_REJECTABLE",
      ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The payment could not be rejected.",
        });
        return;
      }

      console.error(
        "Reject payment error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENT_REJECTION_FAILED",
        message:
          "The payment could not be rejected.",
      });
    }
  },
);

export default router;
