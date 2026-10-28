
import { useMemo } from "react";
import ReferralPanel from "./components/ReferralPanel";
import type { Draw, Entry } from "./api";

type ProfilePanelProps = {
  displayName: string;
  entries: Entry[];
  draws: Draw[];
  onClose: () => void;
  onLogout: () => void;
};

export default function ProfilePanel({
  displayName,
  entries,
  draws,
  onClose,
  onLogout,
}: ProfilePanelProps) {
  const myEntries = useMemo(
    () =>
      entries.filter((entry) =>
        ["paid", "pending_payment", "reserved"].includes(
          entry.status,
        ),
      ),
    [entries],
  );

  const groupedEntries = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; numbers: number[] }
    >();

    for (const entry of myEntries) {
      const draw = draws.find((item) => item.id === entry.drawId);
      const name = draw?.name || "ዕጣው አልተገኘም";

      if (!groups.has(entry.drawId)) {
        groups.set(entry.drawId, { name, numbers: [] });
      }

      groups.get(entry.drawId)!.numbers.push(entry.number);
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      numbers: [...new Set(group.numbers)].sort((a, b) => a - b),
    }));
  }, [myEntries, draws]);

  const openSupport = () => {
    const supportUrl = "https://t.me/ADDIS_draw_help";

    const telegram = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            openTelegramLink?: (url: string) => void;
          };
        };
      }
    ).Telegram?.WebApp;

    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(supportUrl);
    } else {
      window.open(supportUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="የእኔ መለያ"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        overflowY: "auto",
        background: "rgba(0,0,0,0.78)",
        padding: "20px 12px",
      }}
    >
      <section
        className="draw-card"
        style={{
          maxWidth: "560px",
          margin: "20px auto",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="ዝጋ"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 40,
            height: 40,
            borderRadius: "50%",
            fontSize: 20,
          }}
        >
          ✕
        </button>

        <div className="draw-info">
          <p className="eyebrow">👤 ADDIS ዕጣ</p>
          <h2>የእኔ መለያ</h2>
          <p className="hero-description">
            እንኳን ደህና መጡ፣ {displayName}
          </p>
        </div>

        <div className="stats">
          <div>
            <span>የተሳተፍኳቸው ዕጣዎች</span>
            <strong>{groupedEntries.length}</strong>
          </div>
          <div>
            <span>የያዝኳቸው ቁጥሮች</span>
            <strong>{myEntries.length}</strong>
          </div>
        </div>

        <section style={{ marginTop: 20 }}>
          <h3>🎟️ የእኔ ዕጣዎች</h3>

          {groupedEntries.length === 0 ? (
            <p className="hero-description">
              እስካሁን የያዝካቸው የዕጣ ቁጥሮች የሉም።
            </p>
          ) : (
            groupedEntries.map((group) => (
              <div
                key={group.name}
                className="draw-card"
                style={{ marginTop: 12, padding: 14 }}
              >
                <strong>{group.name}</strong>
                <p className="hero-description">
                  የያዝካቸው ቁጥሮች ({group.numbers.length})
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {group.numbers.map((number) => (
                    <span
                      key={number}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        background: "#f0f2f5",
                        color: "#171717",
                        fontWeight: 700,
                      }}
                    >
                      #{number}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <div style={{ marginTop: 20 }}>
          <ReferralPanel />
        </div>

        <button
          type="button"
          onClick={openSupport}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            marginTop: 16,
            padding: 13,
            border: "none",
            borderRadius: 12,
            background: "#229ED9",
            color: "#fff",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          💬 ጥያቄና ቅሬታ
        </button>

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            fontWeight: 700,
          }}
        >
          🚪 ከመለያ ውጣ
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
          }}
        >
          ወደ ዕጣው ተመለስ
        </button>
      </section>
    </div>
  );
}
