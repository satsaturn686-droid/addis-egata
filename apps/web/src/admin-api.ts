import type {
  ApiError,
  Payment,
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

  if (!webApp?.initData) {
    throw new Error(
      "Telegram authentication data is unavailable.",
    );
  }

  return webApp.initData;
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
 *
 * The backend requires a rejection reason.
 */
export async function rejectPayment(
  paymentId: string,
  rejectionReason: string,
  signal?: AbortSignal,
): Promise<PaymentResponse> {
  const normalizedPaymentId =
    paymentId.trim();

  const normalizedReason =
    rejectionReason.trim();

  if (!normalizedPaymentId) {
    throw new Error(
      "Payment ID is required.",
    );
  }

  if (!normalizedReason) {
    throw new Error(
      "Rejection reason is required.",
    );
  }

  return adminRequest<PaymentResponse>(
    `/admin/payments/${encodeURIComponent(
      normalizedPaymentId,
    )}/reject`,
    {
      method: "POST",
      body: {
        rejectionReason:
          normalizedReason,
      },
      signal,
    },
  );
}

/**
 * Type guard for a payment object.
 */
export function isPayment(
  value: unknown,
): value is Payment {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const payment =
    value as Record<string, unknown>;

  return (
    typeof payment.id === "string" &&
    typeof payment.entryId === "string" &&
    typeof payment.userId === "string" &&
    typeof payment.amount === "number" &&
    payment.paymentMethod === "telebirr" &&
    typeof payment.transactionReference ===
      "string" &&
    typeof payment.status === "string"
  );
}
