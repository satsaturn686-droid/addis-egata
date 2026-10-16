import type { ApiError } from "./api";

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

async function adminDrawListRequest<T>(
  path: string,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const initData = getTelegramInitData();

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: "GET",
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

export type AdminDrawListItem = {
  id: string;
  name: string;
  description: string | null;
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  prizeDescription: string | null;
  displayedPrizeValue: number | null;
  actualPrizeCost: number | null;
  totalNumbers: number;
  entryFee: number;
  winnerCount: number;
  uniqueWinners: boolean;
  startsAt: string;
  deadlineAt: string;
  drawAt: string;
  status:
    | "draft"
    | "open"
    | "full"
    | "closed"
    | "drawing"
    | "completed"
    | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type AdminDrawListResponse = {
  draws: AdminDrawListItem[];
};

export async function getAdminDrawList(
  signal?: AbortSignal,
): Promise<AdminDrawListResponse> {
  return adminDrawListRequest<AdminDrawListResponse>(
    "/admin/draw-list",
    {
      signal,
    },
  );
}
