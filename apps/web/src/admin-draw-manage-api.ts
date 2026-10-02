import type {
  ApiError,
  Draw,
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

async function adminManageRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const initData = getTelegramInitData();

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Telegram-Init-Data": initData,
      },
      credentials: "include",
      signal: options.signal,
    },
  );

  let payload: unknown = null;

  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
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

export type AdminDrawListResponse = {
  draws: Draw[];
};

export type AdminDrawExecutionResponse = {
  result: {
    drawId: string;
    eligibleEntryCount: number;
    winners: Array<{
      id: string;
      drawId: string;
      entryId: string;
      userId: string;
      rank: number;
      prizeAmount: number;
      selectedAt: string;
    }>;
    executedAt: string;
    publishedAt: string;
  };
};

export type AdminDrawNumberStatus =
  | "available"
  | "reserved"
  | "pending_payment"
  | "paid";

export type AdminDrawNumber = {
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
    status:
      | "pending"
      | "approved"
      | "rejected";
    transactionReference: string;
    createdAt: string;
  } | null;
};

export type AdminDrawNumbersResponse = {
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
};

export async function getAdminOpenDraws(
  signal?: AbortSignal,
): Promise<AdminDrawListResponse> {
  return adminManageRequest<AdminDrawListResponse>(
    "/draws",
    {
      method: "GET",
      signal,
    },
  );
}

export async function openAdminDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<{
  draw: Draw;
}> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminManageRequest<{
    draw: Draw;
  }>(
    `/admin/draws/${encodeURIComponent(
      normalizedDrawId,
    )}/open`,
    {
      method: "POST",
      signal,
    },
  );
}

export async function closeManagedDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<{
  draw: Draw;
}> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminManageRequest<{
    draw: Draw;
  }>(
    `/admin/draws/${encodeURIComponent(
      normalizedDrawId,
    )}/close`,
    {
      method: "POST",
      signal,
    },
  );
}

export async function executeManagedDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<AdminDrawExecutionResponse> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminManageRequest<AdminDrawExecutionResponse>(
    `/admin/draw-execution/${encodeURIComponent(
      normalizedDrawId,
    )}/execute`,
    {
      method: "POST",
      signal,
    },
  );
}

export async function getAdminDrawNumbers(
  drawId: string,
  signal?: AbortSignal,
): Promise<AdminDrawNumbersResponse> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminManageRequest<AdminDrawNumbersResponse>(
    `/admin/draw-numbers/${encodeURIComponent(
      normalizedDrawId,
    )}/numbers`,
    {
      method: "GET",
      signal,
    },
  );
}
