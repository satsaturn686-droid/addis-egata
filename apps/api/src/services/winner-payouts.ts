import { pool } from "../db.js";

export type WinnerPayoutStatus =
  | "awaiting_claim"
  | "awaiting_screenshot"
  | "awaiting_telebirr"
  | "submitted"
  | "approved"
  | "paid"
  | "rejected";

export type WinnerPayout = {
  id: string;
  winnerId: string;
  drawId: string;
  drawName: string;
  entryId: string;
  number: number;
  userId: string;
  telegramId: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  rank: number;
  prizeAmount: number;
  status: WinnerPayoutStatus;
  telebirrNumber: string | null;
  telebirrAccountName: string | null;
  screenshotFileId: string | null;
  screenshotFileUniqueId: string | null;
  claimStartedAt: string | null;
  screenshotReceivedAt: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  rejectionReason: string | null;
  telegramClaimMessageId: number | null;
  telegramAdminMessageId: number | null;
  createdAt: string;
  updatedAt: string;
};

type PayoutRow = {
  id: string;
  winner_id: string;
  draw_id: string;
  draw_name: string;
  entry_id: string;
  number: number;
  user_id: string;
  telegram_id: string | number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  rank: number;
  prize_amount: string | number;
  status: WinnerPayoutStatus;
  telebirr_number: string | null;
  telebirr_account_name: string | null;
  screenshot_file_id: string | null;
  screenshot_file_unique_id: string | null;
  claim_started_at: string | null;
  screenshot_received_at: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  rejection_reason: string | null;
  telegram_claim_message_id: number | null;
  telegram_admin_message_id: number | null;
  created_at: string;
  updated_at: string;
};

function mapPayout(row: PayoutRow): WinnerPayout {
  return {
    id: row.id,
    winnerId: row.winner_id,
    drawId: row.draw_id,
    drawName: row.draw_name,
    entryId: row.entry_id,
    number: row.number,
    userId: row.user_id,
    telegramId: Number(row.telegram_id),
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    rank: row.rank,
    prizeAmount: Number(row.prize_amount),
    status: row.status,
    telebirrNumber: row.telebirr_number,
    telebirrAccountName: row.telebirr_account_name,
    screenshotFileId: row.screenshot_file_id,
    screenshotFileUniqueId:
      row.screenshot_file_unique_id,
    claimStartedAt: row.claim_started_at,
    screenshotReceivedAt:
      row.screenshot_received_at,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    paidBy: row.paid_by,
    paidAt: row.paid_at,
    paymentReference:
      row.payment_reference,
    rejectionReason:
      row.rejection_reason,
    telegramClaimMessageId:
      row.telegram_claim_message_id,
    telegramAdminMessageId:
      row.telegram_admin_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateId(
  value: string,
  errorCode: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(errorCode);
  }

  return normalized;
}

async function getPayoutByWhere(
  where: string,
  values: unknown[],
): Promise<WinnerPayout | null> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<PayoutRow>(
      `
        SELECT
          wp.id,
          wp.winner_id,
          wp.draw_id,
          d.name AS draw_name,
          w.entry_id,
          e.number,
          wp.user_id,
          u.telegram_id,
          u.first_name,
          u.last_name,
          u.username,
          w.rank,
          wp.prize_amount,
          wp.status,
          wp.telebirr_number,
          wp.telebirr_account_name,
          wp.screenshot_file_id,
          wp.screenshot_file_unique_id,
          wp.claim_started_at,
          wp.screenshot_received_at,
          wp.submitted_at,
          wp.reviewed_by,
          wp.reviewed_at,
          wp.paid_by,
          wp.paid_at,
          wp.payment_reference,
          wp.rejection_reason,
          wp.telegram_claim_message_id,
          wp.telegram_admin_message_id,
          wp.created_at,
          wp.updated_at
        FROM winner_payouts wp
        INNER JOIN winners w
          ON w.id = wp.winner_id
        INNER JOIN draws d
          ON d.id = wp.draw_id
        INNER JOIN entries e
          ON e.id = w.entry_id
        INNER JOIN users u
          ON u.id = wp.user_id
        WHERE ${where}
        LIMIT 1
      `,
      values,
    );

  return result.rows.length > 0
    ? mapPayout(result.rows[0])
    : null;
}

