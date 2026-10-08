import {
  type ApiError,
} from "./api";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) || "https://addis-egata-api.onrender.com";

function getInitData(): string {
  const webApp =
    window.Telegram?.WebApp;

  if (webApp?.initData) {
    return webApp.initData;
  }

  const stored =
    sessionStorage.getItem(
      "addis-egata-telegram-init-data",
    );

  if (stored) {
    return stored;
  }

  throw new Error(
    "Telegram authentication data is unavailable.",
  );
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {},
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        method:
          options.method ?? "GET",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          "X-Telegram-Init-Data":
            getInitData(),
        },
        credentials: "include",
        body:
          options.body !==
          undefined
            ? JSON.stringify(
                options.body,
              )
            : undefined,
      },
    );

  const payload =
    (await response.json()) as
      | T
      | ApiError;

  if (!response.ok) {
    const error =
      payload as ApiError;

    throw new Error(
      error.message ||
        error.error ||
        `API request failed with status ${response.status}.`,
    );
  }

  return payload as T;
}

export type AdminWalletDeposit = {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: "telebirr";
  transactionReference: string;
  senderName: string | null;
  status:
    | "pending"
    | "approved"
    | "rejected";
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

export async function getPendingWalletDeposits(): Promise<{
  deposits: AdminWalletDeposit[];
}> {
  return request(
    "/admin/payments/wallet/deposits/pending",
  );
}

export async function approveWalletDeposit(
  depositId: string,
) {
  return request(
    `/admin/payments/wallet/deposits/${encodeURIComponent(
      depositId,
    )}/approve`,
    {
      method: "POST",
    },
  );
}

export async function rejectWalletDeposit(
  depositId: string,
  rejectionReason: string,
) {
  return request(
    `/admin/payments/wallet/deposits/${encodeURIComponent(
      depositId,
    )}/reject`,
    {
      method: "POST",
      body: {
        rejectionReason,
      },
    },
  );
}
