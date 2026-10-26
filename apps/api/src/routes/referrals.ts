import { randomBytes } from "node:crypto";
import { Router } from "express";

import { pool } from "../db.js";
import { requireTelegramAuth } from "../middleware/auth.js";

const router = Router();

const REFERRAL_CODE_LENGTH = 10;

function generateReferralCode(): string {
  return randomBytes(8)
    .toString("hex")
    .slice(0, REFERRAL_CODE_LENGTH)
    .toUpperCase();
}

function sendDatabaseUnavailable(
  res: import("express").Response,
): void {
  res.status(503).json({
    error: "DATABASE_UNAVAILABLE",
    message: "The referral service is temporarily unavailable.",
  });
}

/**
 * GET /referrals/me
 *
 * Returns the current user's referral code and referral summary.
 * Creates a code if the user does not have one yet.
 */
router.get(
  "/me",
  requireTelegramAuth,
  async (req, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    if (!pool) {
      sendDatabaseUnavailable(res);
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let codeResult = await client.query<{
        code: string;
      }>(
        `
          SELECT code
          FROM referral_codes
          WHERE user_id = $1
            AND is_active = TRUE
          LIMIT 1
        `,
        [req.user.id],
      );

      if (codeResult.rows.length === 0) {
        let saved = false;
        let code = "";

        for (let attempt = 0; attempt < 5; attempt += 1) {
          code = generateReferralCode();

          const insertResult = await client.query(
            `
              INSERT INTO referral_codes (
                user_id,
                code,
                is_active
              )
              VALUES ($1, $2, TRUE)
              ON CONFLICT DO NOTHING
              RETURNING code
            `,
            [req.user.id, code],
          );

          if (insertResult.rowCount === 1) {
            saved = true;
            break;
          }

          const existingResult = await client.query<{
            code: string;
          }>(
            `
              SELECT code
              FROM referral_codes
              WHERE user_id = $1
                AND is_active = TRUE
              LIMIT 1
            `,
            [req.user.id],
          );

          if (existingResult.rows.length > 0) {
            codeResult = existingResult;
            saved = true;
            break;
          }
        }

        if (!saved) {
          throw new Error("REFERRAL_CODE_CREATION_FAILED");
        }

        if (codeResult.rows.length === 0) {
          codeResult = await client.query<{
            code: string;
          }>(
            `
              SELECT code
              FROM referral_codes
              WHERE user_id = $1
                AND is_active = TRUE
              LIMIT 1
            `,
            [req.user.id],
          );
        }
      }

      const summaryResult = await client.query<{
        total: number;
        pending: number;
        qualified: number;
      }>(
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE status = 'pending'
            )::int AS pending,
            COUNT(*) FILTER (
              WHERE status = 'qualified'
            )::int AS qualified
          FROM referrals
          WHERE inviter_user_id = $1
        `,
        [req.user.id],
      );

      const rewardsResult = await client.query<{
        credited: string;
        pending: string;
      }>(
        `
          SELECT
            COALESCE(
              SUM(reward_amount) FILTER (
                WHERE status = 'credited'
              ),
              0
            )::text AS credited,
            COALESCE(
              SUM(reward_amount) FILTER (
                WHERE status IN ('pending', 'approved')
              ),
              0
            )::text AS pending
          FROM referral_rewards
          WHERE inviter_user_id = $1
        `,
        [req.user.id],
      );

      await client.query("COMMIT");

      res.status(200).json({
        referralCode: codeResult.rows[0]?.code ?? null,
        summary: summaryResult.rows[0] ?? {
          total: 0,
          pending: 0,
          qualified: 0,
        },
        rewards: rewardsResult.rows[0] ?? {
          credited: "0",
          pending: "0",
        },
        rules: {
          rewardAmountETB: 10,
          maxQualifiedReferralsPerMonth: 5,
          rewardRequiresVerifiedFirstPayment: true,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Referral summary error:", error);

      res.status(500).json({
        error: "REFERRAL_SUMMARY_FAILED",
        message: "The referral summary could not be loaded.",
      });
    } finally {
      client.release();
    }
  },
);

/**
 * POST /referrals/apply
 *
 * Body: { "code": "REFERRALCODE" }
 *
 * Records the inviter for the authenticated user.
 * It does not credit money or mark the referral as qualified.
 */
router.post(
  "/apply",
  requireTelegramAuth,
  async (req, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    if (!pool) {
      sendDatabaseUnavailable(res);
      return;
    }

    const rawCode =
      typeof req.body?.code === "string"
        ? req.body.code.trim()
        : "";

    if (
      rawCode.length < 6 ||
      rawCode.length > 32 ||
      !/^[A-Za-z0-9_-]+$/.test(rawCode)
    ) {
      res.status(400).json({
        error: "INVALID_REFERRAL_CODE",
        message: "Please provide a valid referral code.",
      });
      return;
    }

    const code = rawCode.toUpperCase();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const codeResult = await client.query<{
        user_id: string;
        code: string;
      }>(
        `
          SELECT user_id, code
          FROM referral_codes
          WHERE UPPER(code) = $1
            AND is_active = TRUE
          FOR SHARE
        `,
        [code],
      );

      if (codeResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          error: "REFERRAL_CODE_NOT_FOUND",
          message: "This referral code is invalid or inactive.",
        });
        return;
      }

      const inviterUserId = codeResult.rows[0].user_id;

      if (inviterUserId === req.user.id) {
        await client.query("ROLLBACK");

        res.status(400).json({
          error: "SELF_REFERRAL_NOT_ALLOWED",
          message: "You cannot use your own referral code.",
        });
        return;
      }

      const existingResult = await client.query<{
        id: string;
        status: string;
      }>(
        `
          SELECT id, status
          FROM referrals
          WHERE invitee_user_id = $1
          LIMIT 1
        `,
        [req.user.id],
      );

      if (existingResult.rows.length > 0) {
        await client.query("ROLLBACK");

        res.status(409).json({
          error: "REFERRAL_ALREADY_RECORDED",
          message: "A referral has already been recorded for this account.",
        });
        return;
      }

      const insertResult = await client.query<{
        id: string;
        status: string;
      }>(
        `
          INSERT INTO referrals (
            inviter_user_id,
            invitee_user_id,
            referral_code,
            status
          )
          VALUES ($1, $2, $3, 'pending')
          ON CONFLICT (invitee_user_id) DO NOTHING
          RETURNING id, status
        `,
        [
          inviterUserId,
          req.user.id,
          codeResult.rows[0].code,
        ],
      );

      if (insertResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(409).json({
          error: "REFERRAL_ALREADY_RECORDED",
          message: "A referral has already been recorded for this account.",
        });
        return;
      }

      await client.query(
        `
          INSERT INTO referral_audit_logs (
            referral_id,
            actor_user_id,
            action,
            details
          )
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          insertResult.rows[0].id,
          req.user.id,
          "referral_applied",
          JSON.stringify({
            inviterUserId,
            referralCode: codeResult.rows[0].code,
          }),
        ],
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        referralId: insertResult.rows[0].id,
        status: "pending",
        message:
          "Referral recorded. The reward is not available until the eligibility checks are completed.",
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Apply referral code error:", error);

      res.status(500).json({
        error: "REFERRAL_APPLICATION_FAILED",
        message: "The referral code could not be applied.",
      });
    } finally {
      client.release();
    }
  },
);

export default router;
