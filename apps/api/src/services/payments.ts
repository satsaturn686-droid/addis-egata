import { pool } from "../db.js";
import type { Payment } from "../types.js";

type PaymentRow = {
  id: string;
  entry_id: string;
  user_id: string;
  amount: string | number;
  payment_method: "telebirr";
  transaction_reference: string;
  sender_name: string | null;
  receipt_image_url: string | null;
  status: Payment["status"];
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type EntryPaymentRow = {
  id: string;
  user_id: string;
  draw_id: string;
  status: string;
  reserved_until: string | null;
  entry_fee: string | number;
  draw_status: string;
  starts_at: string | null;
  deadline_at: string | null;
};

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    entryId: row.entry_id,
    userId: row.user_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    transactionReference: row.transaction_reference,
    senderName: row.sender_name,
    receiptImageUrl: row.receipt_image_url,
    status: row.status,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isBeforeStart(startsAt: string | null): boolean {
  if (!startsAt) {
    return false;
  }

  return new Date(startsAt).getTime() > Date.now();
}

function isAfterDeadline(deadlineAt: string | null): boolean {
  if (!deadlineAt) {
    return false;
  }

  return new Date(deadlineAt).getTime() <= Date.now();
}

export async function createTelebirrPayment(
  entryId: string,
  userId: string,
  transactionReference: string,
  senderName?: string,
  receiptImageUrl?: string,
): Promise<Payment> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!entryId.trim()) {
    throw new Error("INVALID_ENTRY_ID");
  }

  if (!userId.trim()) {
    throw new Error("INVALID_USER_ID");
  }

  const reference = transactionReference.trim();

  if (!reference) {
    throw new Error("INVALID_TRANSACTION_REFERENCE");
  }

  if (reference.length > 200) {
    throw new Error("TRANSACTION_REFERENCE_TOO_LONG");
  }

  const normalizedSenderName = senderName?.trim() || null;
  const normalizedReceiptImageUrl = receiptImageUrl?.trim() || null;

  if (normalizedSenderName && normalizedSenderName.length > 200) {
    throw new Error("SENDER_NAME_TOO_LONG");
  }

  if (
    normalizedReceiptImageUrl &&
    normalizedReceiptImageUrl.length > 2000
  ) {
    throw new Error("RECEIPT_IMAGE_URL_TOO_LONG");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entryResult = await client.query<EntryPaymentRow>(
      `
        SELECT
          e.id,
          e.user_id,
          e.draw_id,
          e.status,
          e.reserved_until,
          d.entry_fee,
          d.status AS draw_status,
          d.starts_at,
          d.deadline_at
        FROM entries e
        INNER JOIN draws d
          ON d.id = e.draw_id
        WHERE e.id = $1
        FOR UPDATE
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
      if (entry.status === "pending_payment") {
        throw new Error("PAYMENT_ALREADY_PENDING");
      }

      throw new Error("ENTRY_NOT_PAYABLE");
    }

    if (entry.draw_status !== "open") {
      throw new Error("DRAW_NOT_PAYABLE");
    }

    if (isBeforeStart(entry.starts_at)) {
      throw new Error("DRAW_NOT_STARTED");
    }

    if (isAfterDeadline(entry.deadline_at)) {
      await client.query(
        `
          UPDATE entries
          SET
            status = 'expired',
            updated_at = NOW()
          WHERE id = $1
        `,
        [entryId],
      );

      throw new Error("DRAW_DEADLINE_PASSED");
    }

    if (
      entry.reserved_until &&
      new Date(entry.reserved_until).getTime() <= Date.now()
    ) {
      await client.query(
        `
          UPDATE entries
          SET
            status = 'expired',
            updated_at = NOW()
          WHERE id = $1
        `,
        [entryId],
      );

      throw new Error("RESERVATION_EXPIRED");
    }

    /*
     * One entry can have only one unresolved payment attempt.
     * This also protects against a user submitting multiple
     * transaction references for the same reserved number.
     */
    const pendingPaymentResult = await client.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM payments
        WHERE entry_id = $1
          AND status = 'pending'
        LIMIT 1
        FOR UPDATE
      `,
      [entryId],
    );

    if (pendingPaymentResult.rows.length > 0) {
      throw new Error("PAYMENT_ALREADY_PENDING");
    }

    /*
     * Transaction references are globally unique.
     * The database UNIQUE constraint provides the final
     * protection against duplicate references.
     */
    const existingPayment = await client.query<{
      id: string;
    }>(
      `
        SELECT id
        FROM payments
        WHERE transaction_reference = $1
        LIMIT 1
        FOR UPDATE
      `,
      [reference],
    );

    if (existingPayment.rows.length > 0) {
      throw new Error("DUPLICATE_TRANSACTION_REFERENCE");
    }

    const amount = Number(entry.entry_fee);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("INVALID_ENTRY_FEE");
    }

    const paymentResult = await client.query<PaymentRow>(
      `
        INSERT INTO payments (
          entry_id,
          user_id,
          amount,
          payment_method,
          transaction_reference,
          sender_name,
          receipt_image_url,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'telebirr',
          $4,
          $5,
          $6,
          'pending'
        )
        RETURNING
          id,
          entry_id,
          user_id,
          amount,
          payment_method,
          transaction_reference,
          sender_name,
          receipt_image_url,
          status,
          verified_by,
          verified_at,
          rejection_reason,
          created_at,
          updated_at
      `,
      [
        entryId,
        userId,
        amount,
        reference,
        normalizedSenderName,
        normalizedReceiptImageUrl,
      ],
    );

    await client.query(
      `
        UPDATE entries
        SET
          status = 'pending_payment',
          updated_at = NOW()
        WHERE id = $1
      `,
      [entryId],
    );

    await client.query("COMMIT");

    return mapPayment(paymentResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPaymentById(
  paymentId: string,
): Promise<Payment | null> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<PaymentRow>(
    `
      SELECT
        id,
        entry_id,
        user_id,
        amount,
        payment_method,
        transaction_reference,
        sender_name,
        receipt_image_url,
        status,
        verified_by,
        verified_at,
        rejection_reason,
        created_at,
        updated_at
      FROM payments
      WHERE id = $1
      LIMIT 1
    `,
    [paymentId],
  );

  return result.rows.length > 0
    ? mapPayment(result.rows[0])
    : null;
}

export async function getUserPayments(
  userId: string,
): Promise<Payment[]> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<PaymentRow>(
    `
      SELECT
        id,
        entry_id,
        user_id,
        amount,
        payment_method,
        transaction_reference,
        sender_name,
        receipt_image_url,
        status,
        verified_by,
        verified_at,
        rejection_reason,
        created_at,
        updated_at
      FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows.map(mapPayment);
}
