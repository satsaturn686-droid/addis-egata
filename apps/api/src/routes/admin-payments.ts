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

import {
  getPendingWalletDeposits,
  approveWalletDeposit,
  rejectWalletDeposit,
} from "../services/wallet.js";

import {
  getPendingWalletWithdrawals,
  approveWalletWithdrawal,
  rejectWalletWithdrawal,
} from "../services/wallet-withdrawals.js";

const router = Router();

router.use(
  requireTelegramAuth,
  requireAdmin,
);

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

      if (
        telebirrNumber.length > 100
      ) {
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

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "TELEBIRR_NUMBER_REQUIRED",
          "TELEBIRR_NUMBER_TOO_LONG",
        ]);

      if (
        clientErrors.has(message)
      ) {
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

router.get(
  "/wallet/deposits/pending",
  async (_req, res) => {
    try {
      const deposits =
        await getPendingWalletDeposits();

      res.status(200).json({
        deposits,
      });
    } catch (error) {
      console.error(
        "Get pending wallet deposits error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_DEPOSITS_LOAD_FAILED",
        message:
          "Pending wallet deposits could not be loaded.",
      });
    }
  },
);

router.post(
  "/wallet/deposits/:depositId/approve",
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

      const depositId =
        req.params.depositId?.trim();

      if (!depositId) {
        res.status(400).json({
          error:
            "INVALID_DEPOSIT_ID",
          message:
            "Deposit ID is required.",
        });
        return;
      }

      const deposit =
        await approveWalletDeposit(
          depositId,
          req.user.id,
        );

      res.status(200).json({
        deposit,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_DEPOSIT_APPROVAL_FAILED";

      const clientErrors =
        new Set([
          "INVALID_DEPOSIT_ID",
          "INVALID_ADMIN_USER_ID",
          "DEPOSIT_NOT_FOUND",
          "DEPOSIT_ALREADY_PROCESSED",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet deposit could not be approved.",
        });
        return;
      }

      console.error(
        "Approve wallet deposit error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_DEPOSIT_APPROVAL_FAILED",
        message:
          "The wallet deposit could not be approved.",
      });
    }
  },
);

router.post(
  "/wallet/deposits/:depositId/reject",
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

      const depositId =
        req.params.depositId?.trim();

      const rejectionReason =
        typeof req.body?.rejectionReason ===
        "string"
          ? req.body.rejectionReason.trim()
          : "";

      if (!depositId) {
        res.status(400).json({
          error:
            "INVALID_DEPOSIT_ID",
          message:
            "Deposit ID is required.",
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

      const deposit =
        await rejectWalletDeposit(
          depositId,
          req.user.id,
          rejectionReason,
        );

      res.status(200).json({
        deposit,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_DEPOSIT_REJECTION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_DEPOSIT_ID",
          "INVALID_ADMIN_USER_ID",
          "REJECTION_REASON_REQUIRED",
          "REJECTION_REASON_TOO_LONG",
          "DEPOSIT_NOT_FOUND",
          "DEPOSIT_ALREADY_PROCESSED",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet deposit could not be rejected.",
        });
        return;
      }

      console.error(
        "Reject wallet deposit error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_DEPOSIT_REJECTION_FAILED",
        message:
          "The wallet deposit could not be rejected.",
      });
    }
  },
);

router.get(
  "/wallet/withdrawals/pending",
  async (_req, res) => {
    try {
      const withdrawals =
        await getPendingWalletWithdrawals();

      res.status(200).json({
        withdrawals,
      });
    } catch (error) {
      console.error(
        "Get pending wallet withdrawals error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_WITHDRAWALS_LOAD_FAILED",
        message:
          "Pending wallet withdrawals could not be loaded.",
      });
    }
  },
);

router.post(
  "/wallet/withdrawals/:withdrawalId/approve",
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

      const withdrawalId =
        req.params.withdrawalId?.trim();

      const paymentReference =
        typeof req.body?.paymentReference ===
        "string"
          ? req.body.paymentReference.trim()
          : "";

      if (!withdrawalId) {
        res.status(400).json({
          error:
            "INVALID_WITHDRAWAL_ID",
          message:
            "Withdrawal ID is required.",
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

      const withdrawal =
        await approveWalletWithdrawal(
          withdrawalId,
          req.user.id,
          paymentReference,
        );

      res.status(200).json({
        withdrawal,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_WITHDRAWAL_APPROVAL_FAILED";

      const clientErrors =
        new Set([
          "INVALID_WITHDRAWAL_ID",
          "INVALID_ADMIN_USER_ID",
          "PAYMENT_REFERENCE_REQUIRED",
          "PAYMENT_REFERENCE_TOO_LONG",
          "WITHDRAWAL_NOT_FOUND",
          "WITHDRAWAL_ALREADY_PROCESSED",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet withdrawal could not be approved.",
        });
        return;
      }

      console.error(
        "Approve wallet withdrawal error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_WITHDRAWAL_APPROVAL_FAILED",
        message:
          "The wallet withdrawal could not be approved.",
      });
    }
  },
);

router.post(
  "/wallet/withdrawals/:withdrawalId/reject",
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

      const withdrawalId =
        req.params.withdrawalId?.trim();

      const rejectionReason =
        typeof req.body?.rejectionReason ===
        "string"
          ? req.body.rejectionReason.trim()
          : "";

      if (!withdrawalId) {
        res.status(400).json({
          error:
            "INVALID_WITHDRAWAL_ID",
          message:
            "Withdrawal ID is required.",
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

      const withdrawal =
        await rejectWalletWithdrawal(
          withdrawalId,
          req.user.id,
          rejectionReason,
        );

      res.status(200).json({
        withdrawal,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WALLET_WITHDRAWAL_REJECTION_FAILED";

      const clientErrors =
        new Set([
          "INVALID_WITHDRAWAL_ID",
          "INVALID_ADMIN_USER_ID",
          "REJECTION_REASON_REQUIRED",
          "REJECTION_REASON_TOO_LONG",
          "WITHDRAWAL_NOT_FOUND",
          "WITHDRAWAL_ALREADY_PROCESSED",
          "WALLET_NOT_FOUND",
        ]);

      if (
        clientErrors.has(message)
      ) {
        res.status(400).json({
          error: message,
          message:
            "The wallet withdrawal could not be rejected.",
        });
        return;
      }

      console.error(
        "Reject wallet withdrawal error:",
        error,
      );

      res.status(500).json({
        error:
          "WALLET_WITHDRAWAL_REJECTION_FAILED",
        message:
          "The wallet withdrawal could not be rejected.",
      });
    }
  },
);

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

      const clientErrors =
        new Set([
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

      if (
        clientErrors.has(message)
      ) {
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

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "REJECTION_REASON_REQUIRED",
          "REJECTION_REASON_TOO_LONG",
          "PAYMENT_NOT_FOUND",
          "PAYMENT_ALREADY_PROCESSED",
          "ENTRY_NOT_FOUND",
          "PAYMENT_ENTRY_MISMATCH",
          "ENTRY_NOT_REJECTABLE",
        ]);

      if (
        clientErrors.has(message)
      ) {
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