/**
 * Creates the payout records for a draw.
 *
 * This operation is idempotent because winner_id
 * is UNIQUE in the database.
 */
export async function ensureWinnerPayoutsForDraw(
  drawId: string,
): Promise<number> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const normalizedDrawId =
    validateId(
      drawId,
      "INVALID_DRAW_ID",
    );

  const result = await pool.query<{
    id: string;
  }>(
    `
      INSERT INTO winner_payouts (
        winner_id,
        draw_id,
        user_id,
        prize_amount
      )
      SELECT
        w.id,
        w.draw_id,
        w.user_id,
        w.prize_amount
      FROM winners w
      INNER JOIN draws d
        ON d.id = w.draw_id
      WHERE w.draw_id = $1
        AND d.status = 'completed'
      ON CONFLICT (winner_id)
      DO NOTHING
      RETURNING id
    `,
    [normalizedDrawId],
  );

  return result.rows.length;
}

export async function getPayoutById(
  payoutId: string,
): Promise<WinnerPayout | null> {
  const normalizedId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  return getPayoutByWhere(
    "wp.id = $1",
    [normalizedId],
  );
}

export async function getPayoutByWinnerId(
  winnerId: string,
): Promise<WinnerPayout | null> {
  const normalizedId =
    validateId(
      winnerId,
      "INVALID_WINNER_ID",
    );

  return getPayoutByWhere(
    "wp.winner_id = $1",
    [normalizedId],
  );
}

export async function getPayoutByTelegramUser(
  telegramId: number,
  payoutId?: string,
): Promise<WinnerPayout | null> {
  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new Error(
      "INVALID_TELEGRAM_USER_ID",
    );
  }

  if (payoutId?.trim()) {
    return getPayoutByWhere(
      `
        wp.id = $1
        AND u.telegram_id = $2
      `,
      [
        payoutId.trim(),
        telegramId,
      ],
    );
  }

  return getPayoutByWhere(
    `
      u.telegram_id = $1
      AND wp.status IN (
        'awaiting_claim',
        'awaiting_screenshot',
        'awaiting_telebirr',
        'submitted'
      )
    `,
    [telegramId],
  );
}

/**
 * Ensures a payout exists and moves it into
 * the first claimant state.
 */
