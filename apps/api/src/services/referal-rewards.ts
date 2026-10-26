
import { pool } from "../db.js";

export async function approveAndCreditReferralReward(
  rewardId: string,
  adminUserId: string,
): Promise<{
  rewardId: string;
  userId: string;
  amount: number;
  balance: number;
  status: "credited";
}> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!rewardId.trim()) {
    throw new Error("INVALID_REFERRAL_REWARD_ID");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const rewardResult = await client.query<{
      id: string;
      referral_id: string;
      inviter_user_id: string;
      reward_amount: string | number;
      status: string;
      wallet_transaction_id: string | null;
    }>(
      `
        SELECT
          id,
          referral_id,
          inviter_user_id,
          reward_amount,
          status,
          wallet_transaction_id
        FROM referral_rewards
        WHERE id = $1
        FOR UPDATE
      `,
      [rewardId],
    );

    const reward = rewardResult.rows[0];

    if (!reward) {
      throw new Error("REFERRAL_REWARD_NOT_FOUND");
    }

    if (reward.status === "credited") {
      throw new Error("REFERRAL_REWARD_ALREADY_CREDITED");
    }

    if (reward.status !== "pending" && reward.status !== "approved") {
      throw new Error("REFERRAL_REWARD_NOT_ELIGIBLE");
    }

    const referralResult = await client.query<{
      status: string;
    }>(
      `
        SELECT status
        FROM referrals
        WHERE id = $1
        FOR UPDATE
      `,
      [reward.referral_id],
    );

    if (referralResult.rows[0]?.status !== "qualified") {
      throw new Error("REFERRAL_NOT_QUALIFIED");
    }

    const amount = Number(reward.reward_amount);

    if (!Number.isFinite(amount) || amount !== 10) {
      throw new Error("INVALID_REFERRAL_REWARD_AMOUNT");
    }

    const walletResult = await client.query<{
      id: string;
      balance: string | number;
    }>(
      `
        INSERT INTO wallets (user_id, balance)
        VALUES ($1, 0)
        ON CONFLICT (user_id)
        DO UPDATE SET updated_at = wallets.updated_at
        RETURNING id, balance
      `,
      [reward.inviter_user_id],
    );

    const walletId = walletResult.rows[0].id;

    const lockedWalletResult = await client.query<{
      id: string;
      balance: string | number;
    }>(
      `
        SELECT id, balance
        FROM wallets
        WHERE id = $1
        FOR UPDATE
      `,
      [walletId],
    );

    const currentBalance = Number(
      lockedWalletResult.rows[0].balance,
    );

    const newBalance = currentBalance + amount;

    const transactionResult = await client.query<{
      id: string;
    }>(
      `
        INSERT INTO wallet_transactions (
          user_id,
          type,
          amount,
          balance_after,
          reference,
          description
        )
        VALUES (
          $1,
          'payout_credit',
          $2,
          $3,
          $4,
          $5
        )
        ON CONFLICT (reference) DO NOTHING
        RETURNING id
      `,
      [
        reward.inviter_user_id,
        amount,
        newBalance,
        `referral-reward:${reward.id}`,
        "ADDIS ዕጣ referral bonus",
      ],
    );

    if (transactionResult.rows.length !== 1) {
      throw new Error("REFERRAL_REWARD_TRANSACTION_EXISTS");
    }

    await client.query(
      `
        UPDATE wallets
        SET balance = $1, updated_at = NOW()
        WHERE id = $2
      `,
      [newBalance, walletId],
    );

    await client.query(
      `
        UPDATE referral_rewards
        SET
          status = 'credited',
          wallet_transaction_id = $1,
          approved_by = $2,
          approved_at = COALESCE(approved_at, NOW()),
          credited_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
      `,
      [
        transactionResult.rows[0].id,
        adminUserId,
        reward.id,
      ],
    );

    await client.query(
      `
        INSERT INTO referral_audit_logs (
          referral_id,
          reward_id,
          actor_user_id,
          action,
          details
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        reward.referral_id,
        reward.id,
        adminUserId,
        "referral_reward_credited",
        JSON.stringify({
          amountETB: amount,
          userId: reward.inviter_user_id,
          walletTransactionId: transactionResult.rows[0].id,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      rewardId: reward.id,
      userId: reward.inviter_user_id,
      amount,
      balance: newBalance,
      status: "credited",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
