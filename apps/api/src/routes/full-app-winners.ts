
import { Router } from "express";

import { pool } from "../db.js";
import { requireTelegramAuth } from "../middleware/auth.js";
import { creditCashWinnerToWallet } from "../services/winner-wallet-payouts.js";

const router = Router();

// Full App sessions only. Do not change the Mini App payout routes.
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
          c.wallet_transaction_id AS "walletTransactionId"
        FROM winners w
        INNER JOIN draws d ON d.id = w.draw_id
        LEFT JOIN winner_wallet_credits c ON c.winner_id = w.id
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

    // Verify that this winner belongs to the logged-in Full App user.
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

export default router;
