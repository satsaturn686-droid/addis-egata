import { Router } from "express";

import { pool } from "../db.js";
import { requireTelegramAuth } from "../middleware/auth.js";
import { creditCashWinnerToWallet } from "../services/winner-wallet-payouts.js";

const router = Router();

// Full App sessions only. Mini App payout routes remain unchanged.
router.use(requireTelegramAuth, (req, res, next) => {
  if (req.appSessionAuth !== true || !req.user) {
    res.status(403).json({
      error: "FULL_APP_SESSION_REQUIRED",
      message: "Please sign in through the Addis ዕጣ Full App.",
    });
    return;
  }

  next();
});

// GET /full-app/winners/mine
router.get("/mine", async (req, res): Promise<void> => {
  try {
    if (!pool || !req.user) {
      res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }

    const result = await pool.query(
      `
        SELECT
          w.id AS "winnerId",
          w.draw_id AS "drawId",
          d.name AS "drawName",
          d.prize_type AS "prizeType",
          w.prize_amount AS "prizeAmount",
          (c.winner_id IS NOT NULL) AS "creditedToWallet",
          c.wallet_transaction_id AS "walletTransactionId",
          wp.status AS "payoutStatus",
          wp.recipient_full_name AS "recipientFullName",
          wp.recipient_phone AS "recipientPhone",
          wp.submitted_at AS "submittedAt"
        FROM winners w
        INNER JOIN draws d ON d.id = w.draw_id
        LEFT JOIN winner_wallet_credits c ON c.winner_id = w.id
        LEFT JOIN winner_payouts wp ON wp.winner_id = w.id
        WHERE w.user_id = $1
        ORDER BY w.id DESC
      `,
      [req.user.id],
    );

    res.status(200).json({ winners: result.rows });
  } catch (error) {
    console.error("Full App winners load failed:", error);
    res.status(500).json({
      error: "FULL_APP_WINNERS_LOAD_FAILED",
      message: "Your winner history could not be loaded.",
    });
  }
});

