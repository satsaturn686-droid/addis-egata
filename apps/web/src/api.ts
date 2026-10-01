const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) || "";

export type ApiError = {
  error?: string;
  message?: string;
};

export type TelegramAuthResponse = {
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    isAdmin: boolean;
  };
  telegram: {
    authDate: number;
    queryId: string | null;
  };
};

export type Draw = {
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
  startsAt: string | null;
  deadlineAt: string | null;
  drawAt: string | null;
  status:
    | "draft"
    | "open"
    | "full"
    | "closed"
    | "drawing"
    | "completed"
    | "cancelled";
  filledNumbers: number;
};

export type DrawPrize = {
  id: string;
  drawId: string;
  rank: number;
  prizeAmount: number;
  createdAt: string;
};

export type DrawResponse = {
  draw: Draw;
  prizes: DrawPrize[];
};

export type DrawListResponse = {
  draws: Draw[];
};

export type EntryStatus =
  | "reserved"
  | "pending_payment"
  | "paid"
  | "rejected"
  | "expired";

export type Entry = {
  id: string;
  drawId: string;
  userId: string;
  number: number;
  status: EntryStatus;
  reservedUntil: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntriesResponse = {
  entries: Entry[];
};

export type EntryResponse = {
  entry: Entry;
};

export type ReserveNumberResponse = {
  entry: Entry;
  reservationMinutes: number;
};

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

function getTelegramInitData(): string {
  const webApp = window.Telegram?.WebApp;

  if (!webApp?.initData) {
    throw new Error(
      "Telegram authentication data is unavailable.",
    );
  }

  return webApp.initData;
}

async function request<T>(
  path: string,
  options: ApiRequestOptions = {},
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

export async function getCurrentUser(
  signal?: AbortSignal,
): Promise<TelegramAuthResponse> {
  return request<TelegramAuthResponse>(
    "/auth/me",
    {
      signal,
    },
  );
}

export async function getDraws(
  signal?: AbortSignal,
): Promise<DrawListResponse> {
  return request<DrawListResponse>(
    "/draws",
    {
      signal,
    },
  );
}

export async function getDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<DrawResponse> {
  if (!drawId.trim()) {
    throw new Error("Draw ID is required.");
  }

  return request<DrawResponse>(
    `/draws/${encodeURIComponent(drawId)}`,
    {
      signal,
    },
  );
}

export async function getMyEntries(
  signal?: AbortSignal,
): Promise<EntriesResponse> {
  return request<EntriesResponse>(
    "/entries/mine",
    {
      signal,
    },
  );
}

export async function reserveNumber(
  drawId: string,
  number: number,
  signal?: AbortSignal,
): Promise<ReserveNumberResponse> {
  if (!drawId.trim()) {
    throw new Error("Draw ID is required.");
  }

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error("A valid number is required.");
  }

  return request<ReserveNumberResponse>(
    "/entries/reserve",
    {
      method: "POST",
      body: {
        drawId,
        number,
      },
      signal,
    },
  );
}

export async function getEntry(
  entryId: string,
  signal?: AbortSignal,
): Promise<EntryResponse> {
  if (!entryId.trim()) {
    throw new Error("Entry ID is required.");
  }

  return request<EntryResponse>(
    `/entries/${encodeURIComponent(entryId)}`,
    {
      signal,
    },
  );
}
