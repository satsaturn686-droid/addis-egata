
import type { PoolClient } from "pg";
import { pool } from "../db.js";

const PRIZES = {
  1: 500,
  2: 300,
  3: 200,
} as const;

const TOTAL_BUDGET = 1000;
const LEGACY_TOTAL_BUDGET = 2500;

function validateContestMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("INVALID_CONTEST_MONTH");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    year < 2020 ||
    year > 2200
  ) {
    throw new Error("INVALID_CONTEST_MONTH");
  }

  return `${month}-01`;
}

async function assertContestMonthFinished(
  client: PoolClient,
  contestMonth: string,
): Promise<void> {
  const result = await client.query<{ finished: boolean }>(
    `
      SELECT
        (
          ($1::date + INTERVAL '1 month')::date
          <= (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date
        ) AS finished
    `,
    [contestMonth],
  );

  if (result.rows[0]?.finished !== true) {
    throw new Error("CONTEST_MONTH_NOT_FINISHED");
  }
}

async function writeAuditLog(
  client: PoolClient,
  actorUserId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `
      INSERT INTO referral_audit_logs (
        actor_user_id,
        action,
        details
      )
      VALUES ($1, $2, $3::jsonb)
    `,
    [actorUserId, action, JSON.stringify(details)],
  );
}

function isValidStoredBudget(value: string | number): boolean {
  const budget = Number(value);

  return budget === TOTAL_BUDGET || budget === LEGACY_TOTAL_BUDGET;
}

