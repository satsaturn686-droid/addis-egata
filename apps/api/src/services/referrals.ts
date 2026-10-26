
import type { PoolClient } from "pg";

const REFERRAL_REWARD_ETB = "10.00";
const MAX_QUALIFIED_REFERRALS_PER_MONTH = 5;

export async function qualifyReferralAfterVerifiedDeposit(
  client: PoolClient,
  inviteeUserId: string,
  verifiedDepositId: string,
  reviewerUserId: string,
): Promise<{
  qualified: boolean;
  reason: string;
  referralId?: string;
}> {
  await client.query("SAVEPOINT qualify_referral");

  try {
    const referralResult = await client.query<{
      id: string;
      inviter_user_id: string;
      status: string;
    }>(
      `
        SELECT id, inviter_user_id, status
        FROM referrals
        WHERE invitee_user_id = $1
        FOR UPDATE
      `,
      [inviteeUserId],
    );

    const referral = referralResult.rows[0];

    if (!referral) {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "NO_REFERRAL",
      };
    }

    if (referral.status !== "pending") {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "REFERRAL_ALREADY_PROCESSED",
        referralId: referral.id,
      };
    }

    const depositResult = await client.query<{
      id: string;
      user_id: string;
      status: string;
    }>(
      `
        SELECT id, user_id, status
        FROM wallet_deposits
        WHERE id = $1
        FOR UPDATE
      `,
      [verifiedDepositId],
    );

    const deposit = depositResult.rows[0];

    if (
      !deposit ||
      deposit.user_id !== inviteeUserId ||
      deposit.status !== "approved"
    ) {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "DEPOSIT_NOT_VERIFIED",
        referralId: referral.id,
      };
    }

    const firstDepositResult = await client.query(
      `
        SELECT id
        FROM wallet_deposits
        WHERE user_id = $1
          AND status = 'approved'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
      [inviteeUserId],
    );

    if (
      firstDepositResult.rows[0]?.id !== verifiedDepositId
    ) {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "NOT_FIRST_VERIFIED_DEPOSIT",
        referralId: referral.id,
      };
    }

    const monthLimitResult = await client.query<{
      count: number;
    }>(
      `
        SELECT COUNT(*)::int AS count
        FROM referrals
        WHERE inviter_user_id = $1
          AND status = 'qualified'
          AND qualified_at >=
            date_trunc(
              'month',
              NOW() AT TIME ZONE 'Africa/Addis_Ababa'
            ) AT TIME ZONE 'Africa/Addis_Ababa'
          AND qualified_at <
            (
              date_trunc(
                'month',
                NOW() AT TIME ZONE 'Africa/Addis_Ababa'
              ) + INTERVAL '1 month'
            ) AT TIME ZONE 'Africa/Addis_Ababa'
        FOR UPDATE
      `,
      [referral.inviter_user_id],
    );

    if (
      (monthLimitResult.rows[0]?.count ?? 0) >=
      MAX_QUALIFIED_REFERRALS_PER_MONTH
    ) {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "MONTHLY_REFERRAL_LIMIT_REACHED",
        referralId: referral.id,
      };
    }

    const updateResult = await client.query(
      `
        UPDATE referrals
        SET
          status = 'qualified',
          first_verified_deposit_id = $2,
          qualified_at = NOW(),
          reviewed_by = $3,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id
      `,
      [
        referral.id,
        verifiedDepositId,
        reviewerUserId,
      ],
    );

    if (updateResult.rowCount !== 1) {
      await client.query("RELEASE SAVEPOINT qualify_referral");
      return {
        qualified: false,
        reason: "REFERRAL_ALREADY_PROCESSED",
        referralId: referral.id,
      };
    }

    await client.query(
      `
        INSERT INTO referral_rewards (
          referral_id,
          inviter_user_id,
          reward_amount,
          status
        )
        VALUES ($1, $2, $3, 'pending')
        ON CONFLICT (referral_id) DO NOTHING
      `,
      [
        referral.id,
        referral.inviter_user_id,
        REFERRAL_REWARD_ETB,
      ],
    );

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
        referral.id,
        reviewerUserId,
        "referral_qualified",
        JSON.stringify({
          inviteeUserId,
          verifiedDepositId,
          rewardAmountETB: REFERRAL_REWARD_ETB,
        }),
      ],
    );

    await client.query("RELEASE SAVEPOINT qualify_referral");

    return {
      qualified: true,
      reason: "QUALIFIED_PENDING_REWARD_APPROVAL",
      referralId: referral.id,
    };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT qualify_referral");
    await client.query("RELEASE SAVEPOINT qualify_referral");
    throw error;
  }
}
