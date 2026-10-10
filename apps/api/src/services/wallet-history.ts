
import { pool } from "../db.js";

function getDatabase() {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  return pool;
}

export async function getMyWalletHistory(userId: string) {
  if (!userId?.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  const db = getDatabase();

  const [transactions, deposits, withdrawals] =
    await Promise.all([
      db.query(
        `SELECT id, type, amount, balance_after, reference,
                description, created_at
         FROM wallet_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
      ),

      db.query(
        `SELECT id, amount, transaction_reference, sender_name,
                status, rejection_reason, verified_at,
                created_at, updated_at
         FROM wallet_deposits
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
      ),

      db.query(
        `SELECT id, amount, telebirr_number, status,
                rejection_reason, payment_reference,
                processed_at, created_at, updated_at
         FROM withdrawals
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
      ),
    ]);

  return {
    transactions: transactions.rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      reference: row.reference,
      description: row.description,
      createdAt: new Date(row.created_at).toISOString(),
    })),

    deposits: deposits.rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      transactionReference: row.transaction_reference,
      senderName: row.sender_name ?? null,
      status: row.status,
      rejectionReason: row.rejection_reason ?? null,
      verifiedAt: row.verified_at
        ? new Date(row.verified_at).toISOString()
        : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),

    withdrawals: withdrawals.rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      telebirrNumber: row.telebirr_number,
      status: row.status,
      rejectionReason: row.rejection_reason ?? null,
      paymentReference: row.payment_reference ?? null,
      processedAt: row.processed_at
        ? new Date(row.processed_at).toISOString()
        : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  };
}
