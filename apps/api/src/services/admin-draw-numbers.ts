import { pool } from "../db.js";

export type AdminDrawNumberStatus =
  | "available"
  | "reserved"
  | "pending_payment"
  | "paid";

export interface AdminDrawNumber {
  number: number;
  status: AdminDrawNumberStatus;
  user: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
  } | null;
  reservedUntil: string | null;
  payment: {
    id: string;
    amount: number;
    status: "pending" | "approved" | "rejected";
    transactionReference: string;
    createdAt: string;
  } | null;
}

export interface AdminDrawNumbersResponse {
  draw: {
    id: string;
    name: string;
    totalNumbers: number;
    entryFee: number;
    status: string;
  };
  summary: {
    totalNumbers: number;
    occupiedNumbers: number;
    availableNumbers: number;
    paidCount: number;
    reservedCount: number;
    pendingPaymentCount: number;
    collectedAmount: number;
  };
  numbers: AdminDrawNumber[];
}

type DrawRow = {
  id: string;
  name: string;
  total_numbers: number;
  entry_fee: string | number;
  status: string;
};

type NumberRow = {
  number: number;
  status: AdminDrawNumberStatus | null;
  user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  reserved_until: string | null;
  payment_id: string | null;
  payment_amount: string | number | null;
  payment_status:
    | "pending"
    | "approved"
    | "rejected"
    | null;
  transaction_reference: string | null;
  payment_created_at: string | null;
};

type SummaryRow = {
  paid_count: string;
  reserved_count: string;
  pending_payment_count: string;
  collected_amount: string | number;
};

