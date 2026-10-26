import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import {
  requireTelegramAuth,
  requireAdmin,
} from "../middleware/auth.js";
import { approveAndCreditReferralReward } from "../services/referral-rewards.js";
import {
  createMonthlyReferralContest,
  approveMonthlyReferralContest,
  payMonthlyReferralWinner,
} from "../services/referral-monthly-contests.js";

const router = Router();

router.use(requireTelegramAuth, requireAdmin);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

function sendServiceError(
  res: Response,
  error: unknown,
  fallback: string,
  conflictErrors: string[] = [],
): void {
  const message = getErrorMessage(error);

  console.error(`${fallback}:`, error);

  if (
    message === "CONTEST_MONTH_NOT_FINISHED" ||
    conflictErrors.includes(message)
  ) {
    res.status(409).json({ error: message });
    return;
  }

  if (message === "INVALID_CONTEST_MONTH") {
    res.status(400).json({ error: message });
    return;
  }

  if (
    message === "DATABASE_UNAVAILABLE" ||
    message === "DATABASE_URL is not configured"
  ) {
    res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    return;
  }

  res.status(500).json({ error: fallback });
}

router.get(
  "/rewards/pending",
  async (_req: Request, res: Response): Promise<void> => {
    if (!pool) {
      res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
      return;
    }

    try {
      const result = await pool.query(
        `
          SELECT
            rr.id,
            rr.referral_id,
            rr.inviter_user_id,
            rr.reward_amount,
            rr.status,
            rr.created_at,
            r.invitee_user_id,
            r.qualified_at
          FROM referral_rewards rr
          JOIN referrals r ON r.id = rr.referral_id
          WHERE rr.status IN ('pending', 'approved')
          ORDER BY rr.created_at ASC
          LIMIT 100
        `,
      );

      res.json({ rewards: result.rows });
    } catch (error) {
      console.error("Failed to load referral rewards:", error);
      res.status(500).json({
        error: "REFERRAL_REWARDS_LOAD_FAILED",
      });
    }
  },
);

router.post(
  "/rewards/:rewardId/approve",
  async (req: Request, res: Response): Promise<void> => {
    const rewardId = String(req.params.rewardId ?? "").trim();
    const adminUserId = req.user?.id;

    if (!rewardId || rewardId.length > 100) {
      res.status(400).json({ error: "INVALID_REWARD_ID" });
      return;
    }

    if (!adminUserId) {
      res.status(401).json({ error: "ADMIN_ID_UNAVAILABLE" });
      return;
    }

    try {
      const result = await approveAndCreditReferralReward(
        rewardId,
        adminUserId,
      );

      res.json({ success: true, reward: result });
    } catch (error) {
      sendServiceError(
        res,
        error,
        "REFERRAL_REWARD_APPROVAL_FAILED",
        [
          "REFERRAL_REWARD_NOT_FOUND",
          "REFERRAL_NOT_QUALIFIED",
          "INVALID_REFERRAL_REWARD_AMOUNT",
          "REFERRAL_REWARD_ALREADY_CREDITED",
          "REFERRAL_REWARD_NOT_ELIGIBLE",
          "REFERRAL_REWARD_TRANSACTION_EXISTS",
        ],
      );
    }
  },
);

router.get(
  "/monthly-contests",
  async (_req: Request, res: Response): Promise<void> => {
    if (!pool) {
      res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
      return;
    }

    try {
      const contests = await pool.query(
        `
          SELECT
            id,
            contest_month,
            status,
            total_budget,
            created_by,
            approved_by,
            approved_at,
            created_at,
            updated_at
          FROM referral_monthly_contests
          ORDER BY contest_month DESC
          LIMIT 24
        `,
      );

      const winners = await pool.query(
        `
          SELECT
            w.id,
            w.contest_id,
            w.user_id,
            w.rank,
            w.prize_amount,
            w.status,
            w.wallet_transaction_id,
            w.approved_by,
            w.approved_at,
            w.paid_at,
            w.created_at
          FROM referral_monthly_winners w
          JOIN referral_monthly_contests c
            ON c.id = w.contest_id
          ORDER BY
            c.contest_month DESC,
            w.rank ASC
          LIMIT 100
        `,
      );

      res.json({
        contests: contests.rows,
        winners: winners.rows,
      });
    } catch (error) {
      console.error("Failed to load monthly referral contests:", error);
      res.status(500).json({
        error: "MONTHLY_CONTESTS_LOAD_FAILED",
      });
    }
  },
);

