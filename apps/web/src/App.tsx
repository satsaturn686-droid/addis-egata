import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  clearAppSessionToken,
  createTelebirrPayment,
  getAppCurrentUser,
  getAppSessionToken,
  getCurrentUser,
  getDraw,
  getDraws,
  getMyEntries,
  getPaymentSettings,
  loginAppUser,
  registerAppUser,
  reserveNumber,
  type AppUser,
  type Draw,
  type DrawPrize,
  type Entry,
  type TelegramAuthResponse,
} from "./api";
import PublicResults from "./PublicResults";
import UserWalletButton from "./UserWalletButton";
import WalletPanel from "./WalletPanel";
type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
}
function formatDrawNumber(
  number: number,
  totalNumbers: number,
): string {
  const width = Math.max(
    2,
    String(Math.max(1, totalNumbers)).length,
  );

  return `#${String(number).padStart(width, "0")}`;
}
function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getEntryLabel(entry: Entry): string {
  switch (entry.status) {
    case "reserved":
      return "ተይዟል";
    case "pending_payment":
      return "ክፍያ በመጠባበቅ ላይ";
    case "paid":
      return "ተከፍሏል";
    case "rejected":
      return "ተቀባይነት አላገኘም";
    case "expired":
      return "ጊዜው አልፏል";
    default:
      return entry.status;
  }
}

function getFriendlyPaymentError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "";

  const normalized = message.toUpperCase();

  if (normalized.includes("DUPLICATE_TRANSACTION_REFERENCE")) {
    return "ይህ የTelebirr transaction reference ከዚህ በፊት ጥቅም ላይ ውሏል።";
  }

  if (normalized.includes("PAYMENT_ALREADY_PENDING")) {
    return "የዚህ ቁጥር ክፍያ አስቀድሞ ተልኳል።";
  }

  if (normalized.includes("RESERVATION_EXPIRED")) {
    return "የ30 ደቂቃ reservation ጊዜ አልፏል። እባክዎ ሌላ ቁጥር ይምረጡ።";
  }


  if (normalized.includes("ENTRY_NOT_PAYABLE")) {
    return "ይህ ቁጥር ለክፍያ አይገኝም።";
  }

  if (normalized.includes("INVALID_TRANSACTION_REFERENCE")) {
    return "ትክክለኛ የTelebirr transaction reference ያስገቡ።";
  }

  if (normalized.includes("TRANSACTION_REFERENCE_TOO_LONG")) {
    return "የtransaction reference መረጃው በጣም ረጅም ነው።";
  }

  return message || "ክፍያውን ማስገባት አልተቻለም።";
}