// POST /full-app/winners/:winnerId/credit
router.post("/:winnerId/credit", async (req, res): Promise<void> => {
  try {
    if (!pool || !req.user) {
      res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }

    const winnerId =
      typeof req.params.winnerId === "string"
        ? req.params.winnerId.trim()
        : "";

    if (!winnerId) {
      res.status(400).json({ error: "INVALID_WINNER_ID" });
      return;
    }

    const ownership = await pool.query(
      `
        SELECT w.id, d.prize_type
        FROM winners w
        INNER JOIN draws d ON d.id = w.draw_id
        WHERE w.id = $1 AND w.user_id = $2
        LIMIT 1
      `,
      [winnerId, req.user.id],
    );

    if (ownership.rows.length === 0) {
      res.status(404).json({ error: "WINNER_NOT_FOUND" });
      return;
    }

    if (ownership.rows[0].prize_type !== "cash") {
      res.status(400).json({
        error: "WINNER_PRIZE_IS_NOT_CASH",
        message: "Only cash prizes can be credited to the wallet.",
      });
      return;
    }

    const credit = await creditCashWinnerToWallet(winnerId);

    res.status(200).json({
      message: "Cash prize credited to your wallet.",
      credit,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "WINNER_WALLET_CREDIT_FAILED";

    if (
      [
        "WINNER_NOT_FOUND",
        "WINNER_PRIZE_IS_NOT_CASH",
        "INVALID_WINNER_ID",
        "INVALID_WINNER_PRIZE_AMOUNT",
      ].includes(message)
    ) {
      res.status(400).json({ error: message });
      return;
    }

    console.error("Full App winner wallet credit failed:", error);
    res.status(500).json({
      error: "WINNER_WALLET_CREDIT_FAILED",
      message: "The cash prize could not be credited to your wallet.",
    });
  }
});

// POST /full-app/winners/:winnerId/physical-claim
router.post("/:winnerId/physical-claim", async (req, res): Promise<void> => {
  try {
    if (!pool || !req.user) {
      res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }

    const winnerId =
      typeof req.params.winnerId === "string"
        ? req.params.winnerId.trim()
        : "";

    const fullName =
      typeof req.body?.fullName === "string"
        ? req.body.fullName.trim()
        : "";

    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim()
        : "";

    if (!winnerId) {
      res.status(400).json({ error: "INVALID_WINNER_ID" });
      return;
    }

    if (!fullName) {
      res.status(400).json({
        error: "RECIPIENT_FULL_NAME_REQUIRED",
        message: "ሙሉ ስምዎን ያስገቡ።",
      });
      return;
    }

    if (fullName.length > 200) {
      res.status(400).json({
        error: "RECIPIENT_FULL_NAME_TOO_LONG",
        message: "ሙሉ ስም ከ200 ቁምፊ መብለጥ የለበትም።",
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        error: "RECIPIENT_PHONE_REQUIRED",
        message: "ስልክ ቁጥርዎን ያስገቡ።",
      });
      return;
    }

    if (phone.length > 50) {
      res.status(400).json({
        error: "RECIPIENT_PHONE_TOO_LONG",
        message: "የስልክ ቁጥሩ በጣም ረጅም ነው።",
      });
      return;
    }

    const result = await pool.query(
      `
        WITH owned_winner AS (
          SELECT w.id, w.draw_id, w.user_id, w.prize_amount
          FROM winners w
          INNER JOIN draws d ON d.id = w.draw_id
          WHERE w.id = $1
            AND w.user_id = $2
            AND d.prize_type = 'physical'
          LIMIT 1
        )
        INSERT INTO winner_payouts (
          winner_id,
          draw_id,
          user_id,
          prize_amount,
          recipient_full_name,
          recipient_phone,
          submitted_at,
          status
        )
        SELECT
          id,
          draw_id,
          user_id,
          prize_amount,
          $3,
          $4,
          NOW(),
          'submitted'
        FROM owned_winner
        ON CONFLICT (winner_id)
        DO UPDATE SET
          recipient_full_name = EXCLUDED.recipient_full_name,
          recipient_phone = EXCLUDED.recipient_phone,
          submitted_at = NOW(),
          status = 'submitted',
          updated_at = NOW()
        WHERE winner_payouts.user_id = $2
          AND winner_payouts.status NOT IN ('approved', 'paid')
        RETURNING
          id,
          winner_id AS "winnerId",
          status,
          recipient_full_name AS "recipientFullName",
          recipient_phone AS "recipientPhone"
      `,
      [winnerId, req.user.id, fullName, phone],
    );

    if (result.rows.length === 0) {
      const ownership = await pool.query(
        `
          SELECT w.id
          FROM winners w
          INNER JOIN draws d ON d.id = w.draw_id
          WHERE w.id = $1
            AND w.user_id = $2
            AND d.prize_type = 'physical'
          LIMIT 1
        `,
        [winnerId, req.user.id],
      );

      if (ownership.rows.length === 0) {
        res.status(404).json({
          error: "PHYSICAL_WINNER_NOT_FOUND",
          message: "ይህ የአካላዊ ሽልማት አሸናፊነት ከመለያዎ ጋር አልተገናኘም።",
        });
        return;
      }

      res.status(409).json({
        error: "PHYSICAL_CLAIM_ALREADY_FINAL",
        message: "ይህ ሽልማት ተፈቅዷል ወይም ተሰጥቷል። ለእርዳታ አስተዳደሩን ያነጋግሩ።",
      });
      return;
    }

    res.status(200).json({
      message: "የአካላዊ ሽልማት መረጃዎ ለአስተዳደሩ ተልኳል።",
      claim: result.rows[0],
    });
  } catch (error) {
    console.error("Full App physical winner claim failed:", error);
    res.status(500).json({
      error: "PHYSICAL_WINNER_CLAIM_FAILED",
      message: "የሽልማት መረጃውን መላክ አልተቻለም።",
    });
  }
});

export default router;