router.post(
  "/monthly-contests",
  async (req: Request, res: Response): Promise<void> => {
    const adminUserId = req.user?.id;
    const month = String(req.body?.month ?? "").trim();

    if (!adminUserId) {
      res.status(401).json({ error: "ADMIN_ID_UNAVAILABLE" });
      return;
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      res.status(400).json({ error: "INVALID_CONTEST_MONTH" });
      return;
    }

    try {
      const result = await createMonthlyReferralContest(
        month,
        adminUserId,
      );

      res.status(201).json({
        success: true,
        contest: result,
      });
    } catch (error) {
      sendServiceError(
        res,
        error,
        "MONTHLY_CONTEST_CREATE_FAILED",
        [
          "MONTHLY_CONTEST_ALREADY_EXISTS",
          "CONTEST_MONTH_NOT_FINISHED",
        ],
      );
    }
  },
);

router.post(
  "/monthly-contests/:contestId/approve",
  async (req: Request, res: Response): Promise<void> => {
    const contestId = String(req.params.contestId ?? "").trim();
    const adminUserId = req.user?.id;

    if (!contestId || contestId.length > 100) {
      res.status(400).json({ error: "INVALID_CONTEST_ID" });
      return;
    }

    if (!adminUserId) {
      res.status(401).json({ error: "ADMIN_ID_UNAVAILABLE" });
      return;
    }

    try {
      const result = await approveMonthlyReferralContest(
        contestId,
        adminUserId,
      );

      res.json({ success: true, contest: result });
    } catch (error) {
      sendServiceError(
        res,
        error,
        "MONTHLY_CONTEST_APPROVAL_FAILED",
        [
          "MONTHLY_CONTEST_NOT_FOUND",
          "MONTHLY_CONTEST_NOT_APPROVABLE",
          "INVALID_MONTHLY_CONTEST_BUDGET",
          "MONTHLY_CONTEST_HAS_NO_WINNERS",
          "MONTHLY_CONTEST_HAS_INVALID_WINNERS",
          "CONTEST_MONTH_NOT_FINISHED",
        ],
      );
    }
  },
);

router.post(
  "/monthly-winners/:winnerId/pay",
  async (req: Request, res: Response): Promise<void> => {
    const winnerId = String(req.params.winnerId ?? "").trim();
    const adminUserId = req.user?.id;

    if (!winnerId || winnerId.length > 100) {
      res.status(400).json({ error: "INVALID_WINNER_ID" });
      return;
    }

    if (!adminUserId) {
      res.status(401).json({ error: "ADMIN_ID_UNAVAILABLE" });
      return;
    }

    try {
      const result = await payMonthlyReferralWinner(
        winnerId,
        adminUserId,
      );

      res.json({ success: true, winner: result });
    } catch (error) {
      sendServiceError(
        res,
        error,
        "MONTHLY_WINNER_PAYMENT_FAILED",
        [
          "MONTHLY_WINNER_NOT_FOUND",
          "MONTHLY_WINNER_ALREADY_PAID",
          "MONTHLY_WINNER_NOT_APPROVED",
          "MONTHLY_CONTEST_NOT_APPROVED",
          "INVALID_MONTHLY_CONTEST_BUDGET",
          "INVALID_MONTHLY_WINNER_PRIZE",
          "MONTHLY_WINNER_TRANSACTION_EXISTS",
          "CONTEST_MONTH_NOT_FINISHED",
        ],
      );
    }
  },
);

export default router;
