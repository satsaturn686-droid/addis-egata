
import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import { requireTelegramAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { approveAndCreditReferralReward } from "../services/referral-rewards.js";

const router = Router();

router.use(requireTelegramAuth, requireAdmin);

// GET /admin-referrals/rewards/pending
router.get("/rewards/pending", async (_req: Request, res: Response) => {
  if (!pool) {
    return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  }

  try {
    const result = await pool.query(
      `SELECT
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
       LIMIT 100`
    );

    return res.json({ rewards: result.rows });
  } catch (error) {
    console.error("Failed to load referral rewards:", error);
    return res.status(500).json({ error: "REFERRAL_REWARDS_LOAD_FAILED" });
  }
});

// POST /admin-referrals/rewards/:rewardId/approve
router.post(
  "/rewards/:rewardId/approve",
  async (req: Request, res: Response) => {
    const rewardId = Number(req.params.rewardId);
    const adminUserId = Number(req.user?.id);

    if (!Number.isSafeInteger(rewardId) || rewardId <= 0) {
      return res.status(400).json({ error: "INVALID_REWARD_ID" });
    }

    if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
      return res.status(401).json({ error: "ADMIN_ID_UNAVAILABLE" });
    }

    try {
      const result = await approveAndCreditReferralReward(
        rewardId,
        adminUserId
      );

      return res.json({
        success: true,
        reward: result,
      });
    } catch (error) {
      console.error("Failed to approve referral reward:", error);

      const message =
        error instanceof Error ? error.message : "UNKNOWN_ERROR";

      if (
        message === "REFERRAL_REWARD_NOT_FOUND" ||
        message === "REFERRAL_NOT_QUALIFIED" ||
        message === "INVALID_REFERRAL_REWARD_AMOUNT" ||
        message === "REFERRAL_REWARD_ALREADY_CREDITED"
      ) {
        return res.status(409).json({ error: message });
      }

      return res.status(500).json({
        error: "REFERRAL_REWARD_APPROVAL_FAILED",
      });
    }
  }
);

export default router;
