
import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import {
  requireTelegramAuth,
  requireAdmin,
} from "../middleware/auth.js";
import { approveAndCreditReferralReward } from "../services/referral-rewards.js";

const router = Router();

router.use(requireTelegramAuth, requireAdmin);

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
    const rewardId = Number(req.params.rewardId);
    const adminUserId = req.user?.id;

    if (!Number.isSafeInteger(rewardId) || rewardId <= 0) {
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

      res.json({
        success: true,
        reward: result,
      });
    } catch (error) {
      console.error("Failed to approve referral reward:", error);

      const message =
        error instanceof Error ? error.message : "UNKNOWN_ERROR";

      const conflictErrors = [
        "REFERRAL_REWARD_NOT_FOUND",
        "REFERRAL_NOT_QUALIFIED",
        "INVALID_REFERRAL_REWARD_AMOUNT",
        "REFERRAL_REWARD_ALREADY_CREDITED",
        "REFERRAL_REWARD_NOT_APPROVABLE",
        "REFERRAL_REWARD_TRANSACTION_EXISTS",
      ];

      if (conflictErrors.includes(message)) {
        res.status(409).json({ error: message });
        return;
      }

      res.status(500).json({
        error: "REFERRAL_REWARD_APPROVAL_FAILED",
      });
    }
  },
);

export default router;
