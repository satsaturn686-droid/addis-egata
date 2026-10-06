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

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";

function getRouteParam(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram payout notification skipped: TELEGRAM_BOT_TOKEN is missing.",
    );

    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      },
    );

    const data =
      (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

    if (
      !response.ok ||
      !data.ok
    ) {
      console.error(
        "Telegram payout notification failed:",
        data.description ??
          response.statusText,
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram payout notification request failed:",
      error,
    );

    return false;
  }
}

async function sendWinnerPaidNotification(
  payout: {
    telegramId: number;
    drawName: string;
    number: number;
    rank: number;
    prizeAmount: number;
    telebirrNumber: string | null;
    paymentReference: string | null;
  },
): Promise<void> {
  const reference =
    payout.paymentReference?.trim() ||
    "N/A";

  await sendTelegramMessage(
    payout.telegramId,
    "🎉 የክፍያ ማረጋገጫ\n\n" +
      "🏆 እንኳን ደስ አለዎት! የዕጣ ሽልማትዎ ክፍያ ተፈጽሟል።\n\n" +
      `🎟️ ዕጣ፦ ${payout.drawName}\n` +
      `🔢 የአሸናናፊ ቁጥር፦ ${payout.number}\n` +
      `🥇 ደረጃ፦ ${payout.rank}\n` +
      `💰 የተከፈለ፦ ${payout.prizeAmount.toLocaleString()} ETB\n` +
      `📱 Telebirr፦ ${payout.telebirrNumber ?? "N/A"}\n` +
      `🧾 የክፍያ ማጣቀሻ፦ ${reference}\n\n` +
      "✅ የክፍያ ሁኔታ፦ PAID\n\n" +
      "🙏 ADDIS ዕጣን ስለተጠቀሙ እናመሰግናለን።",
  );
}

router.use(requireTelegramAuth);

/*
 * GET /winner-payouts/mine
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
          Number(
            req.user.telegramId,
          ),
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
 * GET /winner-payouts/claim-link/:winnerId
 *
 * Returns a Telegram deep link only when the
 * authenticated Telegram user is the actual winner.
 */
router.get(
  "/claim-link/:winnerId",
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

      const winnerId =
        getRouteParam(
          req.params.winnerId,
        );

      if (!winnerId) {
        res.status(400).json({
          error:
            "INVALID_WINNER_ID",
          message:
            "Winner ID is required.",
        });
        return;
      }

      const payout =
        await startWinnerClaim(
          winnerId,
          Number(
            req.user.telegramId,
          ),
        );

      if (!TELEGRAM_BOT_TOKEN) {
        throw new Error(
          "TELEGRAM_BOT_NOT_CONFIGURED",
        );
      }

      const response =
        await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
          },
        );

      const data =
        (await response.json()) as {
          ok?: boolean;
          description?: string;
          result?: {
            username?: string;
          };
        };

      if (
        !response.ok ||
        !data.ok ||
        !data.result?.username
      ) {
        console.error(
          "Telegram getMe failed:",
          data.description ??
            response.statusText,
        );

        throw new Error(
          "TELEGRAM_BOT_USERNAME_UNAVAILABLE",
        );
      }

      const claimUrl =
        `https://t.me/${data.result.username}?start=claim_${encodeURIComponent(
          winnerId,
        )}`;

      res.status(200).json({
        claimUrl,
        payout,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WINNER_CLAIM_LINK_FAILED";

      const clientErrors =
        new Set([
          "INVALID_WINNER_ID",
          "INVALID_TELEGRAM_USER_ID",
          "WINNER_NOT_AUTHORIZED",
          "PAYOUT_NOT_FOUND",
        ]);

      if (
        clientErrors.has(
          message,
        )
      ) {
        res.status(400).json({
          error: message,
          message:
            "The winner claim link could not be created.",
        });
        return;
      }

      console.error(
        "Create winner claim link error:",
        error,
      );

      res.status(500).json({
        error:
          "WINNER_CLAIM_LINK_FAILED",
        message:
          "The winner claim link could not be created.",
      });
    }
  },
);

/*
 * ADMIN
 *
 * GET /winner-payouts/admin/pending
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
          error:
            "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

      if (!payoutId) {
        res.status(400).json({
          error:
            "INVALID_PAYOUT_ID",
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
          error:
            "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

      const reason =
        typeof req.body?.reason ===
        "string"
          ? req.body.reason.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error:
            "INVALID_PAYOUT_ID",
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
 * Important:
 * The database payment is completed first.
 * Telegram notification failure must NOT
 * roll the payment back.
 */
router.post(
  "/admin/:payoutId/paid",
  requireAdmin,
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

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

      const paymentReference =
        typeof req.body?.paymentReference ===
        "string"
          ? req.body.paymentReference.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error:
            "INVALID_PAYOUT_ID",
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

      /*
       * First permanently mark the payout as paid.
       */
      const payout =
        await markWinnerPayoutPaid(
          payoutId,
          req.user.id,
          paymentReference,
        );

      /*
       * Then notify the actual winner privately.
       *
       * If Telegram fails, the payout remains PAID.
       */
      await sendWinnerPaidNotification(
        payout,
      );

      res.status(200).json({
        payout,
        notificationSent:
          Boolean(
            TELEGRAM_BOT_TOKEN,
          ),
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
 */
router.get(
  "/:payoutId",
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

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

      if (!payoutId) {
        res.status(400).json({
          error:
            "INVALID_PAYOUT_ID",
          message:
            "Payout ID is required.",
        });
        return;
      }

      const payout =
        await getPayoutByTelegramUser(
          Number(
            req.user.telegramId,
          ),
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
 */
router.post(
  "/claim/:winnerId",
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

      const winnerId =
        getRouteParam(
          req.params.winnerId,
        );

      if (!winnerId) {
        res.status(400).json({
          error:
            "INVALID_WINNER_ID",
          message:
            "Winner ID is required.",
        });
        return;
      }

      const payout =
        await startWinnerClaim(
          winnerId,
          Number(
            req.user.telegramId,
          ),
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
        error:
          "WINNER_CLAIM_FAILED",
        message:
          "The winner claim could not be started.",
      });
    }
  },
);

/*
 * POST /winner-payouts/:payoutId/screenshot
 */
router.post(
  "/:payoutId/screenshot",
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

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

      const fileId =
        typeof req.body?.fileId ===
        "string"
          ? req.body.fileId.trim()
          : "";

      const fileUniqueId =
        typeof req.body?.fileUniqueId ===
        "string"
          ? req.body.fileUniqueId.trim()
          : "";

      if (!payoutId) {
        res.status(400).json({
          error:
            "INVALID_PAYOUT_ID",
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
          Number(
            req.user.telegramId,
          ),
          fileId,
          fileUniqueId ||
            undefined,
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
 */
router.post(
  "/:payoutId/telebirr",
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

      const payoutId =
        getRouteParam(
          req.params.payoutId,
        );

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
          error:
            "INVALID_PAYOUT_ID",
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
          Number(
            req.user.telegramId,
          ),
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

      if (
        clientErrors.has(
          message,
        )
      ) {
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
