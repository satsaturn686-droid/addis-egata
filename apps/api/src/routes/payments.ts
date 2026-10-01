import { Router } from "express";

import { requireTelegramAuth } from "../middleware/auth.js";

import {
  createTelebirrPayment,
  getPaymentById,
  getUserPayments,
} from "../services/payments.js";

import {
  getPaymentSettings,
} from "../services/payment-settings.js";

const router = Router();

/*
 * GET /payments/settings
 *
 * Returns the public Telebirr payment settings
 * used by the Mini App payment instructions.
 *
 * This endpoint intentionally returns only
 * public payment information.
 */
router.get(
  "/settings",
  requireTelegramAuth,
  async (_req, res) => {
    try {
      const settings =
        await getPaymentSettings();

      res.status(200).json({
        settings,
      });
    } catch (error) {
      console.error(
        "Get public payment settings error:",
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

router.get(
  "/mine",
  requireTelegramAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required.",
        });
        return;
      }

      const payments =
        await getUserPayments(req.user.id);

      res.status(200).json({
        payments,
      });
    } catch (error) {
      console.error(
        "Get user payments error:",
        error,
      );

      res.status(500).json({
        error: "PAYMENTS_LOAD_FAILED",
        message:
          "Your payments could not be loaded.",
      });
    }
  },
);

router.post(
  "/telebirr",
  requireTelegramAuth,
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

      const entryId =
        typeof req.body?.entryId === "string"
          ? req.body.entryId.trim()
          : "";

      const transactionReference =
        typeof req.body?.transactionReference ===
        "string"
          ? req.body.transactionReference.trim()
          : "";

      const senderName =
        typeof req.body?.senderName === "string"
          ? req.body.senderName.trim()
          : undefined;

      const receiptImageUrl =
        typeof req.body?.receiptImageUrl ===
        "string"
          ? req.body.receiptImageUrl.trim()
          : undefined;

      if (!entryId) {
        res.status(400).json({
          error: "INVALID_ENTRY_ID",
          message:
            "Entry ID is required.",
        });
        return;
      }

      if (!transactionReference) {
        res.status(400).json({
          error:
            "INVALID_TRANSACTION_REFERENCE",
          message:
            "Telebirr transaction reference is required.",
        });
        return;
      }

      const payment =
        await createTelebirrPayment(
          entryId,
          req.user.id,
          transactionReference,
          senderName,
          receiptImageUrl,
        );

      res.status(201).json({
        payment,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PAYMENT_CREATION_FAILED";

      const clientErrors = new Set([
        "INVALID_ENTRY_ID",
        "INVALID_USER_ID",
        "INVALID_TRANSACTION_REFERENCE",
        "TRANSACTION_REFERENCE_TOO_LONG",
        "SENDER_NAME_TOO_LONG",
        "RECEIPT_IMAGE_URL_TOO_LONG",
        "ENTRY_NOT_FOUND",
        "ENTRY_NOT_OWNED",
        "ENTRY_NOT_PAYABLE",
        "PAYMENT_ALREADY_PENDING",
        "DRAW_NOT_PAYABLE",
        "DRAW_NOT_STARTED",
        "DRAW_DEADLINE_PASSED",
        "RESERVATION_EXPIRED",
        "DUPLICATE_TRANSACTION_REFERENCE",
        "INVALID_ENTRY_FEE",
      ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            "The Telebirr payment could not be submitted.",
        });
        return;
      }

      console.error(
        "Create Telebirr payment error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENT_CREATION_FAILED",
        message:
          "The Telebirr payment could not be submitted.",
      });
    }
  },
);

router.get(
  "/:paymentId",
  requireTelegramAuth,
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

      const rawPaymentId =
        req.params.paymentId;

      const paymentId =
        Array.isArray(rawPaymentId)
          ? rawPaymentId[0]?.trim() ?? ""
          : rawPaymentId.trim();

      if (!paymentId) {
        res.status(400).json({
          error: "INVALID_PAYMENT_ID",
          message:
            "Payment ID is required.",
        });
        return;
      }

      const payment =
        await getPaymentById(paymentId);

      if (!payment) {
        res.status(404).json({
          error: "PAYMENT_NOT_FOUND",
          message:
            "The requested payment does not exist.",
        });
        return;
      }

      if (
        payment.userId !== req.user.id
      ) {
        res.status(403).json({
          error:
            "PAYMENT_ACCESS_DENIED",
          message:
            "You cannot access this payment.",
        });
        return;
      }

      res.status(200).json({
        payment,
      });
    } catch (error) {
      console.error(
        "Get payment error:",
        error,
      );

      res.status(500).json({
        error: "PAYMENT_LOAD_FAILED",
        message:
          "The payment could not be loaded.",
      });
    }
  },
);

export default router;