export async function startWinnerClaim(
  winnerId: string,
  telegramId: number,
): Promise<WinnerPayout> {
  const normalizedWinnerId =
    validateId(
      winnerId,
      "INVALID_WINNER_ID",
    );

  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new Error(
      "INVALID_TELEGRAM_USER_ID",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result = await pool.query<{
    payout_id: string;
  }>(
    `
      WITH winner_data AS (
        SELECT
          w.id AS winner_id,
          w.draw_id,
          w.user_id,
          w.prize_amount
        FROM winners w
        INNER JOIN users u
          ON u.id = w.user_id
        WHERE w.id = $1
          AND u.telegram_id = $2
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO winner_payouts (
          winner_id,
          draw_id,
          user_id,
          prize_amount
        )
        SELECT
          winner_id,
          draw_id,
          user_id,
          prize_amount
        FROM winner_data
        ON CONFLICT (winner_id)
        DO NOTHING
        RETURNING id
      )
      SELECT id AS payout_id
      FROM inserted

      UNION ALL

      SELECT wp.id AS payout_id
      FROM winner_payouts wp
      INNER JOIN winner_data wd
        ON wd.winner_id = wp.winner_id
      LIMIT 1
    `,
    [
      normalizedWinnerId,
      telegramId,
    ],
  );

  const payoutId =
    result.rows[0]?.payout_id;

  if (!payoutId) {
    throw new Error(
      "WINNER_NOT_AUTHORIZED",
    );
  }

  const update = await pool.query(
    `
      UPDATE winner_payouts
      SET
        status =
          CASE
            WHEN status = 'rejected'
              THEN 'awaiting_screenshot'
            WHEN status = 'awaiting_claim'
              THEN 'awaiting_screenshot'
            ELSE status
          END,
        claim_started_at =
          COALESCE(
            claim_started_at,
            NOW()
          ),
        updated_at = NOW()
      WHERE id = $1
        AND status NOT IN (
          'paid',
          'approved',
          'submitted'
        )
    `,
    [payoutId],
  );

  void update;

  const payout =
    await getPayoutById(
      payoutId,
    );

  if (!payout) {
    throw new Error(
      "PAYOUT_NOT_FOUND",
    );
  }

  return payout;
}

export async function saveWinnerScreenshot(
  payoutId: string,
  telegramId: number,
  fileId: string,
  fileUniqueId?: string,
): Promise<WinnerPayout> {
  const normalizedPayoutId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  const normalizedFileId =
    validateId(
      fileId,
      "SCREENSHOT_FILE_ID_REQUIRED",
    );

  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new Error(
      "INVALID_TELEGRAM_USER_ID",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<{
      id: string;
    }>(
      `
        UPDATE winner_payouts wp
        SET
          screenshot_file_id = $1,
          screenshot_file_unique_id = $2,
          screenshot_received_at = NOW(),
          status = 'awaiting_telebirr',
          updated_at = NOW()
        FROM users u
        WHERE wp.id = $3
          AND wp.user_id = u.id
          AND u.telegram_id = $4
          AND wp.status IN (
            'awaiting_screenshot',
            'rejected'
          )
        RETURNING wp.id
      `,
      [
        normalizedFileId,
        fileUniqueId?.trim() || null,
        normalizedPayoutId,
        telegramId,
      ],
    );

  if (result.rows.length === 0) {
    throw new Error(
      "SCREENSHOT_NOT_ACCEPTED",
    );
  }

  const payout =
    await getPayoutById(
      normalizedPayoutId,
    );

  if (!payout) {
    throw new Error(
      "PAYOUT_NOT_FOUND",
    );
  }

  return payout;
}

export async function submitWinnerTelebirr(
  payoutId: string,
  telegramId: number,
  telebirrNumber: string,
  accountName: string,
): Promise<WinnerPayout> {
  const normalizedPayoutId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  const normalizedNumber =
    telebirrNumber.trim();

  const normalizedName =
    accountName.trim();

  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new Error(
      "INVALID_TELEGRAM_USER_ID",
    );
  }

  if (!normalizedNumber) {
    throw new Error(
      "TELEBIRR_NUMBER_REQUIRED",
    );
  }

  if (!normalizedName) {
    throw new Error(
      "TELEBIRR_ACCOUNT_NAME_REQUIRED",
    );
  }

  if (normalizedNumber.length > 100) {
    throw new Error(
      "TELEBIRR_NUMBER_TOO_LONG",
    );
  }

  if (normalizedName.length > 200) {
    throw new Error(
      "TELEBIRR_ACCOUNT_NAME_TOO_LONG",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<{
      id: string;
    }>(
      `
        UPDATE winner_payouts wp
        SET
          telebirr_number = $1,
          telebirr_account_name = $2,
          submitted_at = NOW(),
          status = 'submitted',
          updated_at = NOW()
        FROM users u
        WHERE wp.id = $3
          AND wp.user_id = u.id
          AND u.telegram_id = $4
          AND wp.screenshot_file_id IS NOT NULL
          AND wp.status = 'awaiting_telebirr'
        RETURNING wp.id
      `,
      [
        normalizedNumber,
        normalizedName,
        normalizedPayoutId,
        telegramId,
      ],
    );

  if (result.rows.length === 0) {
    throw new Error(
      "PAYOUT_SUBMISSION_NOT_ALLOWED",
    );
  }

  const payout =
    await getPayoutById(
      normalizedPayoutId,
    );

  if (!payout) {
    throw new Error(
      "PAYOUT_NOT_FOUND",
    );
  }

  return payout;
}

export async function getPendingWinnerPayouts(): Promise<
  WinnerPayout[]
> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<PayoutRow>(
      `
        SELECT
          wp.id,
          wp.winner_id,
          wp.draw_id,
          d.name AS draw_name,
          w.entry_id,
          e.number,
          wp.user_id,
          u.telegram_id,
          u.first_name,
          u.last_name,
          u.username,
          w.rank,
          wp.prize_amount,
          wp.status,
          wp.telebirr_number,
          wp.telebirr_account_name,
          wp.screenshot_file_id,
          wp.screenshot_file_unique_id,
          wp.claim_started_at,
          wp.screenshot_received_at,
          wp.submitted_at,
          wp.reviewed_by,
          wp.reviewed_at,
          wp.paid_by,
          wp.paid_at,
          wp.payment_reference,
          wp.rejection_reason,
          wp.telegram_claim_message_id,
          wp.telegram_admin_message_id,
          wp.created_at,
          wp.updated_at
        FROM winner_payouts wp
        INNER JOIN winners w
          ON w.id = wp.winner_id
        INNER JOIN draws d
          ON d.id = wp.draw_id
        INNER JOIN entries e
          ON e.id = w.entry_id
        INNER JOIN users u
          ON u.id = wp.user_id
        WHERE wp.status IN (
          'submitted',
          'approved'
        )
        ORDER BY
          wp.submitted_at ASC NULLS LAST,
          wp.created_at ASC
      `,
    );

  return result.rows.map(mapPayout);
}

export async function approveWinnerPayout(
  payoutId: string,
  adminUserId: string,
): Promise<WinnerPayout> {
  const normalizedPayoutId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  const normalizedAdminId =
    validateId(
      adminUserId,
      "INVALID_ADMIN_USER_ID",
    );

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<{
      id: string;
    }>(
      `
        UPDATE winner_payouts
        SET
          status = 'approved',
          reviewed_by = $1,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
          AND status = 'submitted'
          AND telebirr_number IS NOT NULL
          AND length(trim(telebirr_number)) > 0
        RETURNING id
      `,
      [
        normalizedAdminId,
        normalizedPayoutId,
      ],
    );

  if (result.rows.length === 0) {
    throw new Error(
      "PAYOUT_NOT_APPROVABLE",
    );
  }

  const payout =
    await getPayoutById(
      normalizedPayoutId,
    );

  if (!payout) {
    throw new Error(
      "PAYOUT_NOT_FOUND",
    );
  }

  await pool.query(
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
        'WINNER_PAYOUT_APPROVED',
        'winner_payout',
        $2,
        $3
      )
    `,
    [
      normalizedAdminId,
      normalizedPayoutId,
      JSON.stringify({
        winnerId:
          payout.winnerId,
        drawId:
          payout.drawId,
        prizeAmount:
          payout.prizeAmount,
      }),
    ],
  );

  return payout;
}

export async function rejectWinnerPayout(
  payoutId: string,
  adminUserId: string,
  reason: string,
): Promise<WinnerPayout> {
  const normalizedPayoutId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  const normalizedAdminId =
    validateId(
      adminUserId,
      "INVALID_ADMIN_USER_ID",
    );

  const normalizedReason =
    reason.trim();

  if (!normalizedReason) {
    throw new Error(
      "REJECTION_REASON_REQUIRED",
    );
  }

  if (normalizedReason.length > 500) {
    throw new Error(
      "REJECTION_REASON_TOO_LONG",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<{
      id: string;
    }>(
      `
        UPDATE winner_payouts
        SET
          status = 'rejected',
          rejection_reason = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
          AND status IN (
            'submitted',
            'approved'
          )
        RETURNING id
      `,
      [
        normalizedReason,
        normalizedAdminId,
        normalizedPayoutId,
      ],
    );

  if (result.rows.length === 0) {
    throw new Error(
      "PAYOUT_NOT_REJECTABLE",
    );
  }

  const payout =
    await getPayoutById(
      normalizedPayoutId,
    );

  if (!payout) {
    throw new Error(
      "PAYOUT_NOT_FOUND",
    );
  }

  await pool.query(
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
        'WINNER_PAYOUT_REJECTED',
        'winner_payout',
        $2,
        $3
      )
    `,
    [
      normalizedAdminId,
      normalizedPayoutId,
      JSON.stringify({
        reason:
          normalizedReason,
      }),
    ],
  );

  return payout;
}

export async function markWinnerPayoutPaid(
  payoutId: string,
  adminUserId: string,
  paymentReference: string,
): Promise<WinnerPayout> {
  const normalizedPayoutId =
    validateId(
      payoutId,
      "INVALID_PAYOUT_ID",
    );

  const normalizedAdminId =
    validateId(
      adminUserId,
      "INVALID_ADMIN_USER_ID",
    );

  const normalizedReference =
    paymentReference.trim();

  if (!normalizedReference) {
    throw new Error(
      "PAYMENT_REFERENCE_REQUIRED",
    );
  }

  if (normalizedReference.length > 200) {
    throw new Error(
      "PAYMENT_REFERENCE_TOO_LONG",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    const result =
      await client.query<{
        id: string;
      }>(
        `
          UPDATE winner_payouts
          SET
            status = 'paid',
            paid_by = $1,
            paid_at = NOW(),
            payment_reference = $2,
            updated_at = NOW()
          WHERE id = $3
            AND status = 'approved'
            AND telebirr_number IS NOT NULL
            AND length(trim(telebirr_number)) > 0
          RETURNING id
        `,
        [
          normalizedAdminId,
          normalizedReference,
          normalizedPayoutId,
        ],
      );

    if (result.rows.length === 0) {
      throw new Error(
        "PAYOUT_NOT_PAYABLE",
      );
    }

    const payoutResult =
      await client.query<PayoutRow>(
        `
          SELECT
            wp.id,
            wp.winner_id,
            wp.draw_id,
            d.name AS draw_name,
            w.entry_id,
            e.number,
            wp.user_id,
            u.telegram_id,
            u.first_name,
            u.last_name,
            u.username,
            w.rank,
            wp.prize_amount,
            wp.status,
            wp.telebirr_number,
            wp.telebirr_account_name,
            wp.screenshot_file_id,
            wp.screenshot_file_unique_id,
            wp.claim_started_at,
            wp.screenshot_received_at,
            wp.submitted_at,
            wp.reviewed_by,
            wp.reviewed_at,
            wp.paid_by,
            wp.paid_at,
            wp.payment_reference,
            wp.rejection_reason,
            wp.telegram_claim_message_id,
            wp.telegram_admin_message_id,
            wp.created_at,
            wp.updated_at
          FROM winner_payouts wp
          INNER JOIN winners w
            ON w.id = wp.winner_id
          INNER JOIN draws d
            ON d.id = wp.draw_id
          INNER JOIN entries e
            ON e.id = w.entry_id
          INNER JOIN users u
            ON u.id = wp.user_id
          WHERE wp.id = $1
          LIMIT 1
        `,
        [normalizedPayoutId],
      );

    const row =
      payoutResult.rows[0];

    if (!row) {
      throw new Error(
        "PAYOUT_NOT_FOUND",
      );
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
          'WINNER_PAYOUT_PAID',
          'winner_payout',
          $2,
          $3
        )
      `,
      [
        normalizedAdminId,
        normalizedPayoutId,
        JSON.stringify({
          paymentReference:
            normalizedReference,
          prizeAmount:
            Number(
              row.prize_amount,
            ),
        }),
      ],
    );

    await client.query(
      "COMMIT",
    );

    return mapPayout(row);
  } catch (error) {
    await client.query(
      "ROLLBACK",
    );
    throw error;
  } finally {
    client.release();
  }
}
