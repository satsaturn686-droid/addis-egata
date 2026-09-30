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

type VerificationEntryRow = {
  id: string;
  draw_id: string;
  user_id: string;
  number: number;
  status: string;
  reserved_until: string | null;
  entry_fee: string | number;
  draw_status: string;
  total_numbers: number;
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

async function getPaymentForUpdate(
  client: import("pg").PoolClient,
  paymentId: string,
): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
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

  if (result.rows.length === 0) {
    throw new Error("PAYMENT_NOT_FOUND");
  }

  return result.rows[0];
}

async function getEntryForUpdate(
  client: import("pg").PoolClient,
  entryId: string,
): Promise<VerificationEntryRow> {
  const result = await client.query<VerificationEntryRow>(
    `
      SELECT
        e.id,
        e.draw_id,
        e.user_id,
        e.number,
        e.status,
        e.reserved_until,
        d.entry_fee,
        d.status AS draw_status,
        d.total_numbers,
        d.starts_at,
        d.deadline_at
      FROM entries e
      INNER JOIN draws d
        ON d.id = e.draw_id
      WHERE e.id = $1
      FOR UPDATE OF e, d
    `,
    [entryId],
  );

  if (result.rows.length === 0) {
    throw new Error("ENTRY_NOT_FOUND");
  }

  return result.rows[0];
}

async function markDrawFullIfComplete(
  client: import("pg").PoolClient,
  drawId: string,
  totalNumbers: number,
  adminUserId: string,
): Promise<boolean> {
  const paidResult = await client.query<{
    paid_count: string;
  }>(
    `
      SELECT COUNT(*)::text AS paid_count
      FROM entries
      WHERE draw_id = $1
        AND status = 'paid'
    `,
    [drawId],
  );

  const paidCount = Number(
    paidResult.rows[0]?.paid_count ?? 0,
  );

  if (paidCount < totalNumbers) {
    return false;
  }

  const updateResult = await client.query<{
    id: string;
  }>(
    `
      UPDATE draws
      SET
        status = 'full',
        updated_at = NOW()
      WHERE id = $1
        AND status = 'open'
      RETURNING id
    `,
    [drawId],
  );

  if (updateResult.rows.length === 0) {
    return false;
  }

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
        'DRAW_FULL',
        'draw',
        $2,
        $3
      )
    `,
    [
      adminUserId,
      drawId,
      JSON.stringify({
        paidCount,
        totalNumbers,
      }),
    ],
  );

  return true;
}

export async function approvePayment(
  paymentId: string,
  adminUserId: string,
): Promise<Payment> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const payment = await getPaymentForUpdate(
      client,
      paymentId,
    );

    if (payment.status !== "pending") {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    const entry = await getEntryForUpdate(
      client,
      payment.entry_id,
    );

    if (entry.user_id !== payment.user_id) {
      throw new Error("PAYMENT_ENTRY_MISMATCH");
    }

    if (
      Number(payment.amount) !==
      Number(entry.entry_fee)
    ) {
      throw new Error("PAYMENT_AMOUNT_MISMATCH");
    }

    if (
      entry.status !== "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error("ENTRY_NOT_VERIFIABLE");
    }

    if (entry.draw_status !== "open") {
      throw new Error("DRAW_NOT_VERIFIABLE");
    }

    if (isBeforeStart(entry.starts_at)) {
      throw new Error("DRAW_NOT_STARTED");
    }

    /*
     * A payment may be approved after the 30-minute
     * reservation period if the payment was already
     * submitted and is still pending.
     *
     * The draw deadline remains the final approval cutoff.
     */
    if (isAfterDeadline(entry.deadline_at)) {
      await client.query(
        `
          UPDATE entries
          SET
            status = 'expired',
            reserved_until = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [entry.id],
      );

      throw new Error("DRAW_DEADLINE_PASSED");
    }

    /*
     * Prevent approval if another approved payment
     * already exists for the same entry.
     */
    const approvedPaymentResult =
      await client.query<{
        id: string;
      }>(
        `
          SELECT id
          FROM payments
          WHERE entry_id = $1
            AND status = 'approved'
          LIMIT 1
        `,
        [entry.id],
      );

    if (approvedPaymentResult.rows.length > 0) {
      throw new Error("ENTRY_ALREADY_PAID");
    }

    const updatedPaymentResult =
      await client.query<PaymentRow>(
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
      [entry.id],
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
          drawId: entry.draw_id,
          number: entry.number,
          transactionReference:
            payment.transaction_reference,
          amount: Number(payment.amount),
        }),
      ],
    );

    await markDrawFullIfComplete(
      client,
      entry.draw_id,
      entry.total_numbers,
      adminUserId,
    );

    await client.query("COMMIT");

    return mapPayment(
      updatedPaymentResult.rows[0],
    );
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

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
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

    const payment = await getPaymentForUpdate(
      client,
      paymentId,
    );

    if (payment.status !== "pending") {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    const entry = await getEntryForUpdate(
      client,
      payment.entry_id,
    );

    if (entry.user_id !== payment.user_id) {
      throw new Error("PAYMENT_ENTRY_MISMATCH");
    }

    if (
      entry.status !== "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error("ENTRY_NOT_REJECTABLE");
    }

    const updatedPaymentResult =
      await client.query<PaymentRow>(
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
        [
          paymentId,
          adminUserId,
          reason,
        ],
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
          drawId: entry.draw_id,
          number: entry.number,
          transactionReference:
            payment.transaction_reference,
          amount: Number(payment.amount),
          rejectionReason: reason,
        }),
      ],
    );

    await client.query("COMMIT");

    return mapPayment(
      updatedPaymentResult.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPendingPayments(): Promise<
  Payment[]
> {
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
