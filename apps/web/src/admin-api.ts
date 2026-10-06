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

export type WinnerPayoutsResponse = {
  payouts: WinnerPayout[];
};

export type WinnerPayoutResponse = {
  payout: WinnerPayout | null;
};

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
 * ============================
 * ENTRY PAYMENTS
 * ============================
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

/**
 * ============================
 * WINNER PAYOUTS
 * ============================
 */

export async function getPendingWinnerPayouts(
  signal?: AbortSignal,
): Promise<WinnerPayoutsResponse> {
  return adminRequest<WinnerPayoutsResponse>(
    "/winner-payouts/admin/pending",
    {
      signal,
    },
  );
}

export async function approveWinnerPayout(
  payoutId: string,
  signal?: AbortSignal,
): Promise<WinnerPayoutResponse> {
  const normalizedPayoutId =
    payoutId.trim();

  if (!normalizedPayoutId) {
    throw new Error(
      "Payout ID is required.",
    );
  }

  return adminRequest<WinnerPayoutResponse>(
    `/winner-payouts/admin/${encodeURIComponent(
      normalizedPayoutId,
    )}/approve`,
    {
      method: "POST",
      signal,
    },
  );
}

export async function rejectWinnerPayout(
  payoutId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<WinnerPayoutResponse> {
  const normalizedPayoutId =
    payoutId.trim();

  const normalizedReason =
    reason.trim();

  if (!normalizedPayoutId) {
    throw new Error(
      "Payout ID is required.",
    );
  }

  if (!normalizedReason) {
    throw new Error(
      "Rejection reason is required.",
    );
  }

  if (normalizedReason.length > 500) {
    throw new Error(
      "Rejection reason is too long.",
    );
  }

  return adminRequest<WinnerPayoutResponse>(
    `/winner-payouts/admin/${encodeURIComponent(
      normalizedPayoutId,
    )}/reject`,
    {
      method: "POST",
      body: {
        reason: normalizedReason,
      },
      signal,
    },
  );
}

export async function markWinnerPayoutPaid(
  payoutId: string,
  paymentReference: string,
  signal?: AbortSignal,
): Promise<WinnerPayoutResponse> {
  const normalizedPayoutId =
    payoutId.trim();

  const normalizedReference =
    paymentReference.trim();

  if (!normalizedPayoutId) {
    throw new Error(
      "Payout ID is required.",
    );
  }

  if (!normalizedReference) {
    throw new Error(
      "Payment reference is required.",
    );
  }

  if (normalizedReference.length > 200) {
    throw new Error(
      "Payment reference is too long.",
    );
  }

  return adminRequest<WinnerPayoutResponse>(
    `/winner-payouts/admin/${encodeURIComponent(
      normalizedPayoutId,
    )}/paid`,
    {
      method: "POST",
      body: {
        paymentReference:
          normalizedReference,
      },
      signal,
    },
  );
}
