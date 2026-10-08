const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) || "https://addis-egata-api.onrender.com";
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
  occupiedNumbers: number[];
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

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected";

export type Payment = {
  id: string;
  entryId: string;
  userId: string;
  amount: number;
  paymentMethod: "telebirr";
  transactionReference: string;
  senderName: string | null;
  receiptImageUrl: string | null;
  status: PaymentStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentsResponse = {
  payments: Payment[];
};

export type PaymentResponse = {
  payment: Payment;
};

export type PaymentSettings = {
  telebirrNumber: string;
};

export type PaymentSettingsResponse = {
  settings: PaymentSettings;
};

export type CreateTelebirrPaymentInput = {
  entryId: string;
  transactionReference: string;
  senderName?: string;
  receiptImageUrl?: string;
};

export type PublicWinner = {
  id: string;
  rank: number;
  number: number;
  prizeAmount: number;
  selectedAt: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
};

export type PublicDrawResult = {
  drawId: string;
  drawName: string;
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  displayedPrizeValue: number | null;
  winnerCount: number;
  eligibleEntryCount: number;
  executedAt: string;
  publishedAt: string;
  winners: PublicWinner[];
};

export type PublicDrawResultResponse = {
  result: PublicDrawResult;
};

export type PublishedResultsResponse = {
  results: PublicDrawResult[];
};

export type LiveDrawState = {
  drawId: string;
  drawName: string;
  status: "drawing" | "completed";
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl: string | null;
  displayedPrizeValue: number | null;
  winnerCount: number;
  eligibleEntryCount: number;
  executedAt: string;
  publishedAt: string | null;
  revealedWinnerCount: number;
  totalWinnerCount: number;
  winners: PublicWinner[];
};

export type LiveDrawResponse = {
  live: LiveDrawState;
};

export type CurrentLiveDrawResponse = {
  live: LiveDrawState | null;
};

export type WinnerClaimLinkResponse = {
  claimUrl: string;
  payout: {
    id: string;
    winnerId: string;
    drawId: string;
    drawName: string;
    number: number;
    rank: number;
    prizeAmount: number;
    status: string;
  };
};

export type ApiRequestOptions = {
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
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

async function publicRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
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
      cache: "no-store",
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

export async function createTelebirrPayment(
  input: CreateTelebirrPaymentInput,
  signal?: AbortSignal,
): Promise<PaymentResponse> {
  const entryId = input.entryId.trim();

  const transactionReference =
    input.transactionReference.trim();

  const senderName =
    input.senderName?.trim() || undefined;

  const receiptImageUrl =
    input.receiptImageUrl?.trim() || undefined;

  if (!entryId) {
    throw new Error("Entry ID is required.");
  }

  if (!transactionReference) {
    throw new Error(
      "Telebirr transaction reference is required.",
    );
  }

  if (transactionReference.length > 200) {
    throw new Error(
      "Transaction reference is too long.",
    );
  }

  if (
    senderName &&
    senderName.length > 200
  ) {
    throw new Error(
      "Sender name is too long.",
    );
  }

  if (
    receiptImageUrl &&
    receiptImageUrl.length > 2000
  ) {
    throw new Error(
      "Receipt image URL is too long.",
    );
  }

  return request<PaymentResponse>(
    "/payments/telebirr",
    {
      method: "POST",
      body: {
        entryId,
        transactionReference,
        ...(senderName
          ? { senderName }
          : {}),
        ...(receiptImageUrl
          ? { receiptImageUrl }
          : {}),
      },
      signal,
    },
  );
}

export async function getMyPayments(
  signal?: AbortSignal,
): Promise<PaymentsResponse> {
  return request<PaymentsResponse>(
    "/payments/mine",
    {
      signal,
    },
  );
}

export async function getPaymentSettings(
  signal?: AbortSignal,
): Promise<PaymentSettingsResponse> {
  return request<PaymentSettingsResponse>(
    "/payments/settings",
    {
      signal,
    },
  );
}

export async function getPayment(
  paymentId: string,
  signal?: AbortSignal,
): Promise<PaymentResponse> {
  if (!paymentId.trim()) {
    throw new Error("Payment ID is required.");
  }

  return request<PaymentResponse>(
    `/payments/${encodeURIComponent(paymentId)}`,
    {
      signal,
    },
  );
}

export async function getPublishedResults(
  signal?: AbortSignal,
): Promise<PublishedResultsResponse> {
  return publicRequest<PublishedResultsResponse>(
    "/results",
    {
      signal,
    },
  );
}

export async function getCurrentLiveDrawState(
  signal?: AbortSignal,
): Promise<LiveDrawState | null> {
  const payload =
    await publicRequest<CurrentLiveDrawResponse>(
      "/results/live",
      {
        signal,
      },
    );

  return payload.live;
}

export async function getPublicDrawResult(
  drawId: string,
  signal?: AbortSignal,
): Promise<PublicDrawResultResponse> {
  if (!drawId.trim()) {
    throw new Error("Draw ID is required.");
  }

  return publicRequest<PublicDrawResultResponse>(
    `/results/${encodeURIComponent(drawId)}`,
    {
      signal,
    },
  );
}

export async function getLiveDrawState(
  drawId: string,
  signal?: AbortSignal,
): Promise<LiveDrawResponse> {
  if (!drawId.trim()) {
    throw new Error("Draw ID is required.");
  }

  return publicRequest<LiveDrawResponse>(
    `/results/live/${encodeURIComponent(drawId)}`,
    {
      signal,
    },
  );
}

export async function getWinnerClaimLink(
  winnerId: string,
  signal?: AbortSignal,
): Promise<WinnerClaimLinkResponse> {
  if (!winnerId.trim()) {
    throw new Error("Winner ID is required.");
  }

  return request<WinnerClaimLinkResponse>(
    `/winner-payouts/claim-link/${encodeURIComponent(winnerId)}`,
    {
      signal,
    },
  );
}
