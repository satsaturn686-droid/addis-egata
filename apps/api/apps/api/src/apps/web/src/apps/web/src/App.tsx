import { useEffect, useState } from "react";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  close: () => void;
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

type Draw = {
  id: string;
  name: string;
  prizeName: string;
  prizeImageUrl?: string;
  entryFee: number;
  totalNumbers: number;
  filledNumbers: number;
  winnerCount: number;
};

const demoDraw: Draw = {
  id: "demo",
  name: "የዚህ ሳምንት ዕጣ",
  prizeName: "የገንዘብ ሽልማት",
  entryFee: 100,
  totalNumbers: 100,
  filledNumbers: 73,
  winnerCount: 5,
};

function App() {
  const [draw] = useState<Draw>(demoDraw);
  const [telegramReady, setTelegramReady] = useState(false);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      return;
    }

    webApp.ready();
    webApp.expand();
    setTelegramReady(true);
  }, []);

  const remaining = draw.totalNumbers - draw.filledNumbers;
  const progress = Math.round(
    (draw.filledNumbers / draw.totalNumbers) * 100,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand">ADDIS ዕጣ</p>
          <p className="tagline">እድልህን ዲጂታል አድርግ</p>
        </div>

        <button className="profile-button" aria-label="መገለጫ">
          👤
        </button>
      </header>

      <section className="hero">
        <span className="status-badge">ክፍት</span>

        <h1>{draw.name}</h1>

        <p className="hero-description">
          ቁጥርህን ምረጥ፣ ክፍያህን አረጋግጥ፣ ዕጣውን ተጠባበቅ።
        </p>
      </section>

      <section className="draw-card">
        <div className="prize-placeholder" aria-label="የሽልማት ምስል">
          🎁
        </div>

        <div className="draw-info">
          <p className="eyebrow">የሽልማት</p>
          <h2>{draw.prizeName}</h2>

          <div className="stats">
            <div>
              <span>የመግቢያ ክፍያ</span>
              <strong>{draw.entryFee} ብር</strong>
            </div>

            <div>
              <span>አሸናፊዎች</span>
              <strong>{draw.winnerCount}</strong>
            </div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-label">
            <span>
              {draw.filledNumbers}/{draw.totalNumbers} ቁጥሮች
            </span>

            <strong>{remaining} ቀሪ</strong>
          </div>

          <div className="progress-track">
            <div
              className="progress-value"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button className="primary-button">
          ቁጥሬን ምረጥ
        </button>
      </section>

      <section className="quick-links">
        <button>
          <span>🔢</span>
          <small>የእኔ ቁጥሮች</small>
        </button>

        <button>
          <span>🏆</span>
          <small>አሸናፊዎች</small>
        </button>

        <button>
          <span>ℹ️</span>
          <small>እንዴት ይሰራል?</small>
        </button>
      </section>

      {!telegramReady && (
        <p className="development-note">
          Telegram Mini App preview
        </p>
      )}
    </main>
  );
}

export default App;