function getDisplayName(
  username: string | null,
  firstName: string | null,
  lastName: string | null,
): string {
  const fullName = [
    firstName,
    lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (username) {
    return `@${username}`;
  }

  return "—";
}

export async function getAdminDrawNumbers(
  drawId: string,
): Promise<AdminDrawNumbersResponse> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "INVALID_DRAW_ID",
    );
  }

  const drawResult =
    await pool.query<DrawRow>(
      `
        SELECT
          id,
          name,
          total_numbers,
          entry_fee,
          status
        FROM draws
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedDrawId],
    );

  if (drawResult.rows.length === 0) {
    throw new Error(
      "DRAW_NOT_FOUND",
    );
  }

  const draw =
    drawResult.rows[0];

  /*
   * Generate every number belonging to
   * this draw and LEFT JOIN only the
   * currently active entry.
   *
   * IMPORTANT:
   *
   * - paid stays occupied.
   * - pending_payment stays occupied even
   *   after the 30-minute reservation time.
   * - reserved is occupied ONLY while
   *   reserved_until > NOW().
   * - expired/rejected entries are ignored.
   *
   * Therefore an expired reservation is
   * immediately displayed as AVAILABLE
   * without waiting for the cron cleanup.
   */
  const numberResult =
    await pool.query<NumberRow>(
      `
        SELECT
          numbers.number,

          active_entry.status,

          active_entry.user_id,
          u.username,
          u.first_name,
          u.last_name,

          active_entry.reserved_until,

          latest_payment.id AS payment_id,
          latest_payment.amount AS payment_amount,
          latest_payment.status AS payment_status,
          latest_payment.transaction_reference,
          latest_payment.created_at AS payment_created_at

        FROM generate_series(
          1,
          $1::integer
        ) AS numbers(number)

        LEFT JOIN LATERAL (
          SELECT
            e.id,
            e.user_id,
            e.status,
            e.reserved_until
          FROM entries e
          WHERE e.draw_id = $2
            AND e.number = numbers.number
            AND (
              e.status IN (
                'paid',
                'pending_payment'
              )
              OR (
                e.status = 'reserved'
                AND e.reserved_until IS NOT NULL
                AND e.reserved_until > NOW()
              )
            )
          ORDER BY e.updated_at DESC
          LIMIT 1
        ) AS active_entry
          ON TRUE

        LEFT JOIN users u
          ON u.id = active_entry.user_id

        LEFT JOIN LATERAL (
          SELECT
            p.id,
            p.amount,
            p.status,
            p.transaction_reference,
            p.created_at
          FROM payments p
          WHERE active_entry.id IS NOT NULL
            AND p.entry_id = active_entry.id
          ORDER BY
            CASE p.status
              WHEN 'approved' THEN 1
              WHEN 'pending' THEN 2
              WHEN 'rejected' THEN 3
              ELSE 4
            END,
            p.created_at DESC
          LIMIT 1
        ) AS latest_payment
          ON TRUE

        ORDER BY numbers.number ASC
      `,
      [
        draw.total_numbers,
        normalizedDrawId,
      ],
    );

  const summaryResult =
    await pool.query<SummaryRow>(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE e.status = 'paid'
          )::text AS paid_count,

          COUNT(*) FILTER (
            WHERE e.status = 'reserved'
              AND e.reserved_until IS NOT NULL
              AND e.reserved_until > NOW()
          )::text AS reserved_count,

          COUNT(*) FILTER (
            WHERE e.status = 'pending_payment'
          )::text AS pending_payment_count,

          COALESCE(
            SUM(
              CASE
                WHEN e.status = 'paid'
                THEN COALESCE(
                  wallet_purchase.amount,
                  p.amount,
                  0
                )
                ELSE 0
              END
            ),
            0
          ) AS collected_amount

        FROM entries e

        LEFT JOIN LATERAL (
          SELECT
            p.amount,
            p.status
          FROM payments p
          WHERE p.entry_id = e.id
          ORDER BY
            CASE p.status
              WHEN 'approved' THEN 1
              WHEN 'pending' THEN 2
              WHEN 'rejected' THEN 3
              ELSE 4
            END,
            p.created_at DESC
          LIMIT 1
        ) AS p
          ON TRUE

        LEFT JOIN LATERAL (
          SELECT
            ABS(wt.amount) AS amount
          FROM wallet_transactions wt
          WHERE wt.reference = CONCAT(
            'purchase:',
            e.id
          )
            AND wt.type = 'purchase'
            AND wt.amount < 0
          ORDER BY wt.created_at DESC
          LIMIT 1
        ) AS wallet_purchase
          ON TRUE

        WHERE e.draw_id = $1
          AND (
            e.status IN (
              'paid',
              'pending_payment'
            )
            OR (
              e.status = 'reserved'
              AND e.reserved_until IS NOT NULL
              AND e.reserved_until > NOW()
            )
          )
      `,
      [normalizedDrawId],
    );

  const summaryRow =
    summaryResult.rows[0];

  const paidCount =
    Number(
      summaryRow?.paid_count ?? 0,
    );

  const reservedCount =
    Number(
      summaryRow?.reserved_count ?? 0,
    );

  const pendingPaymentCount =
    Number(
      summaryRow?.pending_payment_count ??
        0,
    );

  const occupiedNumbers =
    paidCount +
    reservedCount +
    pendingPaymentCount;

  const availableNumbers =
    Math.max(
      draw.total_numbers -
        occupiedNumbers,
      0,
    );

  const numbers =
    numberResult.rows.map(
      (row) => {
        const hasActiveEntry =
          row.status !== null;

        return {
          number:
            Number(row.number),

          status:
            hasActiveEntry
              ? row.status!
              : "available",

          user:
            hasActiveEntry &&
            row.user_id
              ? {
                  id: row.user_id,
                  username:
                    row.username,
                  firstName:
                    row.first_name,
                  lastName:
                    row.last_name,
                  displayName:
                    getDisplayName(
                      row.username,
                      row.first_name,
                      row.last_name,
                    ),
                }
              : null,

          reservedUntil:
            hasActiveEntry
              ? row.reserved_until
              : null,

          payment:
            row.payment_id
              ? {
                  id:
                    row.payment_id,
                  amount:
                    Number(
                      row.payment_amount ??
                        0,
                    ),
                  status:
                    row.payment_status!,
                  transactionReference:
                    row.transaction_reference ??
                    "",
                  createdAt:
                    row.payment_created_at!,
                }
              : null,
        };
      },
    );

  return {
    draw: {
      id: draw.id,
      name: draw.name,
      totalNumbers:
        Number(
          draw.total_numbers,
        ),
      entryFee:
        Number(draw.entry_fee),
      status: draw.status,
    },

    summary: {
      totalNumbers:
        Number(
          draw.total_numbers,
        ),
      occupiedNumbers,
      availableNumbers,
      paidCount,
      reservedCount,
      pendingPaymentCount,
      collectedAmount:
        Number(
          summaryRow?.collected_amount ??
            0,
        ),
    },

    numbers,
  };
}
