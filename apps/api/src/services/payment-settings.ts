import { pool } from "../db.js";

export type PaymentSettings = {
  telebirrNumber: string;
};

type PaymentSettingsRow = {
  telebirr_number: string;
};

function mapPaymentSettings(
  row: PaymentSettingsRow,
): PaymentSettings {
  return {
    telebirrNumber: row.telebirr_number,
  };
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const result =
    await pool.query<PaymentSettingsRow>(
      `
        SELECT
          telebirr_number
        FROM payment_settings
        WHERE id = 1
        LIMIT 1
      `,
    );

  if (result.rows.length === 0) {
    return {
      telebirrNumber: "",
    };
  }

  return mapPaymentSettings(
    result.rows[0],
  );
}

export async function updateTelebirrNumber(
  telebirrNumber: string,
  adminUserId: string,
): Promise<PaymentSettings> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const normalizedNumber =
    telebirrNumber.trim();

  if (!normalizedNumber) {
    throw new Error(
      "TELEBIRR_NUMBER_REQUIRED",
    );
  }

  if (normalizedNumber.length > 100) {
    throw new Error(
      "TELEBIRR_NUMBER_TOO_LONG",
    );
  }

  if (!adminUserId.trim()) {
    throw new Error(
      "INVALID_ADMIN_USER_ID",
    );
  }

  const result =
    await pool.query<PaymentSettingsRow>(
      `
        INSERT INTO payment_settings (
          id,
          telebirr_number,
          updated_by,
          updated_at
        )
        VALUES (
          1,
          $1,
          $2,
          NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          telebirr_number = EXCLUDED.telebirr_number,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING
          telebirr_number
      `,
      [
        normalizedNumber,
        adminUserId,
      ],
    );

  return mapPaymentSettings(
    result.rows[0],
  );
}
