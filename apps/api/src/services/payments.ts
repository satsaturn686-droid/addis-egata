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

  const reference = transactionReference.trim();

  if (!reference) {
    throw new Error("INVALID_TRANSACTION_REFERENCE");
  }

  if (reference.length > 200) {
    throw new Error("TRANSACTION_REFERENCE_TOO_LONG");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entryResult = await client.query<{
      id: string;
      user_id: string;
      draw_id: string;
      status: string;
      reserved_until: string | null;
      entry_fee: string;
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

    if (
      entry.status !== "reserved" &&
      entry.status !== "pending_payment"
    ) {
      throw new Error("ENTRY_NOT_PAYABLE");
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

    if (
      entry.draw_status !== "open" &&
      entry.draw_status !== "full"
    ) {
      throw new Error("DRAW_NOT_PAYABLE");
    }

    const existingPayment = await client.query<PaymentRow>(
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
        WHERE transaction_reference = $1
        LIMIT 1
        FOR UPDATE
      `,
      [reference],
    );

    if (existingPayment.rows.length > 0) {
      throw new Error("DUPLICATE_TRANSACTION_REFERENCE");
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
        Number(entry.entry_fee),
        reference,
        senderName?.trim() || null,
        receiptImageUrl?.trim() || null,
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
