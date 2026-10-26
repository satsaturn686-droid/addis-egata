
import { useEffect, useState } from "react";
import {
  applyReferralCode,
  getMyReferral,
  type ReferralSummary,
} from "../api";

const BOT_LINK = "https://t.me/Addis_draw_bot";

type TelegramStartData = {
  start_param?: string;
};

function getStartParam(): string {
  const webApp = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          initDataUnsafe?: TelegramStartData;
        };
      };
    }
  ).Telegram?.WebApp;

  const telegramParam =
    webApp?.initDataUnsafe?.start_param?.trim();

  if (telegramParam) {
    return telegramParam;
  }

  const params = new URLSearchParams(window.location.search);

  return (
    params.get("tgWebAppStartParam")?.trim() ||
    params.get("startapp")?.trim() ||
    params.get("ref")?.trim() ||
    ""
  );
}

function extractReferralCode(value: string): string {
  const cleaned = value.trim();

  if (/^ref_/i.test(cleaned)) {
    return cleaned.slice(4).trim();
  }

  return cleaned;
}

export default function ReferralPanel() {
  const [referral, setReferral] =
    useState<ReferralSummary | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadReferral() {
      try {
        const startParam = getStartParam();
        const code = extractReferralCode(startParam);

        if (code && /^[A-Za-z0-9_-]{6,32}$/.test(code)) {
          const storageKey =
            `addis-egata-referral-applied:${code.toUpperCase()}`;

          if (sessionStorage.getItem(storageKey) !== "done") {
            try {
              await applyReferralCode(code);

              sessionStorage.setItem(storageKey, "done");

              if (active) {
                setMessage("የግብዣ ኮዱ ተመዝግቧል።");
              }
            } catch (error) {
              const errorText =
                error instanceof Error ? error.message : "";

              if (
                errorText.includes("REFERRAL_ALREADY_RECORDED") ||
                errorText.includes("already been recorded")
              ) {
                sessionStorage.setItem(storageKey, "done");
              } else if (active) {
                setMessage(
                  "የግብዣ ኮዱ አልተመዘገበም። መለያዎ ከተረጋገጠ በኋላ እንደገና ይሞክሩ።",
                );
              }
            }
          }
        }

        const result = await getMyReferral();

        if (active) {
          setReferral(result);
        }
      } catch {
        if (active) {
          setMessage("የግብዣ መረጃን ማምጣት አልተቻለም።");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReferral();

    return () => {
      active = false;
    };
  }, []);

  async function copyInviteLink() {
    if (!referral?.referralCode) {
      return;
    }

    const link =
      `${BOT_LINK}?startapp=ref_${referral.referralCode}`;

    setCopying(true);
    setMessage("");

    try {
      await navigator.clipboard.writeText(link);
      setMessage("የግብዣ ሊንኩ ተቀድቷል። ለጓደኞችዎ ይላኩ።");
    } catch {
      setMessage(`የግብዣ ሊንክዎ፦ ${link}`);
    } finally {
      setCopying(false);
    }
  }

  if (loading) {
    return (
      <section className="draw-card">
        <p>የግብዣ መረጃ በመጫን ላይ...</p>
      </section>
    );
  }

  if (!referral) {
    return (
      <section className="draw-card">
        <p className="hero-description">
          {message || "የግብዣ መረጃ አልተገኘም።"}
        </p>
      </section>
    );
  }

  return (
    <section className="draw-card">
      <div className="draw-info">
        <p className="eyebrow">🎁 ጓደኛዎን ይጋብዙ</p>

        <h2>ከግብዣዎ 10 ብር ቦነስ ያግኙ</h2>

        <p className="hero-description">
          የግብዣ ሊንክዎን ለጓደኞችዎ ይላኩ።
          እያንዳንዱ አዲስ ተጠቃሚ የመጀመሪያ
          ክፍያው ከተረጋገጠ በኋላ ብቻ ይቆጠራል።
          በወር እስከ 5 ግብዣዎች ቦነስ ያገኛሉ።
        </p>

        <div className="stats">
          <div>
            <span>የተጋበዙ</span>
            <strong>{referral.summary.total}</strong>
          </div>

          <div>
            <span>የተረጋገጡ</span>
            <strong>{referral.summary.qualified}</strong>
          </div>

          <div>
            <span>የተከፈለ ቦነስ</span>
            <strong>
              {Number(
                referral.rewards.credited,
              ).toLocaleString("en-US")}{" "}
              ብር
            </strong>
          </div>
        </div>

        <p className="hero-description">
          የግብዣ ኮድዎ፦{" "}
          <strong>{referral.referralCode}</strong>
        </p>

        <button
          type="button"
          onClick={() => void copyInviteLink()}
          disabled={copying}
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "12px",
            borderRadius: "12px",
            fontWeight: 700,
          }}
        >
          {copying
            ? "በመቅዳት ላይ..."
            : "🔗 የግብዣ ሊንክ ቅዳ"}
        </button>

        {message && (
          <p className="hero-description" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
