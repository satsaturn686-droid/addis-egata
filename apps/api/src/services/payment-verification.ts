import { pool } from "../db.js";
import type { Payment } from "../types.js";

import {
  notifyUsersAboutDrawOccupancy,
} from "./telegram-notifications.js";

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
};

type DrawNotificationRow = {
  id: string;
  name: string;
  prize_name: string;
  prize_type: "cash" | "physical";
  displayed_prize_value: string | number | null;
  total_numbers: number;
  entry_fee: string | number;
  winner_count: number;
};

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    entryId: row.entry_id,
    userId: row.user_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    transactionReference:
      row.transaction_reference,
    senderName: row.sender_name,
    receiptImageUrl:
      row.receipt_image_url,
    status: row.status,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    rejectionReason:
      row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isBeforeStart(
  startsAt: string | null,
): boolean {
  if (!startsAt) {
    return false;
  }

  return (
    new Date(startsAt).getTime() >
    Date.now()
  );
}

async function getPaymentForUpdate(
  client: import("pg").PoolClient,
  paymentId: string,
): Promise<PaymentRow> {
  const result =
    await client.query<PaymentRow>(
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
    throw new Error(
      "PAYMENT_NOT_FOUND",
    );
  }

  return result.rows[0];
}

async function getEntryForUpdate(
  client: import("pg").PoolClient,
  entryId: string,
): Promise<VerificationEntryRow> {
  const result =
    await client.query<VerificationEntryRow>(
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
          d.starts_at
        FROM entries e
        INNER JOIN draws d
          ON d.id = e.draw_id
        WHERE e.id = $1
        FOR UPDATE OF e, d
      `,
      [entryId],
    );

  if (result.rows.length === 0) {
    throw new Error(
      "ENTRY_NOT_FOUND",
    );
  }

  return result.rows[0];
}

async function markDrawFullIfComplete(
  client: import("pg").PoolClient,
  drawId: string,
  totalNumbers: number,
  adminUserId: string,
): Promise<boolean> {
  const paidResult =
    await client.query<{
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

  const updateResult =
    await client.query<{
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

async function getDrawNotificationData(
  drawId: string,
): Promise<DrawNotificationRow | null> {
  if (!pool) {
    return null;
  }

  const result =
    await pool.query<DrawNotificationRow>(
      `
        SELECT
          d.id,
          d.name,
          COALESCE(
            dp.name,
            d.name
          ) AS prize_name,
          COALESCE(
            dp.prize_type,
            'cash'
          ) AS prize_type,
          COALESCE(
            dp.displayed_value,
            d.prize_amount
          ) AS displayed_prize_value,
          d.total_numbers,
          d.entry_fee,
          d.winner_count
        FROM draws d
        LEFT JOIN draw_prizes dp
          ON dp.draw_id = d.id
        WHERE d.id = $1
        LIMIT 1
      `,
      [drawId],
    );

  return (
    result.rows[0] ?? null
  );
}

async function getPaidCount(
  drawId: string,
): Promise<number> {
  if (!pool) {
    return 0;
  }

  const result =
    await pool.query<{
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

  return Number(
    result.rows[0]?.paid_count ?? 0,
  );
}

async function notifyDrawOccupancyAfterCommit(
  drawId: string,
  drawFull: boolean,
): Promise<void> {
  try {
    const draw =
      await getDrawNotificationData(
        drawId,
      );

    if (!draw) {
      console.warn(
        `Draw occupancy notification skipped: draw ${drawId} was not found.`,
      );

      return;
    }

    const paidCount =
      await getPaidCount(drawId);

    const notificationDraw = {
      id: draw.id,
      name: draw.name,
      prizeName: draw.prize_name,
      prizeType: draw.prize_type,
      displayedPrizeValue:
        draw.displayed_prize_value ===
        null
          ? null
          : Number(
              draw.displayed_prize_value,
            ),
      totalNumbers:
        draw.total_numbers,
      entryFee: Number(
        draw.entry_fee,
      ),
      winnerCount:
        draw.winner_count,
    };

    if (drawFull) {
      await notifyUsersAboutDrawOccupancy(
        notificationDraw,
        paidCount,
        "draw_full",
      );

      return;
    }

    if (
      draw.total_numbers > 0 &&
      paidCount >=
        draw.total_numbers * 0.9
    ) {
      await notifyUsersAboutDrawOccupancy(
        notificationDraw,
        paidCount,
        "occupancy_90",
      );

      return;
    }

    if (
      draw.total_numbers > 0 &&
      paidCount >=
        draw.total_numbers * 0.8
    ) {
      await notifyUsersAboutDrawOccupancy(
        notificationDraw,
        paidCount,
        "occupancy_80",
      );
    }
  } catch (error) {
    console.error(
      "Draw occupancy notification error:",
      error,
    );
  }
}

export async function approvePayment(
  paymentId: string,
  adminUserId: string,
): Promise<Payment> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  if (!adminUserId.trim()) {
    throw new Error(
      "INVALID_ADMIN_USER_ID",
    );
  }

  const client =
    await pool.connect();

  let drawFull = false;
  let notificationDrawId:
    | string
    | null = null;

  try {
    await client.query("BEGIN");

    const payment =
      await getPaymentForUpdate(
        client,
        paymentId,
      );

    if (
      payment.status !== "pending"
    ) {
      throw new Error(
        "PAYMENT_ALREADY_PROCESSED",
      );
    }

    const entry =
      await getEntryForUpdate(
        client,
        payment.entry_id,
      );

    if (
      entry.user_id !==
      payment.user_id
    ) {
      throw new Error(
        "PAYMENT_ENTRY_MISMATCH",
      );
    }

    if (
      Number(payment.amount) !==
      Number(entry.entry_fee)
    ) {
      throw new Error(
        "PAYMENT_AMOUNT_MISMATCH",
      );
    }

    if (
      entry.status !==
        "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error(
        "ENTRY_NOT_VERIFIABLE",
      );
    }

    if (
      entry.draw_status !== "open"
    ) {
      throw new Error(
        "DRAW_NOT_VERIFIABLE",
      );
    }

    if (
      isBeforeStart(
        entry.starts_at,
      )
    ) {
      throw new Error(
        "DRAW_NOT_STARTED",
      );
    }

    /*
     * There is NO draw deadline.
     *
     * Once a user has submitted payment,
     * the admin may verify that payment even
     * after the original 30-minute reservation
     * period has passed.
     *
     * The 30-minute period only controls how long
     * an unpaid "reserved" number remains reserved.
     *
     * A submitted "pending_payment" entry remains
     * locked until the payment is approved or rejected.
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

    if (
      approvedPaymentResult.rows
        .length > 0
    ) {
      throw new Error(
        "ENTRY_ALREADY_PAID",
      );
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
        [
          paymentId,
          adminUserId,
        ],
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
          entryId:
            payment.entry_id,
          drawId:
            entry.draw_id,
          number:
            entry.number,
          transactionReference:
            payment.transaction_reference,
          amount:
            Number(payment.amount),
        }),
      ],
    );

    drawFull =
      await markDrawFullIfComplete(
        client,
        entry.draw_id,
        entry.total_numbers,
        adminUserId,
      );

    notificationDrawId =
      entry.draw_id;

    await client.query("COMMIT");

    if (notificationDrawId) {
      void notifyDrawOccupancyAfterCommit(
        notificationDrawId,
        drawFull,
      );
    }

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
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  if (!adminUserId.trim()) {
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

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const payment =
      await getPaymentForUpdate(
        client,
        paymentId,
      );

    if (
      payment.status !== "pending"
    ) {
      throw new Error(
        "PAYMENT_ALREADY_PROCESSED",
      );
    }

    const entry =
      await getEntryForUpdate(
        client,
        payment.entry_id,
      );

    if (
      entry.user_id !==
      payment.user_id
    ) {
      throw new Error(
        "PAYMENT_ENTRY_MISMATCH",
      );
    }

    if (
      entry.status !==
        "pending_payment" &&
      entry.status !== "reserved"
    ) {
      throw new Error(
        "ENTRY_NOT_REJECTABLE",
      );
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
          entryId:
            payment.entry_id,
          drawId:
            entry.draw_id,
          number:
            entry.number,
          transactionReference:
            payment.transaction_reference,
          amount:
            Number(payment.amount),
          rejectionReason:
            reason,
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
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<PaymentRow>(
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

  return result.rows.map(
    mapPayment,
  );
}
