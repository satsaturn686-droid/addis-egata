import type {
  ApiError,
  Draw,
  DrawPrize,
} from "./api";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) ||
  "https://addis-egata-api.onrender.com";

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

async function adminDrawRequest<T>(
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

export type AdminPrizeInput = {
  rank: number;
  amount: number;
};

export type CreateAdminDrawInput = {
  name: string;
  description?: string;
  prizeType: "cash" | "physical";
  prizeName: string;
  prizeImageUrl?: string;
  prizeDescription?: string;
  displayedPrizeValue?: number;
  actualPrizeCost?: number;
  totalNumbers: number;
  entryFee: number;
  winnerCount: number;
  uniqueWinners?: boolean;
  startsAt?: string;
  drawAt?: string;
  prizes: AdminPrizeInput[];
};

export type AdminDrawResponse = {
  draw: Draw;
  prizes: DrawPrize[];
};

export async function createAdminDraw(
  input: CreateAdminDrawInput,
  signal?: AbortSignal,
): Promise<AdminDrawResponse> {
  const name = input.name.trim();
  const prizeName = input.prizeName.trim();

  if (!name) {
    throw new Error("Draw name is required.");
  }

  if (!prizeName) {
    throw new Error("Prize name is required.");
  }

  if (
    !Number.isInteger(input.totalNumbers) ||
    input.totalNumbers < 5
  ) {
    throw new Error(
      "Total numbers must be at least 5.",
    );
  }

  if (
    !Number.isFinite(input.entryFee) ||
    input.entryFee <= 0
  ) {
    throw new Error(
      "Entry fee must be greater than 0.",
    );
  }

  if (
    !Number.isInteger(input.winnerCount) ||
    input.winnerCount < 5 ||
    input.winnerCount > input.totalNumbers
  ) {
    throw new Error(
      "Winner count must be at least 5 and cannot exceed total numbers.",
    );
  }

  if (input.prizes.length !== input.winnerCount) {
    throw new Error(
      "Prize count must match winner count.",
    );
  }

  const prizes = input.prizes.map(
    (prize, index) => {
      const rank = index + 1;

      if (
        prize.rank !== rank ||
        !Number.isInteger(prize.rank)
      ) {
        throw new Error(
          "Prize ranks must be sequential.",
        );
      }

      if (
        !Number.isFinite(prize.amount) ||
        prize.amount < 0
      ) {
        throw new Error(
          `Prize amount for rank ${rank} is invalid.`,
        );
      }

      return {
        rank,
        amount:
          Math.round(prize.amount * 100) / 100,
      };
    },
  );

  return adminDrawRequest<AdminDrawResponse>(
    "/admin/draws",
    {
      method: "POST",
      body: {
        name,
        ...(input.description?.trim()
          ? {
              description:
                input.description.trim(),
            }
          : {}),
        prizeType: input.prizeType,
        prizeName,
        ...(input.prizeImageUrl?.trim()
          ? {
              prizeImageUrl:
                input.prizeImageUrl.trim(),
            }
          : {}),
        ...(input.prizeDescription?.trim()
          ? {
              prizeDescription:
                input.prizeDescription.trim(),
            }
          : {}),
        ...(input.displayedPrizeValue !==
        undefined
          ? {
              displayedPrizeValue:
                input.displayedPrizeValue,
            }
          : {}),
        ...(input.actualPrizeCost !==
        undefined
          ? {
              actualPrizeCost:
                input.actualPrizeCost,
            }
          : {}),
        totalNumbers:
          input.totalNumbers,
        entryFee:
          input.entryFee,
        winnerCount:
          input.winnerCount,
        uniqueWinners:
          input.uniqueWinners ?? true,
        ...(input.startsAt
          ? {
              startsAt:
                input.startsAt,
            }
          : {}),
        ...(input.drawAt
          ? {
              drawAt:
                input.drawAt,
            }
          : {}),
        prizes,
      },
      signal,
    },
  );
}

export async function openAdminDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<AdminDrawResponse> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminDrawRequest<AdminDrawResponse>(
    `/admin/draws/${encodeURIComponent(
      normalizedDrawId,
    )}/open`,
    {
      method: "POST",
      signal,
    },
  );
}

export async function closeAdminDraw(
  drawId: string,
  signal?: AbortSignal,
): Promise<AdminDrawResponse> {
  const normalizedDrawId =
    drawId.trim();

  if (!normalizedDrawId) {
    throw new Error(
      "Draw ID is required.",
    );
  }

  return adminDrawRequest<AdminDrawResponse>(
    `/admin/draws/${encodeURIComponent(
      normalizedDrawId,
    )}/close`,
    {
      method: "POST",
      signal,
    },
  );
}
