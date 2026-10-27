
import ReferralPanel from "./components/ReferralPanel";

type ProfilePanelProps = {
  displayName: string;
  entryCount: number;
  onClose: () => void;
  onLogout: () => void;
};

export default function ProfilePanel({
  displayName,
  entryCount,
  onClose,
  onLogout,
}: ProfilePanelProps) {
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
            top: "12px",
            right: "12px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            fontSize: "20px",
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
            <span>የእኔ ዕጣዎች</span>
            <strong>{entryCount}</strong>
          </div>
          <div>
            <span>የመለያ ሁኔታ</span>
            <strong>ንቁ</strong>
          </div>
        </div>

        <div style={{ marginTop: "16px" }}>
          <ReferralPanel />
        </div>

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "12px",
            borderRadius: "12px",
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
            marginTop: "10px",
            padding: "12px",
            borderRadius: "12px",
          }}
        >
          ወደ ዕጣው ተመለስ
        </button>
      </section>
    </div>
  );
}
