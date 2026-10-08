import { pool } from "../db.js";

type Wallet = {
  id: string;
  userId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

type WalletDeposit = {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: "telebirr";
  transactionReference: string;
  senderName: string | null;
  status: "pending" | "approved" | "rejected";
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type PendingWalletDeposit = WalletDeposit & {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

function mapWallet(row: {
  id: string;
  user_id: string;
  balance: string | number;
  created_at: string;
  updated_at: string;
}): Wallet {
  return {
    id: row.id,
    userId: row.user_id,
    balance: Number(row.balance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeposit(row: {
  id: string;
  user_id: string;
  amount: string | number;
  payment_method: "telebirr";
  transaction_reference: string;
  sender_name: string | null;
  status: "pending" | "approved" | "rejected";
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}): WalletDeposit {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    transactionReference: row.transaction_reference,
    senderName: row.sender_name,
    status: row.status,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureWallet(
  client: import("pg").PoolClient,
  userId: string,
): Promise<Wallet> {
  const result = await client.query<{
    id: string;
    user_id: string;
    balance: string | number;
    created_at: string;
    updated_at: string;
  }>(
    `
      INSERT INTO wallets (
        user_id,
        balance
      )
      VALUES (
        $1,
        0
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        updated_at = wallets.updated_at
      RETURNING
        id,
        user_id,
        balance,
        created_at,
        updated_at
    `,
    [userId],
  );

  return mapWallet(result.rows[0]);
}

export async function getWallet(
  userId: string,
): Promise<Wallet> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  const client = await pool.connect();

  try {
    return await ensureWallet(client, userId);
  } finally {
    client.release();
  }
}

export async function createWalletDeposit(
  userId: string,
  amount: number,
  transactionReference: string,
  senderName?: string,
): Promise<WalletDeposit> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error("INVALID_DEPOSIT_AMOUNT");
  }

  if (amount > 1000000) {
    throw new Error("DEPOSIT_AMOUNT_TOO_LARGE");
  }

  const reference =
    transactionReference.trim();

  if (!reference) {
    throw new Error(
      "INVALID_TRANSACTION_REFERENCE",
    );
  }

  if (reference.length > 200) {
    throw new Error(
      "TRANSACTION_REFERENCE_TOO_LONG",
    );
  }

  const normalizedSender =
    senderName?.trim() || null;

  if (
    normalizedSender &&
    normalizedSender.length > 200
  ) {
    throw new Error(
      "SENDER_NAME_TOO_LONG",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const duplicate =
      await client.query<{ id: string }>(
        `
          SELECT id
          FROM wallet_deposits
          WHERE transaction_reference = $1
          LIMIT 1
          FOR UPDATE
        `,
        [reference],
      );

    if (duplicate.rows.length > 0) {
      throw new Error(
        "DUPLICATE_TRANSACTION_REFERENCE",
      );
    }

    const result =
      await client.query<{
        id: string;
        user_id: string;
        amount: string | number;
        payment_method: "telebirr";
        transaction_reference: string;
        sender_name: string | null;
        status: "pending" | "approved" | "rejected";
        verified_by: string | null;
        verified_at: string | null;
        rejection_reason: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO wallet_deposits (
            user_id,
            amount,
            payment_method,
            transaction_reference,
            sender_name,
            status
          )
          VALUES (
            $1,
            $2,
            'telebirr',
            $3,
            $4,
            'pending'
          )
          RETURNING
            id,
            user_id,
            amount,
            payment_method,
            transaction_reference,
            sender_name,
            status,
            verified_by,
            verified_at,
            rejection_reason,
            created_at,
            updated_at
        `,
        [
          userId,
          amount,
          reference,
          normalizedSender,
        ],
      );

    await client.query("COMMIT");

    return mapDeposit(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPendingWalletDeposits(): Promise<
  PendingWalletDeposit[]
> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result =
    await pool.query<{
      id: string;
      user_id: string;
      amount: string | number;
      payment_method: "telebirr";
      transaction_reference: string;
      sender_name: string | null;
      status: "pending" | "approved" | "rejected";
      verified_by: string | null;
      verified_at: string | null;
      rejection_reason: string | null;
      created_at: string;
      updated_at: string;
      telegram_id: string;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(
      `
        SELECT
          wd.id,
          wd.user_id,
          wd.amount,
          wd.payment_method,
          wd.transaction_reference,
          wd.sender_name,
          wd.status,
          wd.verified_by,
          wd.verified_at,
          wd.rejection_reason,
          wd.created_at,
          wd.updated_at,
          u.telegram_id::text,
          u.username,
          u.first_name,
          u.last_name
        FROM wallet_deposits wd
        INNER JOIN users u
          ON u.id = wd.user_id
        WHERE wd.status = 'pending'
        ORDER BY wd.created_at ASC
      `,
    );

  return result.rows.map((row) => ({
    ...mapDeposit(row),
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
  }));
}

export async function approveWalletDeposit(
  depositId: string,
  adminUserId: string,
): Promise<WalletDeposit> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!depositId.trim()) {
    throw new Error("INVALID_DEPOSIT_ID");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const depositResult =
      await client.query<{
        id: string;
        user_id: string;
        amount: string | number;
        payment_method: "telebirr";
        transaction_reference: string;
        sender_name: string | null;
        status: "pending" | "approved" | "rejected";
        verified_by: string | null;
        verified_at: string | null;
        rejection_reason: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id,
            user_id,
            amount,
            payment_method,
            transaction_reference,
            sender_name,
            status,
            verified_by,
            verified_at,
            rejection_reason,
            created_at,
            updated_at
          FROM wallet_deposits
          WHERE id = $1
          FOR UPDATE
        `,
        [depositId],
      );

    if (depositResult.rows.length === 0) {
      throw new Error("DEPOSIT_NOT_FOUND");
    }

    const deposit = depositResult.rows[0];

    if (deposit.status !== "pending") {
      throw new Error("DEPOSIT_ALREADY_PROCESSED");
    }

    const wallet =
      await client.query<{
        id: string;
        balance: string | number;
      }>(
        `
          INSERT INTO wallets (
            user_id,
            balance
          )
          VALUES ($1, 0)
          ON CONFLICT (user_id)
          DO UPDATE SET
            updated_at = NOW()
          RETURNING id, balance
        `,
        [deposit.user_id],
      );

    const walletId = wallet.rows[0].id;

    const walletLocked =
      await client.query<{
        id: string;
        balance: string | number;
      }>(
        `
          SELECT
            id,
            balance
          FROM wallets
          WHERE id = $1
          FOR UPDATE
        `,
        [walletId],
      );

    const currentBalance =
      Number(walletLocked.rows[0].balance);

    const amount =
      Number(deposit.amount);

    const newBalance =
      currentBalance + amount;

    await client.query(
      `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [newBalance, walletId],
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
          'deposit',
          $2,
          $3,
          $4,
          $5
        )
      `,
      [
        deposit.user_id,
        amount,
        newBalance,
        `deposit:${deposit.id}`,
        "Telebirr wallet deposit",
      ],
    );

    const updated =
      await client.query<{
        id: string;
        user_id: string;
        amount: string | number;
        payment_method: "telebirr";
        transaction_reference: string;
        sender_name: string | null;
        status: "pending" | "approved" | "rejected";
        verified_by: string | null;
        verified_at: string | null;
        rejection_reason: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE wallet_deposits
          SET
            status = 'approved',
            verified_by = $1,
            verified_at = NOW(),
            updated_at = NOW()
          WHERE id = $2
          RETURNING
            id,
            user_id,
            amount,
            payment_method,
            transaction_reference,
            sender_name,
            status,
            verified_by,
            verified_at,
            rejection_reason,
            created_at,
            updated_at
        `,
        [adminUserId, depositId],
      );

    await client.query("COMMIT");

    return mapDeposit(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectWalletDeposit(
  depositId: string,
  adminUserId: string,
  rejectionReason: string,
): Promise<WalletDeposit> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!depositId.trim()) {
    throw new Error("INVALID_DEPOSIT_ID");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
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

  const result =
    await pool.query<{
      id: string;
      user_id: string;
      amount: string | number;
      payment_method: "telebirr";
      transaction_reference: string;
      sender_name: string | null;
      status: "pending" | "approved" | "rejected";
      verified_by: string | null;
      verified_at: string | null;
      rejection_reason: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        UPDATE wallet_deposits
        SET
          status = 'rejected',
          verified_by = $1,
          verified_at = NOW(),
          rejection_reason = $2,
          updated_at = NOW()
        WHERE id = $3
          AND status = 'pending'
        RETURNING
          id,
          user_id,
          amount,
          payment_method,
          transaction_reference,
          sender_name,
          status,
          verified_by,
          verified_at,
          rejection_reason,
          created_at,
          updated_at
      `,
      [
        adminUserId,
        reason,
        depositId,
      ],
    );

  if (result.rows.length === 0) {
    const exists =
      await pool.query(
        `
          SELECT status
          FROM wallet_deposits
          WHERE id = $1
        `,
        [depositId],
      );

    if (exists.rows.length === 0) {
      throw new Error("DEPOSIT_NOT_FOUND");
    }

    throw new Error(
      "DEPOSIT_ALREADY_PROCESSED",
    );
  }

  return mapDeposit(result.rows[0]);
}

export async function purchaseEntryWithWallet(
  entryId: string,
  userId: string,
): Promise<{
  entryId: string;
  balance: number;
}> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!entryId.trim()) {
    throw new Error("INVALID_ENTRY_ID");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entryResult =
      await client.query<{
        id: string;
        user_id: string;
        draw_id: string;
        status: string;
        reserved_until: string | null;
        entry_fee: string | number;
        draw_status: string;
      }>(
        `
          SELECT
            e.id,
            e.user_id,
            e.draw_id,
            e.status,
            e.reserved_until,
            d.entry_fee,
            d.status AS draw_status
          FROM entries e
          INNER JOIN draws d
            ON d.id = e.draw_id
          WHERE e.id = $1
          FOR UPDATE OF e, d
        `,
        [entryId],
      );

    if (entryResult.rows.length === 0) {
      throw new Error("ENTRY_NOT_FOUND");
    }

    const entry = entryResult.rows[0];

    if (entry.user_id !== userId) {
      throw new Error("ENTRY_NOT_OWNED");
    }

    if (entry.status !== "reserved") {
      throw new Error("ENTRY_NOT_PAYABLE");
    }

    if (entry.draw_status !== "open") {
      throw new Error("DRAW_NOT_PAYABLE");
    }

    if (
      entry.reserved_until &&
      new Date(entry.reserved_until).getTime() <=
        Date.now()
    ) {
      await client.query(
        `
          UPDATE entries
          SET
            status = 'expired',
            reserved_until = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [entryId],
      );

      throw new Error(
        "RESERVATION_EXPIRED",
      );
    }

    await ensureWallet(
      client,
      userId,
    );

    const walletResult =
      await client.query<{
        id: string;
        balance: string | number;
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

    const walletId =
      walletResult.rows[0].id;

    const balance =
      Number(walletResult.rows[0].balance);

    const fee =
      Number(entry.entry_fee);

    if (
      !Number.isFinite(fee) ||
      fee <= 0
    ) {
      throw new Error(
        "INVALID_ENTRY_FEE",
      );
    }

    if (balance < fee) {
      throw new Error(
        "INSUFFICIENT_WALLET_BALANCE",
      );
    }

    const newBalance =
      balance - fee;

    await client.query(
      `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [newBalance, walletId],
    );

    await client.query(
      `
        UPDATE entries
        SET
          status = 'paid',
          paid_at = NOW(),
          reserved_until = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'reserved'
      `,
      [entryId],
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
          'purchase',
          $2,
          $3,
          $4,
          $5
        )
      `,
      [
        userId,
        -fee,
        newBalance,
        `purchase:${entryId}`,
        `Draw number purchase: ${entryId}`,
      ],
    );

    const paidCountResult =
      await client.query<{
        count: string;
      }>(
        `
          SELECT COUNT(*)::text AS count
          FROM entries
          WHERE draw_id = $1
            AND status = 'paid'
        `,
        [entry.draw_id],
      );

    const paidCount =
      Number(
        paidCountResult.rows[0]?.count ?? 0,
      );

    const totalResult =
      await client.query<{
        total_numbers: number;
      }>(
        `
          SELECT total_numbers
          FROM draws
          WHERE id = $1
        `,
        [entry.draw_id],
      );

    const totalNumbers =
      Number(
        totalResult.rows[0]?.total_numbers ?? 0,
      );

    if (
      paidCount >= totalNumbers &&
      totalNumbers > 0
    ) {
      await client.query(
        `
          UPDATE draws
          SET
            status = 'full',
            updated_at = NOW()
          WHERE id = $1
            AND status = 'open'
        `,
        [entry.draw_id],
      );
    }

    await client.query("COMMIT");

    return {
      entryId,
      balance: newBalance,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
