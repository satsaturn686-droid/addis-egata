import { pool } from "../db.js";

export type WithdrawalStatus =
  | "pending"
  | "paid"
  | "rejected";

export type WalletWithdrawal = {
  id: string;
  userId: string;
  amount: number;
  telebirrNumber: string;
  status: WithdrawalStatus;
  rejectionReason: string | null;
  processedBy: string | null;
  processedAt: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminWalletWithdrawal =
  WalletWithdrawal & {
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };

function ensurePool() {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  return pool;
}

function mapWithdrawal(
  row: any,
): WalletWithdrawal {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    telebirrNumber:
      row.telebirr_number,
    status: row.status,
    rejectionReason:
      row.rejection_reason ?? null,
    processedBy:
      row.processed_by ?? null,
    processedAt:
      row.processed_at
        ? new Date(
            row.processed_at,
          ).toISOString()
        : null,
    paymentReference:
      row.payment_reference ?? null,
    createdAt:
      new Date(
        row.created_at,
      ).toISOString(),
    updatedAt:
      new Date(
        row.updated_at,
      ).toISOString(),
  };
}

export async function createWalletWithdrawal(
  userId: string,
  amount: number,
  telebirrNumber: string,
): Promise<WalletWithdrawal> {
  if (!userId) {
    throw new Error(
      "INVALID_USER_ID",
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "INVALID_WITHDRAWAL_AMOUNT",
    );
  }

  if (amount > 1000000) {
    throw new Error(
      "WITHDRAWAL_AMOUNT_TOO_LARGE",
    );
  }

  const normalizedNumber =
    telebirrNumber.trim();

  if (!normalizedNumber) {
    throw new Error(
      "TELEBIRR_NUMBER_REQUIRED",
    );
  }

  if (
    normalizedNumber.length > 100
  ) {
    throw new Error(
      "TELEBIRR_NUMBER_TOO_LONG",
    );
  }

  const db = ensurePool();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const walletResult =
      await client.query<{
        id: string;
        balance: string;
      }>(
        `
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
        `,
        [userId],
      );

    if (
      walletResult.rows.length === 0
    ) {
      throw new Error(
        "WALLET_NOT_FOUND",
      );
    }

    const balance =
      Number(
        walletResult.rows[0].balance,
      );

    if (
      balance < amount
    ) {
      throw new Error(
        "INSUFFICIENT_WALLET_BALANCE",
      );
    }

    const newBalance =
      balance - amount;

    const withdrawalResult =
      await client.query(
        `
          INSERT INTO withdrawals (
            user_id,
            amount,
            telebirr_number,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            'pending'
          )
          RETURNING *
        `,
        [
          userId,
          amount,
          normalizedNumber,
        ],
      );

    const withdrawal =
      withdrawalResult.rows[0];

    await client.query(
      `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = NOW()
        WHERE user_id = $2
      `,
      [
        newBalance,
        userId,
      ],
    );

    await client.query(
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
          'withdrawal',
          $2,
          $3,
          $4,
          $5
        )
      `,
      [
        userId,
        -amount,
        newBalance,
        `withdrawal:${withdrawal.id}`,
        "Wallet withdrawal request",
      ],
    );

    await client.query("COMMIT");

    return mapWithdrawal(
      withdrawal,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPendingWalletWithdrawals(): Promise<
  AdminWalletWithdrawal[]
> {
  const db = ensurePool();

  const result =
    await db.query(
      `
        SELECT
          w.id,
          w.user_id,
          w.amount,
          w.telebirr_number,
          w.status,
          w.rejection_reason,
          w.processed_by,
          w.processed_at,
          w.payment_reference,
          w.created_at,
          w.updated_at,
          u.telegram_id,
          u.username,
          u.first_name,
          u.last_name
        FROM withdrawals w
        INNER JOIN users u
          ON u.id = w.user_id
        WHERE w.status = 'pending'
        ORDER BY w.created_at ASC
      `,
    );

  return result.rows.map(
    mapWithdrawal,
  ) as AdminWalletWithdrawal[];
}

export async function getMyPendingWalletWithdrawals(
  userId: string,
): Promise<WalletWithdrawal[]> {
  if (!userId) {
    throw new Error(
      "INVALID_USER_ID",
    );
  }

  const db = ensurePool();

  const result =
    await db.query(
      `
        SELECT *
        FROM withdrawals
        WHERE user_id = $1
          AND status = 'pending'
        ORDER BY created_at DESC
      `,
      [userId],
    );

  return result.rows.map(
    mapWithdrawal,
  );
}

export async function approveWalletWithdrawal(
  withdrawalId: string,
  adminUserId: string,
  paymentReference: string,
): Promise<WalletWithdrawal> {
  if (!withdrawalId) {
    throw new Error(
      "INVALID_WITHDRAWAL_ID",
    );
  }

  if (!adminUserId) {
    throw new Error(
      "INVALID_ADMIN_USER_ID",
    );
  }

  const reference =
    paymentReference.trim();

  if (!reference) {
    throw new Error(
      "PAYMENT_REFERENCE_REQUIRED",
    );
  }

  if (reference.length > 200) {
    throw new Error(
      "PAYMENT_REFERENCE_TOO_LONG",
    );
  }

  const db = ensurePool();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result =
      await client.query(
        `
          SELECT *
          FROM withdrawals
          WHERE id = $1
          FOR UPDATE
        `,
        [withdrawalId],
      );

    if (
      result.rows.length === 0
    ) {
      throw new Error(
        "WITHDRAWAL_NOT_FOUND",
      );
    }

    if (
      result.rows[0].status !==
      "pending"
    ) {
      throw new Error(
        "WITHDRAWAL_ALREADY_PROCESSED",
      );
    }

    const updated =
      await client.query(
        `
          UPDATE withdrawals
          SET
            status = 'paid',
            processed_by = $1,
            processed_at = NOW(),
            payment_reference = $2,
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `,
        [
          adminUserId,
          reference,
          withdrawalId,
        ],
      );

    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          'WALLET_WITHDRAWAL_PAID',
          'withdrawal',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        withdrawalId,
        JSON.stringify({
          amount:
            Number(
              updated.rows[0].amount,
            ),
          paymentReference:
            reference,
        }),
      ],
    );

    await client.query("COMMIT");

    return mapWithdrawal(
      updated.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectWalletWithdrawal(
  withdrawalId: string,
  adminUserId: string,
  rejectionReason: string,
): Promise<WalletWithdrawal> {
  if (!withdrawalId) {
    throw new Error(
      "INVALID_WITHDRAWAL_ID",
    );
  }

  if (!adminUserId) {
    throw new Error(
      "INVALID_ADMIN_USER_ID",
    );
  }

  const reason =
    rejectionReason.trim();

  if (!reason) {
    throw new Error(
      "REJECTION_REASON_REQUIRED",
    );
  }

  if (reason.length > 500) {
    throw new Error(
      "REJECTION_REASON_TOO_LONG",
    );
  }

  const db = ensurePool();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const withdrawalResult =
      await client.query(
        `
          SELECT *
          FROM withdrawals
          WHERE id = $1
          FOR UPDATE
        `,
        [withdrawalId],
      );

    if (
      withdrawalResult.rows.length === 0
    ) {
      throw new Error(
        "WITHDRAWAL_NOT_FOUND",
      );
    }

    const withdrawal =
      withdrawalResult.rows[0];

    if (
      withdrawal.status !==
      "pending"
    ) {
      throw new Error(
        "WITHDRAWAL_ALREADY_PROCESSED",
      );
    }

    const walletResult =
      await client.query<{
        balance: string;
      }>(
        `
          SELECT balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
        `,
        [withdrawal.user_id],
      );

    if (
      walletResult.rows.length === 0
    ) {
      throw new Error(
        "WALLET_NOT_FOUND",
      );
    }

    const currentBalance =
      Number(
        walletResult.rows[0].balance,
      );

    const refundAmount =
      Number(
        withdrawal.amount,
      );

    const newBalance =
      currentBalance +
      refundAmount;

    await client.query(
      `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = NOW()
        WHERE user_id = $2
      `,
      [
        newBalance,
        withdrawal.user_id,
      ],
    );

    await client.query(
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
          'refund',
          $2,
          $3,
          $4,
          $5
        )
      `,
      [
        withdrawal.user_id,
        refundAmount,
        newBalance,
        `withdrawal-refund:${withdrawalId}`,
        "Rejected withdrawal refund",
      ],
    );

    const updated =
      await client.query(
        `
          UPDATE withdrawals
          SET
            status = 'rejected',
            rejection_reason = $1,
            processed_by = $2,
            processed_at = NOW(),
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `,
        [
          reason,
          adminUserId,
          withdrawalId,
        ],
      );

    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (
          $1,
          'WALLET_WITHDRAWAL_REJECTED',
          'withdrawal',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        withdrawalId,
        JSON.stringify({
          amount:
            refundAmount,
          rejectionReason:
            reason,
        }),
      ],
    );

    await client.query("COMMIT");

    return mapWithdrawal(
      updated.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
