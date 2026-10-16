
import { pool } from "../db.js";

export const PAYMENT_TIME_ZONE = "Africa/Addis_Ababa";

export type PaymentSettings = {
  telebirrNumber: string;
  serviceEnabled: boolean;
  serviceOpenTime: string;
  serviceCloseTime: string;
  timezone: string;
  localTime: string;
  isOpen: boolean;
};

type PaymentSettingsRow = {
  telebirr_number: string;
  service_enabled: boolean;
  service_open_time: string;
  service_close_time: string;
};

type PaymentSettingsUpdate = {
  telebirrNumber: string;
  serviceEnabled: boolean;
  serviceOpenTime: string;
  serviceCloseTime: string;
};

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getLocalTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PAYMENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (!hour || !minute) {
    throw new Error("PAYMENT_LOCAL_TIME_UNAVAILABLE");
  }

  return `${hour}:${minute}`;
}

function isWithinServiceHours(
  enabled: boolean,
  openTime: string,
  closeTime: string,
  localTime: string,
): boolean {
  if (!enabled) {
    return false;
  }

  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const now = toMinutes(localTime);
  const opening = toMinutes(openTime);
  const closing = toMinutes(closeTime);

  if (opening === closing) {
    return false;
  }

  if (opening < closing) {
    return now >= opening && now < closing;
  }

  return now >= opening || now < closing;
}

function mapPaymentSettings(
  row: PaymentSettingsRow,
): PaymentSettings {
  const serviceOpenTime = normalizeTime(row.service_open_time);
  const serviceCloseTime = normalizeTime(row.service_close_time);
  const localTime = getLocalTime();

  return {
    telebirrNumber: row.telebirr_number,
    serviceEnabled: row.service_enabled,
    serviceOpenTime,
    serviceCloseTime,
    timezone: PAYMENT_TIME_ZONE,
    localTime,
    isOpen: isWithinServiceHours(
      row.service_enabled,
      serviceOpenTime,
      serviceCloseTime,
      localTime,
    ),
  };
}

function defaultPaymentSettings(): PaymentSettings {
  const localTime = getLocalTime();
  const serviceOpenTime = "09:00";
  const serviceCloseTime = "18:00";

  return {
    telebirrNumber: "",
    serviceEnabled: true,
    serviceOpenTime,
    serviceCloseTime,
    timezone: PAYMENT_TIME_ZONE,
    localTime,
    isOpen: isWithinServiceHours(
      true,
      serviceOpenTime,
      serviceCloseTime,
      localTime,
    ),
  };
}

function validateAdminUserId(adminUserId: string): void {
  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }
}

function validateSettings(input: PaymentSettingsUpdate): void {
  if (!input.telebirrNumber.trim()) {
    throw new Error("TELEBIRR_NUMBER_REQUIRED");
  }

  if (input.telebirrNumber.trim().length > 100) {
    throw new Error("TELEBIRR_NUMBER_TOO_LONG");
  }

  if (typeof input.serviceEnabled !== "boolean") {
    throw new Error("INVALID_PAYMENT_SERVICE_STATUS");
  }

  if (
    !isValidTime(input.serviceOpenTime) ||
    !isValidTime(input.serviceCloseTime)
  ) {
    throw new Error("INVALID_PAYMENT_SERVICE_TIME");
  }

  if (input.serviceOpenTime === input.serviceCloseTime) {
    throw new Error("PAYMENT_SERVICE_HOURS_CANNOT_MATCH");
  }
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const result = await pool.query<PaymentSettingsRow>(`
    SELECT
      telebirr_number,
      service_enabled,
      TO_CHAR(service_open_time, 'HH24:MI') AS service_open_time,
      TO_CHAR(service_close_time, 'HH24:MI') AS service_close_time
    FROM payment_settings
    WHERE id = 1
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return defaultPaymentSettings();
  }

  return mapPaymentSettings(result.rows[0]);
}

export async function updateTelebirrNumber(
  telebirrNumber: string,
  adminUserId: string,
): Promise<PaymentSettings> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  const normalizedNumber = telebirrNumber.trim();

  if (!normalizedNumber) {
    throw new Error("TELEBIRR_NUMBER_REQUIRED");
  }

  if (normalizedNumber.length > 100) {
    throw new Error("TELEBIRR_NUMBER_TOO_LONG");
  }

  validateAdminUserId(adminUserId);

  await pool.query(
    `
      INSERT INTO payment_settings (
        id,
        telebirr_number,
        updated_by,
        updated_at
      )
      VALUES (1, $1, $2, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        telebirr_number = EXCLUDED.telebirr_number,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
    [normalizedNumber, adminUserId],
  );

  return getPaymentSettings();
}

export async function updatePaymentSettings(
  input: PaymentSettingsUpdate,
  adminUserId: string,
): Promise<PaymentSettings> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  validateAdminUserId(adminUserId);

  const normalizedInput = {
    ...input,
    telebirrNumber: input.telebirrNumber.trim(),
    serviceOpenTime: input.serviceOpenTime.trim(),
    serviceCloseTime: input.serviceCloseTime.trim(),
  };

  validateSettings(normalizedInput);

  await pool.query(
    `
      INSERT INTO payment_settings (
        id,
        telebirr_number,
        updated_by,
        updated_at,
        service_enabled,
        service_open_time,
        service_close_time
      )
      VALUES (
        1, $1, $2, NOW(), $3, $4::time, $5::time
      )
      ON CONFLICT (id)
      DO UPDATE SET
        telebirr_number = EXCLUDED.telebirr_number,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW(),
        service_enabled = EXCLUDED.service_enabled,
        service_open_time = EXCLUDED.service_open_time,
        service_close_time = EXCLUDED.service_close_time
    `,
    [
      normalizedInput.telebirrNumber,
      adminUserId,
      normalizedInput.serviceEnabled,
      normalizedInput.serviceOpenTime,
      normalizedInput.serviceCloseTime,
    ],
  );

  return getPaymentSettings();
}

export async function assertPaymentServiceOpen(): Promise<void> {
  const settings = await getPaymentSettings();

  if (!settings.serviceEnabled) {
    throw new Error("PAYMENT_SERVICE_DISABLED");
  }

  if (!settings.isOpen) {
    throw new Error("PAYMENT_SERVICE_CLOSED");
  }
}