function App() {
  
const [user, setUser] =
  useState<AppUser | TelegramAuthResponse["user"] | null>(null);
    const [draws, setDraws] = useState<Draw[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
const [drawPrizes, setDrawPrizes] = useState<DrawPrize[]>([]);
  
  const [telebirrNumber, setTelebirrNumber] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [reservingNumber, setReservingNumber] =
    useState<number | null>(null);

  const [paymentSubmitting, setPaymentSubmitting] =
    useState(false);

  const [error, setError] = useState<string | null>(null);
  const [reservationError, setReservationError] =
    useState<string | null>(null);

  const [paymentError, setPaymentError] =
    useState<string | null>(null);

  const [paymentSuccess, setPaymentSuccess] =
    useState(false);

  const [paymentReference, setPaymentReference] =
    useState("");

  const [senderName, setSenderName] =
    useState("");

  const [telegramReady, setTelegramReady] =
    useState(false);

  const [selectedEntry, setSelectedEntry] =
    useState<Entry | null>(null);

  const [now, setNow] = useState(Date.now());
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  
useEffect(() => {
  const webApp = window.Telegram?.WebApp;
  const appToken = getAppSessionToken();
  const storedInitData = sessionStorage.getItem(
    "addis-egata-telegram-init-data",
  );

  const hasTelegramAuth = Boolean(
    webApp?.initData || storedInitData,
  );

  if (webApp && hasTelegramAuth) {
    if (webApp.initData) {
      sessionStorage.setItem(
        "addis-egata-telegram-init-data",
        webApp.initData,
      );
    }

    webApp.ready();
    webApp.expand();
    setTelegramReady(true);
  } else if (!appToken) {
    setNeedsLogin(true);
    setLoading(false);
    return;
  }

  const controller = new AbortController();

  async function loadApp() {
    try {
      setLoading(true);
      setError(null);

      const [userResponse, drawsResponse] = await Promise.all([
        appToken && !hasTelegramAuth
          ? getAppCurrentUser()
          : getCurrentUser(controller.signal),
        getDraws(controller.signal),
      ]);

      setUser(userResponse.user);
      setDraws(drawsResponse.draws);

      try {
        const paymentSettingsResponse = await getPaymentSettings(
          controller.signal,
        );
        setTelebirrNumber(
          paymentSettingsResponse.settings.telebirrNumber,
        );
      } catch {
        setTelebirrNumber("");
      }

      try {
        const entriesResponse = await getMyEntries(controller.signal);
        setEntries(entriesResponse.entries);
      } catch {
        setEntries([]);
      }
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        return;
      }

      if (!hasTelegramAuth) {
        clearAppSessionToken();
        setNeedsLogin(true);
        setAuthError(
          loadError instanceof Error
            ? loadError.message
            : "መግባት አልተቻለም። እንደገና ይሞክሩ።",
        );
      } else {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "መረጃውን መጫን አልተቻለም።",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  void loadApp();

  return () => controller.abort();
}, []);

  useEffect(() => {
    if (!telegramReady && !getAppSessionToken()) {
      return;
    }

    let active = true;

    const refreshPublicState = async () => {
      try {
        const [drawsResponse, entriesResponse] =
          await Promise.all([
            getDraws(),
            getMyEntries(),
          ]);

        if (!active) {
          return;
        }

        setDraws(drawsResponse.draws);
        setEntries(entriesResponse.entries);
      } catch {
        // Keep the current UI state when a background refresh fails.
      }
    };

    const timer = window.setInterval(() => {
      void refreshPublicState();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [telegramReady]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    if (
      selectedEntry.status === "reserved" &&
      selectedEntry.reservedUntil &&
      new Date(selectedEntry.reservedUntil).getTime() <= now
    ) {
      setSelectedEntry(null);
      setPaymentReference("");
      setSenderName("");
      setPaymentError(null);
      setReservationError(null);
      setPaymentSuccess(false);
    }
  }, [selectedEntry, now]);
  const activeDraw = useMemo(() => {
    return (
      draws.find(
        (draw) =>
          draw.status === "open" ||
          draw.status === "full",
      ) ?? null
    );
  }, [draws]);

    useEffect(() => {
    if (!activeDraw) {
      setDrawPrizes([]);
      return;
    }

    const controller = new AbortController();

    getDraw(activeDraw.id, controller.signal)
      .then((response) => {
        setDrawPrizes(
          [...response.prizes].sort(
            (a, b) => a.rank - b.rank,
          ),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDrawPrizes([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeDraw?.id]);
  const myActiveEntries = useMemo(() => {
    if (!activeDraw) {
      return [];
    }
    const currentTime = Date.now();

    return entries.filter((entry) => {
      if (entry.drawId !== activeDraw.id) {
        return false;
      }

      if (
        entry.status === "pending_payment" ||
        entry.status === "paid"
      ) {
        return true;
      }

      if (entry.status === "reserved") {
        return (
          !!entry.reservedUntil &&
          new Date(entry.reservedUntil).getTime() > currentTime
        );
      }

      return false;
    });
  }, [activeDraw, entries, now]);
  const myEntryByNumber = useMemo(() => {
    const map = new Map<number, Entry>();

    for (const entry of myActiveEntries) {
      map.set(entry.number, entry);
    }

    return map;
  }, [myActiveEntries]);
    const occupiedNumbers = useMemo(() => {
    if (!activeDraw) {
      return new Set<number>();
    }

    return new Set(
      activeDraw.occupiedNumbers ?? [],
    );
  }, [activeDraw]);

  const filledNumbers =
  activeDraw &&
  Number.isFinite(activeDraw.filledNumbers)
    ? activeDraw.filledNumbers
    : 0;

const numberBoardSummary = useMemo(() => {
  const total = activeDraw?.totalNumbers ?? 0;
  const filled = Math.min(
    total,
    Math.max(0, filledNumbers),
  );

  return {
    total,
    filled,
    available: Math.max(0, total - filled),
  };
}, [activeDraw, filledNumbers]);

  const progress = activeDraw
  ? Math.min(
      100,
      Math.round(
        (filledNumbers /
          Math.max(1, activeDraw.totalNumbers)) *
          100,
      ),
    )
  : 0;

  const displayName =
    user?.firstName ||
    user?.username ||
    "ተጫዋች";

  const selectedSecondsRemaining =
    selectedEntry?.reservedUntil
      ? Math.max(
          0,
          Math.ceil(
            (new Date(
              selectedEntry.reservedUntil,
            ).getTime() -
              now) /
              1000,
          ),
        )
      : 0;

  const selectedReservationExpired =
    selectedEntry?.status === "reserved" &&
    selectedSecondsRemaining <= 0;

  function selectEntry(entry: Entry) {
    setSelectedEntry(entry);
    setReservationError(null);
    setPaymentError(null);
    setPaymentSuccess(false);

    if (entry.status !== "reserved") {
      setPaymentReference("");
      setSenderName("");
    }
  }

  async function handleReserveNumber(number: number) {
    if (!activeDraw) {
      return;
    }

    const existingEntry =
      myEntryByNumber.get(number);

    if (existingEntry) {
      selectEntry(existingEntry);
      return;
    }
    if (occupiedNumbers.has(number)) {
      return;
    }
    if (activeDraw.status === "full") {
      return;
    }

    setReservingNumber(number);
    setReservationError(null);
    setPaymentError(null);
    setPaymentSuccess(false);

    try {
      const response = await reserveNumber(
        activeDraw.id,
        number,
      );

      setEntries((current) => [
        ...current.filter(
          (entry) => entry.id !== response.entry.id,
        ),
        response.entry,
      ]);

      selectEntry(response.entry);
    } catch (reserveError) {
      setReservationError(
        reserveError instanceof Error
          ? reserveError.message
          : "ይህን ቁጥር መያዝ አልተቻለም።",
      );
    } finally {
      setReservingNumber(null);
    }
  }

  async function handleSubmitPayment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.status !== "reserved") {
      return;
    }

    if (selectedReservationExpired) {
      setPaymentError(
        "የ30 ደቂቃ reservation ጊዜ አልፏል።",
      );
      return;
    }

    const reference = paymentReference.trim();
    const sender = senderName.trim();

    if (!reference) {
      setPaymentError(
        "የTelebirr transaction reference ያስገቡ።",
      );
      return;
    }

    if (reference.length > 200) {
      setPaymentError(
        "የtransaction reference መረጃው በጣም ረጅም ነው።",
      );
      return;
    }

    if (sender.length > 200) {
      setPaymentError(
        "የላኪው ስም በጣም ረጅም ነው።",
      );
      return;
    }

    setPaymentSubmitting(true);
    setPaymentError(null);
    setPaymentSuccess(false);

    try {
      await createTelebirrPayment({
        entryId: selectedEntry.id,
        transactionReference: reference,
        senderName: sender || undefined,
      });

      const updatedEntry: Entry = {
        ...selectedEntry,
        status: "pending_payment",
      };

      setEntries((current) =>
        current.map((entry) =>
          entry.id === selectedEntry.id
            ? updatedEntry
            : entry,
        ),
      );

      setSelectedEntry(updatedEntry);
      setPaymentReference("");
      setSenderName("");
      setPaymentSuccess(true);
    } catch (paymentSubmitError) {
      setPaymentError(
        getFriendlyPaymentError(
          paymentSubmitError,
        ),
      );
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function refreshEntries() {
    setLoadingEntries(true);

    try {
      const response = await getMyEntries();
      setEntries(response.entries);

      if (selectedEntry) {
        const refreshed =
          response.entries.find(
            (entry) =>
              entry.id === selectedEntry.id,
          );

        if (refreshed) {
          setSelectedEntry(refreshed);
        }
      }
    } catch {
      // Keep current state if refresh fails.
    } finally {
      setLoadingEntries(false);
    }
  }
async function handleAppAuth(
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();
  setAuthSubmitting(true);
  setAuthError(null);

  const identifier = loginIdentifier.trim();

  try {
    if (authMode === "register") {
      await registerAppUser({
        loginIdentifier: identifier,
        password: authPassword,
        firstName: authFirstName.trim() || undefined,
        lastName: authLastName.trim() || undefined,
      });
    }

    await loginAppUser(identifier, authPassword);
    window.location.reload();
  } catch (authSubmitError) {
    setAuthError(
      authSubmitError instanceof Error
        ? authSubmitError.message
        : "መግባት አልተቻለም። እንደገና ይሞክሩ።",
    );
  } finally {
    setAuthSubmitting(false);
  }
}
  if (loading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="brand">ADDIS ዕጣ</p>
            <p className="tagline">
              እድልህን ዲጂታል አድርግ
            </p>
          </div>
        </header>

        <section className="hero">
          <span className="status-badge">
            በመጫን ላይ
          </span>

          <h1>እንኳን ደህና መጡ</h1>

          <p className="hero-description">
            የዕጣ መረጃዎን በመጫን ላይ...
          </p>
        </section>

        <section className="draw-card">
          <div className="prize-placeholder">🎁</div>

          <div className="draw-info">
            <p className="eyebrow">ADDIS ዕጣ</p>
            <h2>እባክዎ ትንሽ ይጠብቁ</h2>
          </div>
        </section>
      </main>
    );
  }
if (needsLogin) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand">ADDIS ዕጣ</p>
          <p className="tagline">እድልህን ዲጂታል አድርግ</p>
        </div>
      </header>

      <section className="hero">
        <span className="status-badge">
          {authMode === "login" ? "መግቢያ" : "መመዝገቢያ"}
        </span>

        <h1>
          {authMode === "login"
            ? "ወደ መለያዎ ይግቡ"
            : "አዲስ መለያ ይፍጠሩ"}
        </h1>

        <p className="hero-description">
          በUsername ወይም በስልክ ቁጥር ይግቡ።
        </p>
      </section>

      <section className="draw-card">
        <form
          onSubmit={handleAppAuth}
          style={{ display: "grid", gap: "12px" }}
        >
          {authMode === "register" && (
            <>
              <input
                type="text"
                placeholder="ስም"
                autoComplete="given-name"
                value={authFirstName}
                onChange={(event) =>
                  setAuthFirstName(event.target.value)
                }
              />

              <input
                type="text"
                placeholder="የአባት ስም (ካለ)"
                autoComplete="family-name"
                value={authLastName}
                onChange={(event) =>
                  setAuthLastName(event.target.value)
                }
              />
            </>
          )}

          <input
            type="text"
            placeholder="Username ወይም ስልክ ቁጥር"
            autoComplete="username"
            required
            value={loginIdentifier}
            onChange={(event) =>
              setLoginIdentifier(event.target.value)
            }
          />

          <input
            type="password"
            placeholder="Password (ቢያንስ 8 ቁምፊ)"
            autoComplete={
              authMode === "login"
                ? "current-password"
                : "new-password"
            }
            minLength={8}
            maxLength={128}
            required
            value={authPassword}
            onChange={(event) =>
              setAuthPassword(event.target.value)
            }
          />

          {authError && (
            <p role="alert" className="error-message">
              {authError}
            </p>
          )}

          <button type="submit" disabled={authSubmitting}>
            {authSubmitting
              ? "እባክዎ ይጠብቁ..."
              : authMode === "login"
                ? "ግባ"
                : "መለያ ፍጠር"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setAuthMode((current) =>
              current === "login" ? "register" : "login",
            );
            setAuthError(null);
          }}
          style={{ marginTop: "12px" }}
        >
          {authMode === "login"
            ? "መለያ የለዎትም? ይመዝገቡ"
            : "መለያ አለዎት? ይግቡ"}
        </button>
      </section>
    </main>
  );
}
  if (error) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="brand">ADDIS ዕጣ</p>
            <p className="tagline">
              እድልህን ዲጂታል አድርግ
            </p>
          </div>
        </header>

        <section className="hero">
          <span className="status-badge">
            ማስጠንቀቂያ
          </span>

          <h1>መረጃው አልተገኘም</h1>

          <p className="hero-description">
            {error}
          </p>
        </section>

        <section className="draw-card">
          <div className="draw-info">
            <p className="eyebrow">እባክዎ</p>

            <h2>App ውስጥ እንደገና ይክፈቱ</h2>

            <p className="hero-description">
              Telegram ላይ ወደ Addis ዕጣ
              Mini App ተመልሰው በመግባት
              እንደገና ይሞክሩ።
            </p>
          </div>
        </section>
      </main>
    );
  }


  if (!activeDraw) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="brand">ADDIS ዕጣ</p>
            <p className="tagline">
              እድልህን ዲጂታል አድርግ
            </p>
          </div>
<UserWalletButton />
          <button
            className="profile-button"
            type="button"
            aria-label="መገለጫ"
          >
            👤
          </button>

          {user?.isAdmin && (
            <button
              type="button"
              className="profile-button"
              aria-label="Admin"
              onClick={() => {
                const initData =
                  window.Telegram?.WebApp?.initData;

                if (initData) {
                  sessionStorage.setItem(
                    "addis-egata-telegram-init-data",
                    initData,
                  );
                }

                window.location.href = "/admin.html";
              }}
            >
              🔐
            </button>
          )}
        </header>

        <section className="hero">
          <span className="status-badge">
            {telegramReady ? "ዝግጁ" : "Telegram"}
          </span>

          <h1>ሰላም {displayName} 👋</h1>

          <p className="hero-description">
            በአሁኑ ጊዜ ክፍት የሆነ ዕጣ የለም።
            አዲስ ዕጣ ሲከፈት እዚህ
            ይመለከታሉ።
          </p>
        </section>

        <section className="draw-card">
          <div className="prize-placeholder">🎟️</div>

          <div className="draw-info">
            <p className="eyebrow">ADDIS ዕጣ</p>
            <h2>ቀጣዩን ዕጣ ይጠብቁ</h2>
          </div>
        </section>

        <PublicResults />
      </main>
    );
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand">ADDIS ዕጣ</p>
          <p className="tagline">
            እድልህን ዲጂታል አድርግ
          </p>
        </div>
<UserWalletButton />
        <button
          className="profile-button"
          type="button"
          aria-label="መገለጫ"
        >
          👤
        </button>
        {user?.isAdmin && (
  <button
    type="button"
    className="profile-button"
    aria-label="Admin"
    onClick={() => {
  const initData =
    window.Telegram?.WebApp?.initData;

  if (initData) {
    sessionStorage.setItem(
      "addis-egata-telegram-init-data",
      initData,
    );
  }

  window.location.href = "/admin.html";
}}
  >
    🔐
  </button>
)}
      </header>

      <section className="hero">
        <span className="status-badge">
          {activeDraw.status === "full"
            ? "ሙሉ"
            : "ክፍት"}
        </span>

        <h1>{activeDraw.name}</h1>

        <p className="hero-description">
          ሰላም {displayName}። ቁጥርህን ምረጥ፣
          ክፍያህን አስገባ፣ ዕጣውን ተጠባበቅ።
        </p>
      </section>

      <section className="draw-card">
        {activeDraw.prizeImageUrl ? (
          <img
            src={activeDraw.prizeImageUrl}
            alt={activeDraw.prizeName}
            className="prize-placeholder"
            style={{
              width: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            className="prize-placeholder"
            aria-label="የሽልማት ምስል"
          >
            🎁
          </div>
        )}

        <div className="draw-info">
          <p className="eyebrow">የሽልማት</p>

          <h2>{activeDraw.prizeName}</h2>

          {activeDraw.prizeDescription && (
            <p className="hero-description">
              {activeDraw.prizeDescription}
            </p>
          )}
{activeDraw.displayedPrizeValue != null && (
  <div className="prize-value">
    <span>የሽልማት ዋጋ</span>
    <strong>
      {formatMoney(activeDraw.displayedPrizeValue)}
    </strong>
  </div>
)}
          
{drawPrizes.length > 0 && (
  <div className="prize-value">
    <span>የእያንዳንዱ ደረጃ ሽልማት</span>

    {drawPrizes.map((prize) => (
      <div key={prize.id}>
        <strong>
          {prize.rank === 1
            ? "🥇 1ኛ ደረጃ"
            : prize.rank === 2
              ? "🥈 2ኛ ደረጃ"
              : prize.rank === 3
                ? "🥉 3ኛ ደረጃ"
                : `${prize.rank}ኛ ደረጃ`}
          {" — "}
          {formatMoney(prize.amount)}
        </strong>
      </div>
    ))}
  </div>
)}

          <div className="stats">
            <div>
              <span>የመግቢያ ክፍያ</span>
              <strong>
                {formatMoney(activeDraw.entryFee)}
              </strong>
            </div>

            <div>
              <span>አሸናፊዎች</span>
              <strong>{activeDraw.winnerCount}</strong>
            </div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-label">
            <span>
              {activeDraw.filledNumbers}/
              {activeDraw.totalNumbers} ቁጥሮች
            </span>

            <strong>{numberBoardSummary.available} ቀሪ</strong>
          </div>

          <div
            className="progress-track"
            aria-label={`የተሞሉ ቁጥሮች ${progress}%`}
          >
            <div
              className="progress-value"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>
        </div>
      </section>

      <section className="draw-card">
        <div className="draw-info">
          <p className="eyebrow">ቁጥር ምርጫ</p>

          <h2>ቁጥርህን ምረጥ</h2>

          <p className="hero-description">
            ቁጥር ከመረጥክ በኋላ ለ30 ደቂቃ
            ይያዛል። በዚህ ጊዜ ውስጥ
            የTelebirr ክፍያህን ማስገባት
            አለብህ።
          </p>
        </div>

        {reservationError && (
          <div
            role="alert"
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "12px",
              background:
                "rgba(255, 80, 80, 0.10)",
              border:
                "1px solid rgba(255, 80, 80, 0.25)",
              color: "#ffb4b4",
              fontSize: "14px",
            }}
          >
            {reservationError}
          </div>
        )}

        <div
          style={{
            marginTop: "16px",
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "12px",
                opacity: 0.7,
              }}
            >
              👥 ተሳታፊዎች
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "4px",
              }}
            >
              {numberBoardSummary.filled} /{" "}
              {numberBoardSummary.total}
            </strong>
          </div>

          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "12px",
                opacity: 0.7,
              }}
            >
              🟢 ነፃ ቁጥሮች
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "4px",
              }}
            >
              {numberBoardSummary.available}
            </strong>
          </div>

          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "12px",
                opacity: 0.7,
              }}
            >
              💳 መግቢያ
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "4px",
              }}
            >
              {formatMoney(activeDraw.entryFee)}
            </strong>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(5, minmax(0, 1fr))",
            gap: "8px",
            marginTop: "12px",
          }}
        >
          {Array.from(
            {
              length: activeDraw.totalNumbers,
            },
            (_, index) => index + 1,
          ).map((number) => {
            const entry =
              myEntryByNumber.get(number);

            const isSelected =
              selectedEntry?.id === entry?.id;

            const isReserving =
              reservingNumber === number;

            const isOccupied =
              occupiedNumbers.has(number) && !entry;

            let background =
              "rgba(255,255,255,0.04)";

            let border =
              "1px solid rgba(255,255,255,0.10)";

            if (entry?.status === "paid") {
              background =
                "rgba(52,211,153,0.12)";
              border =
                "1px solid rgba(52,211,153,0.35)";
            } else if (
              entry?.status === "pending_payment"
            ) {
              background =
                "rgba(251,191,36,0.12)";
              border =
                "1px solid rgba(251,191,36,0.35)";
            } else if (
              entry?.status === "reserved"
            ) {
              background =
                "rgba(96,165,250,0.12)";
              border =
                "1px solid rgba(96,165,250,0.35)";
            }

            if (isSelected) {
              border = "2px solid currentColor";
            }

            return (
              <button
                key={number}
                type="button"
                disabled={
                  activeDraw.status === "full" ||
                  isReserving ||
                  isOccupied
                }
                onClick={() =>
                  void handleReserveNumber(number)
                }
                aria-label={
                  entry
                    ? `ቁጥር ${number} ${getEntryLabel(
                        entry,
                      )}`
                    : isOccupied
                      ? `ቁጥር ${number} ተይዟል`
                      : `ቁጥር ${number}`
                }
                style={{
                  minHeight: "48px",
                  borderRadius: "12px",
                  border,
                  background,
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor:
                    activeDraw.status === "full"
                      ? "not-allowed"
                      : "pointer",
                  opacity: isReserving ? 0.55 : 1,
                }}
              >
                {isReserving
                  ? "..."
                  : isOccupied
                    ? "🔒"
                    : formatDrawNumber(
                        number,
                        activeDraw.totalNumbers,
                      )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "16px",
            fontSize: "12px",
            opacity: 0.78,
          }}
        >
          <span>🟢 ክፍያ ተረጋግጧል</span>
          <span>🔵 ተይዟል</span>
          <span>🟡 ክፍያ በመጠባበቅ ላይ</span>
          <span>⚪ ነፃ</span>
        </div>

        <p
          className="hero-description"
          style={{
            marginTop: "12px",
            marginBottom: 0,
            fontSize: "12px",
          }}
        >
          🔒 የተቆለፈ ቁጥር በሌላ ተሳታፊ ተይዟል።
          የእርስዎን ቁጥር ብቻ ማየት እና መክፈት
          ይችላሉ። ቁጥሮቹ ሲሞሉ ዕጣው ይዘጋል።
        </p>
      </section>
      {selectedEntry && (
        <section className="draw-card">
          <div className="draw-info">
            <p className="eyebrow">የእኔ ቁጥር</p>

            <h2>
  {formatDrawNumber(
    selectedEntry.number,
    activeDraw.totalNumbers,
  )}
</h2>

            <p className="hero-description">
              {getEntryLabel(selectedEntry)}
            </p>
          </div>

          {selectedEntry.status === "reserved" &&
            selectedEntry.reservedUntil && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "16px",
                  borderRadius: "14px",
                  background:
                    selectedReservationExpired
                      ? "rgba(255,80,80,0.10)"
                      : "rgba(96,165,250,0.10)",
                  border:
                    selectedReservationExpired
                      ? "1px solid rgba(255,80,80,0.25)"
                      : "1px solid rgba(96,165,250,0.25)",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "12px",
                    opacity: 0.75,
                    marginBottom: "6px",
                  }}
                >
                  {selectedReservationExpired
                    ? "የreservation ጊዜ አልፏል"
                    : "የreservation ጊዜ ቀሪ"}
                </span>

                <strong
                  style={{
                    fontSize: "30px",
                    letterSpacing: "1px",
                  }}
                >
                  {formatTime(
                    selectedSecondsRemaining,
                  )}
                </strong>
              </div>
            )}
{selectedEntry.status === "reserved" &&
  !selectedReservationExpired && (
    <WalletPanel
      entryId={selectedEntry.id}
      entryFee={activeDraw.entryFee}
      telebirrNumber={telebirrNumber}
      onPurchased={(balance) => {
        const updatedEntry: Entry = {
          ...selectedEntry,
          status: "paid",
          reservedUntil: null,
          paidAt: new Date().toISOString(),
        };

        setEntries((current) =>
          current.map((entry) =>
            entry.id === selectedEntry.id
              ? updatedEntry
              : entry,
          ),
        );

        setSelectedEntry(updatedEntry);

        setPaymentError(null);
        setPaymentSuccess(false);
      }}
    />
  )}

          {paymentSuccess && (
            <div
              role="status"
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "14px",
                background:
                  "rgba(52,211,153,0.10)",
                border:
                  "1px solid rgba(52,211,153,0.25)",
              }}
            >
              <strong>
                ✓ ክፍያ ተልኳል
              </strong>

              <p
                className="hero-description"
                style={{
                  marginBottom: 0,
                  marginTop: "6px",
                }}
              >
                የክፍያ መረጃው ተመዝግቧል።
                Admin ክፍያውን እስኪያረጋግጥ
                ድረስ ቁጥርዎ በመጠባበቅ ላይ ነው።
              </p>
            </div>
          )}

          {selectedEntry.status ===
            "pending_payment" && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "14px",
                background:
                  "rgba(251,191,36,0.10)",
                border:
                  "1px solid rgba(251,191,36,0.25)",
              }}
            >
              <strong>
                ⏳ ክፍያ በመጠባበቅ ላይ
              </strong>

              <p
                className="hero-description"
                style={{
                  marginBottom: 0,
                  marginTop: "6px",
                }}
              >
                ክፍያህ ተልኳል። Admin
                እስኪያረጋግጥ ድረስ ቁጥሩ
                የተቆለፈ ነው።
              </p>
            </div>
          )}

          {selectedEntry.status === "paid" && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "14px",
                background:
                  "rgba(52,211,153,0.10)",
                border:
                  "1px solid rgba(52,211,153,0.25)",
              }}
            >
              <strong>
                ✓ ክፍያ ተረጋግጧል
              </strong>

              <p
                className="hero-description"
                style={{
                  marginBottom: 0,
                  marginTop: "6px",
                }}
              >
                ይህ ቁጥር ለዕጣው ተመዝግቧል።
              </p>
            </div>
          )}

          {selectedEntry.status === "reserved" &&
            selectedReservationExpired && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  borderRadius: "14px",
                  background:
                    "rgba(255,80,80,0.10)",
                  border:
                    "1px solid rgba(255,80,80,0.25)",
                }}
              >
                <strong>
                  የReservation ጊዜ አልፏል
                </strong>

                <p
                  className="hero-description"
                  style={{
                    marginBottom: 0,
                    marginTop: "6px",
                  }}
                >
                  ይህን ቁጥር ለክፍያ መጠቀም
                  አይችሉም። እባክዎ ሌላ ቁጥር
                  ይምረጡ።
                </p>
              </div>
            )}
        </section>
      )}
      
      <section className="draw-card">
        <div className="draw-info">
          <p className="eyebrow">የእኔ ቁጥሮች</p>

          <h2>{myActiveEntries.length} ቁጥር</h2>

          {myActiveEntries.length === 0 ? (
            <p className="hero-description">
              እስካሁን ምንም ቁጥር አልመረጥክም።
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "12px",
              }}
            >
              {myActiveEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() =>
                    selectEntry(entry)
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border:
                      "1px solid rgba(255,255,255,0.12)",
                    background:
                      "rgba(255,255,255,0.04)",
                    fontWeight: 700,
                  }}
                >
                                    {formatDrawNumber(
                    entry.number,
                    activeDraw.totalNumbers,
                  )}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void refreshEntries()}
            disabled={loadingEntries}
            style={{
              marginTop: "14px",
              padding: "9px 12px",
              borderRadius: "10px",
              border:
                "1px solid rgba(255,255,255,0.10)",
              background:
                "rgba(255,255,255,0.04)",
            }}
          >
            {loadingEntries
              ? "በመመርመር ላይ..."
              : "መረጃ አድስ"}
          </button>
        </div>
      </section>
      <PublicResults />
      <section className="quick-links">
        <button type="button">
          <span>🔢</span>
          <small>የእኔ ቁጥሮች</small>
        </button>

        <button type="button">
          <span>🏆</span>
          <small>አሸናፊዎች</small>
        </button>

        <button type="button">
          <span>ℹ️</span>
          <small>እንዴት ይሰራል?</small>
        </button>
      </section>

      <p className="development-note">
        {user?.isAdmin
          ? "Admin • Addis ዕጣ"
          : "Addis ዕጣ"}
      </p>
    </main>
  );
}

export default App;
