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

import {
  getWallet,
  createWalletDeposit,
  purchaseEntryWithWallet,
} from "../services/wallet.js";

import {
  createWalletWithdrawal,
  getMyPendingWalletWithdrawals,
} from "../services/wallet-withdrawals.js";
import {
  getMyWalletHistory,
} from "../services/wallet-history.js";
const router = Router();

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
  "/wallet",
  requireTelegramAuth,
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

      const wallet =
        await getWallet(
          req.user.id,
        );

      res.status(200).json({
        wallet,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_LOAD_FAILED";

      if (
        message ===
        "INVALID_USER_ID"
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet could not be loaded.",
        });
        return;
      }

      console.error(
        "Get wallet error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_LOAD_FAILED",
        message:
          "The wallet could not be loaded.",
      });
    }
  },
);

router.post(
  "/wallet/deposit/telebirr",
  requireTelegramAuth,
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

      const amount =
        Number(req.body?.amount);

      const transactionReference =
        typeof req.body?.transactionReference ===
        "string"
          ? req.body.transactionReference.trim()
          : "";

      const senderName =
        typeof req.body?.senderName ===
        "string"
          ? req.body.senderName.trim()
          : undefined;

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        res.status(400).json({
          error:
            "INVALID_DEPOSIT_AMOUNT",
          message:
            "A valid deposit amount is required.",
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

      const deposit =
        await createWalletDeposit(
          req.user.id,
          amount,
          transactionReference,
          senderName,
        );

      res.status(201).json({
        deposit,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_DEPOSIT_FAILED";

      const clientErrors =
        new Set([
          "INVALID_USER_ID",
          "INVALID_DEPOSIT_AMOUNT",
          "DEPOSIT_AMOUNT_TOO_LARGE",
          "INVALID_TRANSACTION_REFERENCE",
          "TRANSACTION_REFERENCE_TOO_LONG",
          "SENDER_NAME_TOO_LONG",
          "DUPLICATE_TRANSACTION_REFERENCE",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet deposit could not be submitted.",
        });
        return;
      }

      console.error(
        "Create wallet deposit error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_DEPOSIT_FAILED",
        message:
          "The wallet deposit could not be submitted.",
      });
    }
  },
);

router.get(
  "/wallet/withdrawals/pending",
  requireTelegramAuth,
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

      const withdrawals =
        await getMyPendingWalletWithdrawals(
          req.user.id,
        );

      res.status(200).json({
        withdrawals,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_WITHDRAWALS_LOAD_FAILED";

      if (
        message ===
        "INVALID_USER_ID"
      ) {
        res.status(400).json({
          error: message,
          message:
            "Pending withdrawals could not be loaded.",
        });
        return;
      }

      console.error(
        "Get wallet withdrawals error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_WITHDRAWALS_LOAD_FAILED",
        message:
          "Pending withdrawals could not be loaded.",
      });
    }
  },
);

router.post(
  "/wallet/withdraw",
  requireTelegramAuth,
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

      const amount =
        Number(req.body?.amount);

      const telebirrNumber =
        typeof req.body?.telebirrNumber ===
        "string"
          ? req.body.telebirrNumber.trim()
          : "";

      const withdrawal =
        await createWalletWithdrawal(
          req.user.id,
          amount,
          telebirrNumber,
        );

      res.status(201).json({
        withdrawal,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_WITHDRAWAL_FAILED";

      const clientErrors =
        new Set([
          "INVALID_USER_ID",
          "INVALID_WITHDRAWAL_AMOUNT",
          "WITHDRAWAL_AMOUNT_TOO_LARGE",
          "TELEBIRR_NUMBER_REQUIRED",
          "TELEBIRR_NUMBER_TOO_LONG",
          "WALLET_NOT_FOUND",
          "INSUFFICIENT_WALLET_BALANCE",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet withdrawal could not be submitted.",
        });
        return;
      }

      console.error(
        "Create wallet withdrawal error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_WITHDRAWAL_FAILED",
        message:
          "The wallet withdrawal could not be submitted.",
      });
    }
  },
);

router.post(
  "/wallet/purchase",
  requireTelegramAuth,
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

      const entryId =
        typeof req.body?.entryId ===
        "string"
          ? req.body.entryId.trim()
          : "";

      if (!entryId) {
        res.status(400).json({
          error:
            "INVALID_ENTRY_ID",
          message:
            "Entry ID is required.",
        });
        return;
      }

      const result =
        await purchaseEntryWithWallet(
          entryId,
          req.user.id,
        );

      res.status(200).json({
        result,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_PURCHASE_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ENTRY_ID",
          "INVALID_USER_ID",
          "ENTRY_NOT_FOUND",
          "ENTRY_NOT_OWNED",
          "ENTRY_NOT_PAYABLE",
          "DRAW_NOT_PAYABLE",
          "RESERVATION_EXPIRED",
          "INVALID_ENTRY_FEE",
          "INSUFFICIENT_WALLET_BALANCE",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The number could not be purchased with the wallet.",
        });
        return;
      }

      console.error(
        "Wallet purchase error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_PURCHASE_FAILED",
        message:
          "The number could not be purchased with the wallet.",
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
        await getUserPayments(
          req.user.id,
        );

      res.status(200).json({
        payments,
      });
    } catch (error) {
      console.error(
        "Get user payments error:",
        error,
      );

      res.status(500).json({
        error:
          "PAYMENTS_LOAD_FAILED",
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
          error:
            "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const entryId =
        typeof req.body?.entryId ===
        "string"
          ? req.body.entryId.trim()
          : "";

      const transactionReference =
        typeof req.body?.transactionReference ===
        "string"
          ? req.body.transactionReference.trim()
          : "";

      const senderName =
        typeof req.body?.senderName ===
        "string"
          ? req.body.senderName.trim()
          : undefined;

      const receiptImageUrl =
        typeof req.body?.receiptImageUrl ===
        "string"
          ? req.body.receiptImageUrl.trim()
          : undefined;

      if (!entryId) {
        res.status(400).json({
          error:
            "INVALID_ENTRY_ID",
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

      const clientErrors =
        new Set([
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

      if (
        clientErrors.has(message)
      ) {
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
          error:
            "AUTHENTICATION_REQUIRED",
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
          error:
            "INVALID_PAYMENT_ID",
          message:
            "Payment ID is required.",
        });
        return;
      }

      const payment =
        await getPaymentById(
          paymentId,
        );

      if (!payment) {
        res.status(404).json({
          error:
            "PAYMENT_NOT_FOUND",
          message:
            "The requested payment does not exist.",
        });
        return;
      }

      if (
        payment.userId !==
        req.user.id
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
        error:
          "PAYMENT_LOAD_FAILED",
        message:
          "The payment could not be loaded.",
      });
    }
  },
);
router.get(
  "/wallet/history",
  requireTelegramAuth,
  async (req, res) => {
    if (!req.user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
      });
      return;
    }

    try {
      const history = await getMyWalletHistory(
        req.user.id,
      );

      res.status(200).json({ history });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_HISTORY_LOAD_FAILED";

      if (message === "INVALID_USER_ID") {
        res.status(400).json({
          error: message,
          message: "Wallet history could not be loaded.",
        });
        return;
      }

      console.error("Wallet history error:", error);

      res.status(500).json({
        error: "WALLET_HISTORY_LOAD_FAILED",
        message: "Wallet history could not be loaded.",
      });
    }
  },
);
export default router;
