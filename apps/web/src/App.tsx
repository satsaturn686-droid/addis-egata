import { useEffect, useMemo, useState } from "react";
import {
  getCurrentUser,
  getDraws,
  type Draw,
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

function App() {
  const [user, setUser] =
    useState<TelegramAuthResponse["user"] | null>(null);

  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telegramReady, setTelegramReady] = useState(false);

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

  const activeDraw = useMemo(() => {
    return (
      draws.find(
        (draw) =>
          draw.status === "open" ||
          draw.status === "full",
      ) ?? null
    );
  }, [draws]);

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
                {activeDraw.entryFee.toLocaleString(
                  "en-US",
                )}{" "}
                ብር
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

        <button
          className="primary-button"
          type="button"
          disabled={activeDraw.status === "full"}
          onClick={() => {
            if (activeDraw.status === "full") {
              return;
            }

            alert(
              "የቁጥር ምርጫ ክፍል በቀጣዩ ደረጃ ይጨመራል።",
            );
          }}
        >
          {activeDraw.status === "full"
            ? "ዕጣው ሙሉ ነው"
            : "ቁጥሬን ምረጥ"}
        </button>
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
