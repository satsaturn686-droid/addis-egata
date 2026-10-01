import type {
  ApiError,
  Payment,
  PaymentSettingsResponse,
  PaymentsResponse,
  PaymentResponse,
} from "./api";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) || "";

function getTelegramInitData(): string {
  const webApp = window.Telegram?.WebApp;

  if (webApp?.initData) {
    return webApp.initData;
  }

  const storedInitData =
    sessionStorage.getItem(
      "addis-egata-telegram-init-data",
    );

  if (storedInitData) {
    return storedInitData;
  }

  throw new Error(
    "Telegram authentication data is unavailable.",
  );
}

async function adminRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const initData = getTelegramInitData();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Telegram-Init-Data": initData,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body:
        options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      signal: options.signal,
    },
  );

  let payload: unknown = null;

  const contentType =
    response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const errorPayload =
      payload as ApiError | null;

    throw new Error(
      errorPayload?.message ||
        errorPayload?.error ||
        `API request failed with status ${response.status}.`,
    );
  }

  return payload as T;
}

/**
 * Load all payments currently waiting for
 * manual admin verification.
 */
export async function getPendingPayments(
  signal?: AbortSignal,
): Promise<PaymentsResponse> {
  return adminRequest<PaymentsResponse>(
    "/admin/payments/pending",
    {
      signal,
    },
  );
}

/**
 * Approve a pending Telebirr payment.
 */
export async function approvePayment(
  paymentId: string,
  signal?: AbortSignal,
): Promise<PaymentResponse> {
  const normalizedPaymentId =
    paymentId.trim();

  if (!normalizedPaymentId) {
    throw new Error(
      "Payment ID is required.",
    );
  }

  return adminRequest<PaymentResponse>(
    `/admin/payments/${encodeURIComponent(
      normalizedPaymentId,
    )}/approve`,
    {
      method: "POST",
      signal,
    },
  );
}

/**
 * Reject a pending Telebirr payment.
 */
export async function rejectPayment(
  paymentId: string,
  rejectionReason?: string,
  signal?: AbortSignal,
): Promise<PaymentResponse> {
  const normalizedPaymentId =
    paymentId.trim();

  const normalizedReason =
    rejectionReason?.trim() || undefined;

  if (!normalizedPaymentId) {
    throw new Error(
      "Payment ID is required.",
    );
  }

  if (
    normalizedReason &&
    normalizedReason.length > 500
  ) {
    throw new Error(
      "Rejection reason is too long.",
    );
  }

  return adminRequest<PaymentResponse>(
    `/admin/payments/${encodeURIComponent(
      normalizedPaymentId,
    )}/reject`,
    {
      method: "POST",
      body: normalizedReason
        ? {
            rejectionReason:
              normalizedReason,
          }
        : {},
      signal,
    },
  );
}

/**
 * Load the current payment settings.
 */
export async function getAdminPaymentSettings(
  signal?: AbortSignal,
): Promise<PaymentSettingsResponse> {
  return adminRequest<PaymentSettingsResponse>(
    "/admin/payments/settings",
    {
      signal,
    },
  );
}

/**
 * Update the Telebirr receiving number.
 */
export async function updateTelebirrNumber(
  telebirrNumber: string,
  signal?: AbortSignal,
): Promise<PaymentSettingsResponse> {
  const normalizedNumber =
    telebirrNumber.trim();

  if (!normalizedNumber) {
    throw new Error(
      "Telebirr number is required.",
    );
  }

  if (normalizedNumber.length > 100) {
    throw new Error(
      "Telebirr number is too long.",
    );
  }

  return adminRequest<PaymentSettingsResponse>(
    "/admin/payments/settings",
    {
      method: "POST",
      body: {
        telebirrNumber:
          normalizedNumber,
      },
      signal,
    },
  );
}
