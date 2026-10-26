
import { useEffect, useState } from "react";
import {
  applyReferralCode,
  getMyReferral,
  type ReferralSummary,
} from "../api";

const BOT_LINK = "https://t.me/Addis_draw_bot";

function getStartParam(): string {
  const webApp = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          initDataUnsafe?: {
            start_param?: string;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  return webApp?.initDataUnsafe?.start_param?.trim() ?? "";
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

        if (startParam.toLowerCase().startsWith("ref_")) {
          const code = startParam.slice(4).trim();
          const storageKey = `addis-egata-referral-applied:${code}`;

          if (
            code &&
            sessionStorage.getItem(storageKey) !== "done"
          ) {
            try {
              await applyReferralCode(code);

              if (active) {
                setMessage("የግብዣ ኮዱ ተመዝግቧል።");
              }

              sessionStorage.setItem(storageKey, "done");
            } catch (error) {
              const text =
                error instanceof Error ? error.message : "";

              if (
                text.includes("REFERRAL_ALREADY_RECORDED") ||
                text.includes("already been recorded")
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
          setMessage(
            "የግብዣ መረጃን ማምጣት አልተቻለም።",
          );
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
      setMessage(
        `የግብዣ ሊንክዎ፦ ${link}`,
      );
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
    return null;
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
              {Number(referral.rewards.credited).toLocaleString("en-US")} ብር
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
          {copying ? "በመቅዳት ላይ..." : "🔗 የግብዣ ሊንክ ቅዳ"}
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
