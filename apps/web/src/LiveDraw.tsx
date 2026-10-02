import { useEffect, useMemo, useState } from "react";

import type { PublicDrawResult } from "./api";

type LiveDrawProps = {
  result: PublicDrawResult;
};

const FIRST_REVEAL_DELAY_MS = 1200;
const REVEAL_INTERVAL_MS = 2600;

function formatMoney(value: number): string {
  return value.toLocaleString("en-US") + " ብር";
}

function getWinnerName(
  firstName: string | null,
  lastName: string | null,
  username: string | null,
): string {
  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  if (username) {
    return "@" + username;
  }

  return "ተሳታፊ";
}

export default function LiveDraw({
  result,
}: LiveDrawProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      250,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const revealCount = useMemo(() => {
    const publishedAt =
      new Date(
        result.publishedAt,
      ).getTime();

    if (!Number.isFinite(publishedAt)) {
      return result.winners.length;
    }

    const elapsed =
      now - publishedAt;

    if (
      elapsed <
      FIRST_REVEAL_DELAY_MS
    ) {
      return 0;
    }

    return Math.min(
      result.winners.length,
      Math.floor(
        (elapsed -
          FIRST_REVEAL_DELAY_MS) /
          REVEAL_INTERVAL_MS,
      ) + 1,
    );
  }, [now, result]);

  const isLive =
    revealCount <
    result.winners.length;

  const revealedWinner =
    revealCount > 0
      ? result.winners[
          revealCount - 1
        ]
      : null;

  const liveCss = [
    ".live-draw-card{margin-bottom:18px;padding:16px;border-radius:20px;color:#f5f7fa;background:radial-gradient(circle at 15% 0%,rgba(214,166,59,.18),transparent 38%),linear-gradient(145deg,#111720,#080c12);border:1px solid rgba(214,166,59,.35);box-shadow:0 14px 40px rgba(0,0,0,.22);overflow:hidden}",

    ".live-draw-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}",

    ".live-draw-kicker{display:inline-flex;align-items:center;min-height:24px;padding:4px 9px;border-radius:999px;background:rgba(214,166,59,.12);color:#f0c96a;font-size:10px;font-weight:900;letter-spacing:.5px}",

    ".live-draw-header h2{margin:9px 0 4px;font-size:21px}",

    ".live-draw-header p{margin:0;color:#9ca7b4;font-size:12px;line-height:1.5}",

    ".live-draw-counter{min-width:58px;padding:8px 10px;border-radius:14px;text-align:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}",

    ".live-draw-counter strong{display:block;font-size:22px;line-height:1}",

    ".live-draw-counter span{color:#8994a1;font-size:11px}",

    ".live-draw-stage{margin-top:16px}",

    ".live-draw-waiting{min-height:210px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;text-align:center;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}",

    ".live-draw-spinner{width:66px;height:66px;display:grid;place-items:center;border-radius:50%;font-size:31px;background:rgba(214,166,59,.12);animation:liveDrawPulse 1s ease-in-out infinite}",

    ".live-draw-waiting strong{font-size:15px}",

    ".live-draw-waiting span{color:#8994a1;font-size:11px}",

    ".live-draw-ball-stage{min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;position:relative;padding:18px 10px 22px;border-radius:18px;background:radial-gradient(circle at center,rgba(214,166,59,.12),transparent 58%),rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);overflow:hidden}",

    ".live-draw-ball-glow{position:absolute;width:190px;height:190px;border-radius:50%;background:rgba(214,166,59,.09);filter:blur(18px);animation:liveDrawGlow 1.8s ease-in-out infinite}",

    ".live-draw-ball{position:relative;z-index:1;width:142px;height:142px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 34% 27%,#fff8d7 0 5%,#f0c96a 7%,#d6a63b 42%,#8e6821 100%);border:5px solid rgba(255,255,255,.78);box-shadow:0 0 0 8px rgba(214,166,59,.10),0 16px 45px rgba(0,0,0,.45),inset 8px 8px 18px rgba(255,255,255,.22);animation:liveDrawBallReveal .65s cubic-bezier(.16,1,.3,1) both}",

    ".live-draw-ball strong{font-size:48px;line-height:1;color:#15110a;text-shadow:0 1px 1px rgba(255,255,255,.45)}",

    ".live-draw-ball-label{position:relative;z-index:1;margin-top:16px;color:#8994a1;font-size:10px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}",

    ".live-draw-current-user{position:relative;z-index:1;margin-top:5px;font-size:16px;font-weight:900;text-align:center}",

    ".live-draw-current-prize{position:relative;z-index:1;margin-top:4px;color:#eac35e;font-size:13px;font-weight:900}",

    ".live-draw-winners{display:grid;gap:9px;margin-top:12px}",

    ".live-winner{display:grid;grid-template-columns:40px 76px 1fr;align-items:center;gap:10px;min-height:70px;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}",

    ".live-winner.revealed{animation:liveWinnerReveal .55s ease-out both;border-color:rgba(214,166,59,.28)}",

    ".live-winner.hidden{opacity:.42}",

    ".live-winner-rank{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:rgba(214,166,59,.12);color:#eac35e;font-weight:900}",

    ".live-winner-number span,.live-winner-user small{display:block;color:#7f8b98;font-size:10px}",

    ".live-winner-number strong{display:block;margin-top:2px;font-size:18px}",

    ".live-winner-user{min-width:0}",

    ".live-winner-user strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}",

    ".live-winner-user small{margin-top:3px;color:#eac35e;font-weight:800}",

    ".live-draw-footer{margin-top:12px;color:#697583;font-size:10px;line-height:1.5;text-align:center}",

    "@keyframes liveWinnerReveal{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}",

    "@keyframes liveDrawPulse{0%,100%{transform:scale(.94);opacity:.7}50%{transform:scale(1.06);opacity:1}}",

    "@keyframes liveDrawGlow{0%,100%{transform:scale(.9);opacity:.55}50%{transform:scale(1.12);opacity:1}}",

    "@keyframes liveDrawBallReveal{0%{opacity:0;transform:scale(.35) rotate(-18deg)}55%{opacity:1;transform:scale(1.12) rotate(5deg)}100%{opacity:1;transform:scale(1) rotate(0)}}",

    "@media (max-width:360px){.live-draw-ball{width:122px;height:122px}.live-draw-ball strong{font-size:42px}.live-winner{grid-template-columns:34px 64px 1fr;gap:7px;padding:8px}.live-winner-rank{width:32px;height:32px}.live-winner-number strong{font-size:16px}}",
  ].join("");

  if (
    result.winners.length === 0
  ) {
    return null;
  }

  return (
    <section
      className="live-draw-card"
      aria-live="polite"
    >
      <style>
        {liveCss}
      </style>

      <div className="live-draw-header">
        <div>
          <span className="live-draw-kicker">
            {isLive
              ? "🔴 LIVE DRAW"
              : "✓ ዕጣው ተጠናቋል"}
          </span>

          <h2>
            {result.drawName}
          </h2>

          <p>
            {isLive
              ? "አሸናፊዎቹ በቅደም ተከተል እየተገለጹ ነው።"
              : "ሁሉም አሸናፊዎች ተገልጠዋል።"}
          </p>
        </div>

        <div className="live-draw-counter">
          <strong>
            {revealCount}
          </strong>

          <span>
            {" / " +
              result.winners.length}
          </span>
        </div>
      </div>

      <div className="live-draw-stage">
        {revealCount === 0 ? (
          <div className="live-draw-waiting">
            <div className="live-draw-spinner">
              🎲
            </div>

            <strong>
              ዕጣው እየተዘጋጀ ነው...
            </strong>

            <span>
              አሸናፊው በbackend አስቀድሞ
              ተወስኗል።
            </span>
          </div>
        ) : (
          <>
            {revealedWinner && (
              <div
                className="live-draw-ball-stage"
                key={
                  revealedWinner.id
                }
              >
                <div className="live-draw-ball-glow" />

                <div className="live-draw-ball">
                  <strong>
                    {revealedWinner.number}
                  </strong>
                </div>

                <div className="live-draw-ball-label">
                  አሸናፊ ቁጥር
                </div>

                <div className="live-draw-current-user">
                  {getWinnerName(
                    revealedWinner.firstName,
                    revealedWinner.lastName,
                    revealedWinner.username,
                  )}
                </div>

                <div className="live-draw-current-prize">
                  #{revealedWinner.rank} ·{" "}
                  {formatMoney(
                    revealedWinner.prizeAmount,
                  )}
                </div>
              </div>
            )}

            <div className="live-draw-winners">
              {result.winners.map(
                (winner, index) => {
                  const revealed =
                    index < revealCount;

                  return (
                    <article
                      key={winner.id}
                      className={
                        revealed
                          ? "live-winner revealed"
                          : "live-winner hidden"
                      }
                    >
                      <div className="live-winner-rank">
                        {revealed
                          ? "#" +
                            winner.rank
                          : "?"}
                      </div>

                      <div className="live-winner-number">
                        <span>
                          ቁጥር
                        </span>

                        <strong>
                          {revealed
                            ? "#" +
                              winner.number
                            : "•••"}
                        </strong>
                      </div>

                      <div className="live-winner-user">
                        <strong>
                          {revealed
                            ? getWinnerName(
                                winner.firstName,
                                winner.lastName,
                                winner.username,
                              )
                            : "አሸናፊው እየተጠበቀ ነው"}
                        </strong>

                        <small>
                          {revealed
                            ? formatMoney(
                                winner.prizeAmount,
                              )
                            : "በቅርቡ..."}
                        </small>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </>
        )}
      </div>

      <div className="live-draw-footer">
        🔐 የአሸናፊ ምርጫው በbackend
        በsecure random ተወስኗል።
      </div>
    </section>
  );
}
