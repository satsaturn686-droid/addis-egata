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
          ...(options.body !==
          undefined
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),
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

export type Wallet = {
  id: string;
  userId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletDeposit = {
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
};

export type WalletResponse = {
  wallet: Wallet;
};

export type WalletDepositResponse = {
  deposit: WalletDeposit;
};

export type WalletPurchaseResponse = {
  result: {
    entryId: string;
    balance: number;
  };
};

export async function getWallet(): Promise<WalletResponse> {
  return request<WalletResponse>(
    "/payments/wallet",
  );
}

export async function createWalletDeposit(
  amount: number,
  transactionReference: string,
  senderName?: string,
): Promise<WalletDepositResponse> {
  return request<WalletDepositResponse>(
    "/payments/wallet/deposit/telebirr",
    {
      method: "POST",
      body: {
        amount,
        transactionReference,
        senderName,
      },
    },
  );
}

export async function purchaseEntryWithWallet(
  entryId: string,
): Promise<WalletPurchaseResponse> {
  return request<WalletPurchaseResponse>(
    "/payments/wallet/purchase",
    {
      method: "POST",
      body: {
        entryId,
      },
    },
  );
}