export async function createMonthlyReferralContest(
  month: string,
  adminUserId: string,
): Promise<{
  contestId: string;
  contestMonth: string;
  winnersCreated: number;
  status: "draft";
}> {
  if (!pool) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const contestMonth = validateContestMonth(month);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await assertContestMonthFinished(client, contestMonth);

    const contestResult = await client.query<{ id: string }>(
      `
        INSERT INTO referral_monthly_contests (
          contest_month,
          status,
          total_budget,
          created_by
        )
        VALUES ($1::date, 'draft', $2, $3)
        ON CONFLICT (contest_month) DO NOTHING
        RETURNING id
      `,
      [contestMonth, TOTAL_BUDGET, adminUserId],
    );

    const contest = contestResult.rows[0];

    if (!contest) {
      throw new Error("MONTHLY_CONTEST_ALREADY_EXISTS");
    }

    const winnersResult = await client.query<{
      user_id: string;
      rank: number;
      prize_amount: string;
    }>(
      `
        WITH referral_counts AS (
          SELECT
            inviter_user_id AS user_id,
            COUNT(*)::int AS qualified_referrals,
            MIN(qualified_at) AS first_qualified_at
          FROM referrals
          WHERE status = 'qualified'
            AND qualified_at >= (
              $1::date::timestamp
              AT TIME ZONE 'Africa/Addis_Ababa'
            )
            AND qualified_at < (
              ($1::date + INTERVAL '1 month')::timestamp
              AT TIME ZONE 'Africa/Addis_Ababa'
            )
          GROUP BY inviter_user_id
        ),
        ranked_users AS (
          SELECT
            user_id,
            qualified_referrals,
            ROW_NUMBER() OVER (
              ORDER BY
                qualified_referrals DESC,
                first_qualified_at ASC,
                user_id ASC
            ) AS rank
          FROM referral_counts
        )
        INSERT INTO referral_monthly_winners (
          contest_id,
          user_id,
          rank,
          prize_amount,
          status
        )
        SELECT
          $2,
          user_id,
          rank,
          CASE rank
            WHEN 1 THEN 500.00
            WHEN 2 THEN 300.00
            WHEN 3 THEN 200.00
          END,
          'pending'
        FROM ranked_users
        WHERE rank <= 3
        RETURNING user_id, rank, prize_amount
      `,
      [contestMonth, contest.id],
    );

    await writeAuditLog(
      client,
      adminUserId,
      "monthly_referral_contest_created",
      {
        contestId: contest.id,
        contestMonth,
        winnersCreated: winnersResult.rowCount ?? 0,
        totalBudgetETB: TOTAL_BUDGET,
        winners: winnersResult.rows,
      },
    );

    await client.query("COMMIT");

    return {
      contestId: contest.id,
      contestMonth,
      winnersCreated: winnersResult.rowCount ?? 0,
      status: "draft",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function approveMonthlyReferralContest(
  contestId: string,
  adminUserId: string,
): Promise<{
  contestId: string;
  status: "approved";
  winnersApproved: number;
}> {
  if (!pool) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const contestResult = await client.query<{
      id: string;
      contest_month: string;
      status: string;
      total_budget: string | number;
    }>(
      `
        SELECT
          id,
          contest_month,
          status,
          total_budget
        FROM referral_monthly_contests
        WHERE id = $1
        FOR UPDATE
      `,
      [contestId],
    );

    const contest = contestResult.rows[0];

    if (!contest) {
      throw new Error("MONTHLY_CONTEST_NOT_FOUND");
    }

    if (contest.status !== "draft" && contest.status !== "closed") {
      throw new Error("MONTHLY_CONTEST_NOT_APPROVABLE");
    }

    await assertContestMonthFinished(
      client,
      String(contest.contest_month).slice(0, 10),
    );

    if (!isValidStoredBudget(contest.total_budget)) {
      throw new Error("INVALID_MONTHLY_CONTEST_BUDGET");
    }

    const winnersResult = await client.query<{
      id: string;
      rank: number;
      prize_amount: string | number;
      status: string;
    }>(
      `
        SELECT id, rank, prize_amount, status
        FROM referral_monthly_winners
        WHERE contest_id = $1
        ORDER BY rank
        FOR UPDATE
      `,
      [contestId],
    );

    const winners = winnersResult.rows;

    if (winners.length < 1 || winners.length > 3) {
      throw new Error("MONTHLY_CONTEST_HAS_INVALID_WINNERS");
    }

    let totalPrizes = 0;

    for (const winner of winners) {
      const expectedPrize = PRIZES[winner.rank as keyof typeof PRIZES];

      if (
        !expectedPrize ||
        Number(winner.prize_amount) !== expectedPrize ||
        winner.status !== "pending"
      ) {
        throw new Error("MONTHLY_CONTEST_HAS_INVALID_WINNERS");
      }

      totalPrizes += expectedPrize;
    }

    if (totalPrizes > TOTAL_BUDGET) {
      throw new Error("INVALID_MONTHLY_CONTEST_BUDGET");
    }

    await client.query(
      `
        UPDATE referral_monthly_winners
        SET
          status = 'approved',
          approved_by = $2,
          approved_at = NOW()
        WHERE contest_id = $1
          AND status = 'pending'
      `,
      [contestId, adminUserId],
    );

    await client.query(
      `
        UPDATE referral_monthly_contests
        SET
          status = 'approved',
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [contestId, adminUserId],
    );

    await writeAuditLog(
      client,
      adminUserId,
      "monthly_referral_contest_approved",
      {
        contestId,
        winnersApproved: winners.length,
        totalPrizesETB: totalPrizes,
        totalBudgetETB: Number(contest.total_budget),
      },
    );

    await client.query("COMMIT");

    return {
      contestId,
      status: "approved",
      winnersApproved: winners.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function payMonthlyReferralWinner(
  winnerId: string,
  adminUserId: string,
): Promise<{
  winnerId: string;
  userId: string;
  amount: number;
  balance: number;
  status: "paid";
}> {
  if (!pool) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const winnerResult = await client.query<{
      id: string;
      contest_id: string;
      user_id: string;
      rank: number;
      prize_amount: string | number;
      status: string;
      wallet_transaction_id: string | null;
    }>(
      `
        SELECT
          id,
          contest_id,
          user_id,
          rank,
          prize_amount,
          status,
          wallet_transaction_id
        FROM referral_monthly_winners
        WHERE id = $1
        FOR UPDATE
      `,
      [winnerId],
    );

    const winner = winnerResult.rows[0];

    if (!winner) {
      throw new Error("MONTHLY_WINNER_NOT_FOUND");
    }

    if (winner.status === "paid") {
      throw new Error("MONTHLY_WINNER_ALREADY_PAID");
    }

    if (winner.status !== "approved") {
      throw new Error("MONTHLY_WINNER_NOT_APPROVED");
    }

    const contestResult = await client.query<{
      contest_month: string;
      status: string;
      total_budget: string | number;
    }>(
      `
        SELECT contest_month, status, total_budget
        FROM referral_monthly_contests
        WHERE id = $1
        FOR UPDATE
      `,
      [winner.contest_id],
    );

    const contest = contestResult.rows[0];

    if (!contest || contest.status !== "approved") {
      throw new Error("MONTHLY_CONTEST_NOT_APPROVED");
    }

    await assertContestMonthFinished(
      client,
      String(contest.contest_month).slice(0, 10),
    );

    if (!isValidStoredBudget(contest.total_budget)) {
      throw new Error("INVALID_MONTHLY_CONTEST_BUDGET");
    }

    const amount = PRIZES[winner.rank as keyof typeof PRIZES];

    if (!amount || Number(winner.prize_amount) !== amount) {
      throw new Error("INVALID_MONTHLY_WINNER_PRIZE");
    }

    // Serialize monthly contest payouts and ensure that the total
    // paid for this contest never exceeds the 1,000 ETB prize pool.
    await client.query(
      "SELECT pg_advisory_xact_lock($1, $2)",
      [731904, 1000],
    );

    const paidResult = await client.query<{
      paid_total: string | number | null;
    }>(
      `
        SELECT COALESCE(SUM(w.prize_amount), 0) AS paid_total
        FROM referral_monthly_winners w
        WHERE w.contest_id = $1
          AND w.status = 'paid'
      `,
      [winner.contest_id],
    );

    const paidTotal = Number(paidResult.rows[0]?.paid_total ?? 0);

    if (paidTotal + amount > TOTAL_BUDGET) {
      throw new Error("MONTHLY_CONTEST_BUDGET_EXCEEDED");
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
      [winner.user_id],
    );

    const walletId = walletResult.rows[0].id;

    const lockedWalletResult = await client.query<{
      balance: string | number;
    }>(
      `
        SELECT balance
        FROM wallets
        WHERE id = $1
        FOR UPDATE
      `,
      [walletId],
    );

    const currentBalance = Number(lockedWalletResult.rows[0].balance);
    const newBalance = currentBalance + amount;

    const transactionResult = await client.query<{ id: string }>(
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
        winner.user_id,
        amount,
        newBalance,
        "monthly-referral-prize:" + winner.id,
        `ADDIS ዕጣ monthly referral contest rank ${winner.rank}`,
      ],
    );

    if (transactionResult.rowCount !== 1) {
      throw new Error("MONTHLY_WINNER_TRANSACTION_EXISTS");
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
        UPDATE referral_monthly_winners
        SET
          status = 'paid',
          wallet_transaction_id = $1,
          paid_at = NOW()
        WHERE id = $2
          AND status = 'approved'
      `,
      [transactionResult.rows[0].id, winner.id],
    );

    const unpaidResult = await client.query(
      `
        SELECT id
        FROM referral_monthly_winners
        WHERE contest_id = $1
          AND status = 'approved'
      `,
      [winner.contest_id],
    );

    if (unpaidResult.rowCount === 0) {
      await client.query(
        `
          UPDATE referral_monthly_contests
          SET status = 'paid', updated_at = NOW()
          WHERE id = $1
            AND status = 'approved'
        `,
        [winner.contest_id],
      );
    }

    await writeAuditLog(
      client,
      adminUserId,
      "monthly_referral_winner_paid",
      {
        contestId: winner.contest_id,
        winnerId: winner.id,
        userId: winner.user_id,
        rank: winner.rank,
        amountETB: amount,
        monthlyContestBudgetETB: TOTAL_BUDGET,
        paidBeforeThisTransactionETB: paidTotal,
        walletTransactionId: transactionResult.rows[0].id,
      },
    );

    await client.query("COMMIT");

    return {
      winnerId: winner.id,
      userId: winner.user_id,
      amount,
      balance: newBalance,
      status: "paid",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
