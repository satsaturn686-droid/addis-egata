import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getCurrentUser,
  getDraws,
  getMyEntries,
  reserveNumber,
  type Draw,
  type Entry,
  type TelegramAuthResponse,
} from "./api";

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

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;
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

function App() {
  const [user, setUser] =
    useState<TelegramAuthResponse["user"] | null>(null);

  const [draws, setDraws] = useState<Draw[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [reservingNumber, setReservingNumber] =
    useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [reservationError, setReservationError] =
    useState<string | null>(null);

  const [telegramReady, setTelegramReady] = useState(false);
  const [selectedEntry, setSelectedEntry] =
    useState<Entry | null>(null);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      setError(
        "ይህ App በTelegram Mini App ውስጥ መከፈት አለበት።",
      );
      setLoading(false);
      return;
    }

    if (!webApp.initData) {
      setError(
        "የTelegram ማረጋገጫ መረጃ አልተገኘም። App ውስጥ እንደገና ይክፈቱ።",
      );
      setLoading(false);
      return;
    }

    webApp.ready();
    webApp.expand();
    setTelegramReady(true);

    const controller = new AbortController();

    async function loadApp() {
      try {
        setLoading(true);
        setError(null);

        const [userResponse, drawsResponse] =
          await Promise.all([
            getCurrentUser(controller.signal),
            getDraws(controller.signal),
          ]);

        setUser(userResponse.user);
        setDraws(drawsResponse.draws);

        try {
          const entriesResponse =
            await getMyEntries(controller.signal);

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

        const message =
          loadError instanceof Error
            ? loadError.message
            : "መረጃውን መጫን አልተቻለም።";

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadApp();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const activeDraw = useMemo(() => {
    return (
      draws.find(
        (draw) =>
          draw.status === "open" ||
          draw.status === "full",
      ) ?? null
    );
  }, [draws]);

  const myActiveEntries = useMemo(() => {
    if (!activeDraw) {
      return [];
    }

    return entries.filter(
      (entry) =>
        entry.drawId === activeDraw.id &&
        (entry.status === "reserved" ||
          entry.status === "pending_payment" ||
          entry.status === "paid"),
    );
  }, [activeDraw, entries]);

  const myEntryByNumber = useMemo(() => {
    const map = new Map<number, Entry>();

    for (const entry of myActiveEntries) {
      map.set(entry.number, entry);
    }

    return map;
  }, [myActiveEntries]);

  const remaining = activeDraw
    ? Math.max(
        0,
        activeDraw.totalNumbers -
          activeDraw.filledNumbers,
      )
    : 0;

  const progress = activeDraw
    ? Math.min(
        100,
        Math.round(
          (activeDraw.filledNumbers /
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
            ).getTime() - now) /
              1000,
          ),
        )
      : 0;

  const selectedReservationExpired =
    selectedEntry?.status === "reserved" &&
    selectedSecondsRemaining <= 0;

  async function handleReserveNumber(number: number) {
    if (!activeDraw) {
      return;
    }

    const existingEntry =
      myEntryByNumber.get(number);

    if (existingEntry) {
      setSelectedEntry(existingEntry);
      setReservationError(null);
      return;
    }

    if (activeDraw.status === "full") {
      return;
    }

    setReservingNumber(number);
    setReservationError(null);

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

      setSelectedEntry(response.entry);
    } catch (reserveError) {
      const message =
        reserveError instanceof Error
          ? reserveError.message
          : "ይህን ቁጥር መያዝ አልተቻለም።";

      setReservationError(message);
    } finally {
      setReservingNumber(null);
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
      // Keep the current UI state if refresh fails.
    } finally {
      setLoadingEntries(false);
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

          <h1>
            እንኳን ደህና መጡ
          </h1>

          <p className="hero-description">
            የዕጣ መረጃዎን በመጫን ላይ...
          </p>
        </section>

        <section className="draw-card">
          <div className="prize-placeholder">
            🎁
          </div>

          <div className="draw-info">
            <p className="eyebrow">
              ADDIS ዕጣ
            </p>

            <h2>
              እባክዎ ትንሽ ይጠብቁ
            </h2>
          </div>
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

          <h1>
            መረጃው አልተገኘም
          </h1>

          <p className="hero-description">
            {error}
          </p>
        </section>

        <section className="draw-card">
          <div className="draw-info">
            <p className="eyebrow">
              እባክዎ
            </p>

            <h2>
              App ውስጥ እንደገና ይክፈቱ
            </h2>

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

          <button
            className="profile-button"
            type="button"
            aria-label="መገለጫ"
          >
            👤
          </button>
        </header>

        <section className="hero">
          <span className="status-badge">
            {telegramReady ? "ዝግጁ" : "Telegram"}
          </span>

          <h1>
            ሰላም {displayName} 👋
          </h1>

          <p className="hero-description">
            በአሁኑ ጊዜ ክፍት የሆነ ዕጣ የለም።
            አዲስ ዕጣ ሲከፈት እዚህ
            ይመለከታሉ።
          </p>
        </section>

        <section className="draw-card">
          <div className="prize-placeholder">
            🎟️
          </div>

          <div className="draw-info">
            <p className="eyebrow">
              ADDIS ዕጣ
            </p>

            <h2>
              ቀጣዩን ዕጣ ይጠብቁ
            </h2>
          </div>
        </section>
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

        <button
          className="profile-button"
          type="button"
          aria-label="መገለጫ"
        >
          👤
        </button>
      </header>

      <section className="hero">
        <span className="status-badge">
          {activeDraw.status === "full"
            ? "ሙሉ"
            : "ክፍት"}
        </span>

        <h1>
          {activeDraw.name}
        </h1>

        <p className="hero-description">
          ሰላም {displayName}። ቁጥርህን ምረጥ፣
          የTelebirr ክፍያህን አረጋግጥ፣
          ዕጣውን ተጠባበቅ።
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
          <p className="eyebrow">
            የሽልማት
          </p>

          <h2>
            {activeDraw.prizeName}
          </h2>

          {activeDraw.prizeDescription && (
            <p className="hero-description">
              {activeDraw.prizeDescription}
            </p>
          )}

          <div className="stats">
            <div>
              <span>
                የመግቢያ ክፍያ
              </span>

              <strong>
                {formatMoney(activeDraw.entryFee)}
              </strong>
            </div>

            <div>
              <span>
                አሸናፊዎች
              </span>

              <strong>
                {activeDraw.winnerCount}
              </strong>
            </div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-label">
            <span>
              {activeDraw.filledNumbers}/
              {activeDraw.totalNumbers} ቁጥሮች
            </span>

            <strong>
              {remaining} ቀሪ
            </strong>
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
          <p className="eyebrow">
            ቁጥር ምርጫ
          </p>

          <h2>
            ቁጥርህን ምረጥ
          </h2>

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
            display: "grid",
            gridTemplateColumns:
              "repeat(5, minmax(0, 1fr))",
            gap: "8px",
            marginTop: "16px",
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

            const isMine = Boolean(entry);

            const isSelected =
              selectedEntry?.id === entry?.id;

            const isReserving =
              reservingNumber === number;

            let background =
              "rgba(255,255,255,0.04)";

            let border =
              "1px solid rgba(255,255,255,0.10)";

            let color = "inherit";

            if (entry?.status === "paid") {
              background =
                "rgba(52, 211, 153, 0.12)";
              border =
                "1px solid rgba(52, 211, 153, 0.35)";
            } else if (
              entry?.status === "pending_payment"
            ) {
              background =
                "rgba(251, 191, 36, 0.12)";
              border =
                "1px solid rgba(251, 191, 36, 0.35)";
            } else if (
              entry?.status === "reserved"
            ) {
              background =
                "rgba(96, 165, 250, 0.12)";
              border =
                "1px solid rgba(96, 165, 250, 0.35)";
            }

            if (isSelected) {
              border =
                "2px solid currentColor";
            }

            return (
              <button
                key={number}
                type="button"
                disabled={
                  activeDraw.status === "full" ||
                  isReserving
                }
                onClick={() =>
                  void handleReserveNumber(number)
                }
                aria-label={
                  isMine
                    ? `ቁጥር ${number} ${getEntryLabel(
                        entry!,
                      )}`
                    : `ቁጥር ${number}`
                }
                style={{
                  minHeight: "48px",
                  borderRadius: "12px",
                  border,
                  background,
                  color,
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor:
                    activeDraw.status === "full"
                      ? "not-allowed"
                      : "pointer",
                  opacity: isReserving ? 0.55 : 1,
                  transition:
                    "transform 0.15s ease, opacity 0.15s ease",
                }}
              >
                {isReserving
                  ? "..."
                  : number}
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
          <span>
            🟦 予約済み
          </span>

          <span>
            🟨 支払い確認待ち
          </span>

          <span>
            🟩 支払い済み
          </span>
        </div>
      </section>

      {selectedEntry && (
        <section className="draw-card">
          <div className="draw-info">
            <p className="eyebrow">
              የእኔ ቁጥር
            </p>

            <h2>
              #{selectedEntry.number}
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
                ክፍያ በመጠባበቅ ላይ
              </strong>

              <p
                className="hero-description"
                style={{
                  marginBottom: 0,
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
                }}
              >
                ይህ ቁጥር ለዕጣው
                ተመዝግቧል።
              </p>
            </div>
          )}

          <button
            className="primary-button"
            type="button"
            disabled={
              selectedEntry.status !== "reserved" ||
              selectedReservationExpired
            }
            onClick={() => {
              alert(
                "የTelebirr ክፍያ ማስገቢያ በቀጣዩ ደረጃ ይጨመራል።",
              );
            }}
            style={{
              marginTop: "14px",
            }}
          >
            {selectedEntry.status === "paid"
              ? "ክፍያ ተጠናቋል"
              : selectedEntry.status ===
                  "pending_payment"
                ? "ክፍያ በማረጋገጥ ላይ"
                : selectedReservationExpired
                  ? "Reservation ጊዜው አልፏል"
                  : `የ${formatMoney(
                      activeDraw.entryFee,
                    )} ክፍያ አስገባ`}
          </button>
        </section>
      )}

      <section className="draw-card">
        <div className="draw-info">
          <p className="eyebrow">
            የእኔ ቁጥሮች
          </p>

          <h2>
            {myActiveEntries.length} ቁጥር
          </h2>

          {myActiveEntries.length === 0 ? (
            <p className="hero-description">
              እስካሁን ምንም ቁጥር
              አልመረጥክም።
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
                    setSelectedEntry(entry)
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
                  #{entry.number}
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

      <section className="quick-links">
        <button type="button">
          <span>🔢</span>
          <small>
            የእኔ ቁጥሮች
          </small>
        </button>

        <button type="button">
          <span>🏆</span>
          <small>
            አሸናፊዎች
          </small>
        </button>

        <button type="button">
          <span>ℹ️</span>
          <small>
            እንዴት ይሰራል?
          </small>
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
