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

export async function approvePayment(
  paymentId: string,
  adminUserId: string,
): Promise<Payment> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<PaymentRow>(
      `
        SELECT
          p.id,
          p.entry_id,
          p.user_id,
          p.amount,
          p.payment_method,
          p.transaction_reference,
          p.sender_name,
          p.receipt_image_url,
          p.status,
          p.verified_by,
          p.verified_at,
          p.rejection_reason,
          p.created_at,
          p.updated_at
        FROM payments p
        WHERE p.id = $1
        FOR UPDATE
      `,
      [paymentId],
    );

    if (paymentResult.rows.length === 0) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== "pending") {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    const entryResult = await client.query<{
      id: string;
      draw_id: string;
      user_id: string;
      status: string;
      reserved_until: string | null;
      entry_fee: string;
      draw_status: string;
    }>(
      `
        SELECT
          e.id,
          e.draw_id,
          e.user_id,
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
      [payment.entry_id],
    );

    if (entryResult.rows.length === 0) {
      throw new Error("ENTRY_NOT_FOUND");
    }

    const entry = entryResult.rows[0];

    if (entry.user_id !== payment.user_id) {
      throw new Error("PAYMENT_ENTRY_MISMATCH");
    }

    if (Number(payment.amount) !== Number(entry.entry_fee)) {
      throw new Error("PAYMENT_AMOUNT_MISMATCH");
    }

    if (
      entry.status !== "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error("ENTRY_NOT_VERIFIABLE");
    }

    const updatedPaymentResult = await client.query<PaymentRow>(
      `
        UPDATE payments
        SET
          status = 'approved',
          verified_by = $2,
          verified_at = NOW(),
          rejection_reason = NULL,
          updated_at = NOW()
        WHERE id = $1
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
      [paymentId, adminUserId],
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
      `,
      [payment.entry_id],
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
          'PAYMENT_APPROVED',
          'payment',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        paymentId,
        JSON.stringify({
          entryId: payment.entry_id,
          transactionReference: payment.transaction_reference,
          amount: Number(payment.amount),
        }),
      ],
    );

    await client.query("COMMIT");

    return mapPayment(updatedPaymentResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectPayment(
  paymentId: string,
  adminUserId: string,
  rejectionReason: string,
): Promise<Payment> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const reason = rejectionReason.trim();

  if (!reason) {
    throw new Error("REJECTION_REASON_REQUIRED");
  }

  if (reason.length > 500) {
    throw new Error("REJECTION_REASON_TOO_LONG");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<PaymentRow>(
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
        FOR UPDATE
      `,
      [paymentId],
    );

    if (paymentResult.rows.length === 0) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== "pending") {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    const entryResult = await client.query<{
      id: string;
      user_id: string;
      status: string;
    }>(
      `
        SELECT
          id,
          user_id,
          status
        FROM entries
        WHERE id = $1
        FOR UPDATE
      `,
      [payment.entry_id],
    );

    if (entryResult.rows.length === 0) {
      throw new Error("ENTRY_NOT_FOUND");
    }

    const entry = entryResult.rows[0];

    if (entry.user_id !== payment.user_id) {
      throw new Error("PAYMENT_ENTRY_MISMATCH");
    }

    if (
      entry.status !== "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error("ENTRY_NOT_REJECTABLE");
    }

    const updatedPaymentResult = await client.query<PaymentRow>(
      `
        UPDATE payments
        SET
          status = 'rejected',
          verified_by = $2,
          verified_at = NOW(),
          rejection_reason = $3,
          updated_at = NOW()
        WHERE id = $1
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
      [paymentId, adminUserId, reason],
    );

    await client.query(
      `
        UPDATE entries
        SET
          status = 'rejected',
          reserved_until = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [payment.entry_id],
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
          'PAYMENT_REJECTED',
          'payment',
          $2,
          $3
        )
      `,
      [
        adminUserId,
        paymentId,
        JSON.stringify({
          entryId: payment.entry_id,
          transactionReference: payment.transaction_reference,
          amount: Number(payment.amount),
          rejectionReason: reason,
        }),
      ],
    );

    await client.query("COMMIT");

    return mapPayment(updatedPaymentResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPendingPayments(): Promise<Payment[]> {
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
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `,
  );

  return result.rows.map(mapPayment);
}
