import { useEffect, useState } from "react";

import {
  getWinnerClaimLink,
  type LiveDrawState,
  type PublicDrawResult,
  type PublicWinner,
} from "./api";

type LiveDrawProps =
  | { live: LiveDrawState; result?: never }
  | { result: PublicDrawResult; live?: never };

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
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
    return `@${username}`;
  }

  return "ተሳታፊ";
}

function WinnerBall({
  winner,
}: {
  winner: PublicWinner;
}) {
  return (
    <div
      className="live-ball-stage"
      key={winner.id}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        padding: "18px 0 12px",
      }}
    >
      <style>
        {`
          @keyframes liveBallReveal {
            0% {
              opacity: 0;
              transform: scale(0.55) rotate(-12deg);
            }
            65% {
              opacity: 1;
              transform: scale(1.08) rotate(3deg);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotate(0deg);
            }
          }

          @keyframes liveBallGlow {
            0%, 100% {
              opacity: 0.45;
              transform: scale(0.92);
            }
            50% {
              opacity: 0.85;
              transform: scale(1.08);
            }
          }
        `}
      </style>

      <div
        className="live-ball-glow"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "8px",
          width: "230px",
          height: "230px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(214,166,59,0.32), transparent 68%)",
          filter: "blur(8px)",
          animation:
            "liveBallGlow 2s ease-in-out infinite",
        }}
      />

      <div
        className="live-ball"
        aria-label={`የ${winner.rank}ኛ ዕጣ ቁጥር ${winner.number}`}
        style={{
          position: "relative",
          zIndex: 1,
          width: "clamp(170px, 48vw, 230px)",
          height: "clamp(170px, 48vw, 230px)",
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          border:
            "8px solid rgba(255,255,255,0.9)",
          background:
            "radial-gradient(circle at 34% 25%, #ffffff 0%, #f7f7f7 13%, #dddddd 40%, #9b9b9b 69%, #444444 100%)",
          boxShadow:
            "inset -18px -22px 35px rgba(0,0,0,0.25), inset 14px 12px 24px rgba(255,255,255,0.72), 0 18px 45px rgba(0,0,0,0.25)",
          animation:
            "liveBallReveal 700ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <strong
          style={{
            fontSize:
              "clamp(70px, 20vw, 110px)",
            lineHeight: 1,
            fontWeight: 950,
            color: "#17191c",
            textShadow:
              "0 3px 0 rgba(255,255,255,0.55)",
          }}
        >
          {winner.number}
        </strong>
      </div>

      <span
        className="live-ball-label"
        style={{
          fontWeight: 900,
          fontSize: "14px",
          textAlign: "center",
        }}
      >
        🎱 {winner.rank}ኛ ዕጣ — አሸናፊ ቁጥር
      </span>

      <strong
        className="live-ball-name"
        style={{
          fontSize: "20px",
          textAlign: "center",
        }}
      >
        {getWinnerName(
          winner.firstName,
          winner.lastName,
          winner.username,
        )}
      </strong>

      <span
        className="live-ball-prize"
        style={{
          fontSize: "17px",
          fontWeight: 900,
        }}
      >
        🏆 {formatMoney(winner.prizeAmount)}
      </span>
    </div>
  );
}

function WinnerRow({
  winner,
  revealed,
  current,
}: {
  winner: PublicWinner;
  revealed: boolean;
  current: boolean;
}) {
  return (
    <article
      className={[
        "live-winner-row",
        revealed ? "revealed" : "hidden",
        current ? "current" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="live-winner-rank">
        {revealed ? `#${winner.rank}` : "?"}
      </div>

      <div className="live-winner-number">
        <span>ቁጥር</span>

        <strong>
          {revealed
            ? `#${winner.number}`
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
            ? formatMoney(winner.prizeAmount)
            : "በቅርቡ..."}
        </small>
      </div>
    </article>
  );
}

function WinnerClaimButton({
  winner,
}: {
  winner: PublicWinner;
}) {
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  async function handleClaim() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response =
        await getWinnerClaimLink(
          winner.id,
        );

      const opened = window.open(
        response.claimUrl,
        "_blank",
        "noopener,noreferrer",
      );

      if (!opened) {
        window.location.href =
          response.claimUrl;
      }
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "የሽልማት ጥያቄውን ማስጀመር አልተቻለም።",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        marginTop: "4px",
      }}
    >
      <button
        type="button"
        onClick={handleClaim}
        disabled={loading}
        style={{
          width: "min(100%, 340px)",
          border: "0",
          borderRadius: "14px",
          padding: "13px 18px",
          fontSize: "15px",
          fontWeight: 900,
          cursor: loading
            ? "wait"
            : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? "⏳ በማስጀመር ላይ..."
          : "🏆 የሽልማት ጥያቄ አስጀምር"}
      </button>

      {error ? (
        <span
          role="alert"
          style={{
            width: "min(100%, 340px)",
            fontSize: "12px",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          ⚠️ {error}
        </span>
      ) : null}

      <small
        style={{
          maxWidth: "340px",
          textAlign: "center",
          lineHeight: 1.5,
          opacity: 0.72,
        }}
      >
        የሽልማት ጥያቄው በAddis ዕጣ Bot
        በኩል በግል ይቀጥላል።
      </small>
    </div>
  );
}

function CompletedDraw({
  result,
}: {
  result: PublicDrawResult;
}) {
  const [visibleCount, setVisibleCount] =
    useState(0);

  useEffect(() => {
    setVisibleCount(0);

    if (result.winners.length === 0) {
      return;
    }

    const firstTimer =
      window.setTimeout(() => {
        setVisibleCount(1);
      }, 700);

    const interval =
      window.setInterval(() => {
        setVisibleCount((current) => {
          if (
            current >=
            result.winners.length
          ) {
            window.clearInterval(interval);
            return current;
          }

          return current + 1;
        });
      }, 700);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [
    result.drawId,
    result.winners.length,
  ]);

  const latestWinner =
    visibleCount > 0
      ? result.winners[
          Math.min(
            visibleCount - 1,
            result.winners.length - 1,
          )
        ]
      : null;

  return (
    <section
      className="live-draw-card"
      aria-live="polite"
    >
      <div className="live-draw-header">
        <div>
          <span className="live-draw-kicker completed">
            ✓ ዕጣው ተጠናቋል
          </span>

          <h2>{result.drawName}</h2>

          <p>
            ሁሉም አሸናፊዎች ተገልጠዋል።
          </p>
        </div>

        <div className="live-draw-counter">
          <strong>
            {result.winners.length}
          </strong>

          <span>
            {" / "}
            {result.winnerCount}
          </span>
        </div>
      </div>

      {latestWinner ? (
        <WinnerBall
          winner={latestWinner}
        />
      ) : (
        <div className="live-draw-waiting">
          <div className="live-draw-spinner">
            🏆
          </div>

          <strong>
            ውጤቱ እየተጫነ ነው...
          </strong>
        </div>
      )}

      {visibleCount >=
      result.winners.length &&
      result.winners.length > 0 ? (
        <WinnerClaimButton
          winner={
            result.winners[
              result.winners.length - 1
            ]
          }
        />
      ) : null}

      <div className="live-winners-list">
        {result.winners.map(
          (winner, index) => (
            <WinnerRow
              key={winner.id}
              winner={winner}
              revealed={
                index < visibleCount
              }
              current={
                index ===
                visibleCount - 1
              }
            />
          ),
        )}
      </div>

      <div className="live-draw-footer">
        🔐 የአሸናፊ ምርጫው በbackend
        በsecure random ተወስኗል።
      </div>
    </section>
  );
}

function LiveDrawing({
  live,
}: {
  live: LiveDrawState;
}) {
  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 250);

    return () =>
      window.clearInterval(timer);
  }, []);

  const elapsedMs = Math.max(
    0,
    now -
      new Date(
        live.executedAt,
      ).getTime(),
  );

  const countdownSeconds =
    Math.max(
      0,
      Math.ceil(
        (5000 - elapsedMs) /
          1000,
      ),
    );

  const currentWinner =
    live.winners.length > 0
      ? live.winners[
          live.winners.length - 1
        ]
      : null;

  const progressPercent =
    live.totalWinnerCount > 0
      ? Math.min(
          100,
          (live.revealedWinnerCount /
            live.totalWinnerCount) *
            100,
        )
      : 0;

  const statusText =
    live.revealedWinnerCount === 0
      ? countdownSeconds > 0
        ? `የመጀመሪያው አሸናፊ በ${countdownSeconds} ሰከንድ ውስጥ...`
        : "የመጀመሪያው አሸናፊ እየተገለጠ ነው..."
      : live.revealedWinnerCount <
          live.totalWinnerCount
        ? "ቀጣዩ አሸናፊ በ8 ሰከንድ ውስጥ..."
        : "ሁሉም አሸናፊዎች ተገልጠዋል።";

  return (
    <section
      className="live-draw-card"
      aria-live="polite"
    >
      <div className="live-draw-header">
        <div>
          <span className="live-draw-kicker">
            🔴 ቀጥታ ዕጣ
          </span>

          <h2>{live.drawName}</h2>

          <p>
            አሸናፊዎቹ በቅደም ተከተል
            በቀጥታ እየተገለጹ ነው።
          </p>
        </div>

        <div className="live-draw-counter">
          <strong>
            {live.revealedWinnerCount}
          </strong>

          <span>
            {" / "}
            {live.totalWinnerCount}
          </span>
        </div>
      </div>

      <div className="live-progress">
        <div className="live-progress-track">
          <div
            className="live-progress-fill"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>

        <span>
          {live.revealedWinnerCount}
          {" / "}
          {live.totalWinnerCount}
          {" አሸናፊ"}
        </span>
      </div>

      {currentWinner ? (
        <WinnerBall
          winner={currentWinner}
        />
      ) : (
        <div className="live-draw-waiting">
          <div className="live-draw-spinner">
            🎱
          </div>

          <strong>
            ዕጣው ተጀምሯል
          </strong>

          <span>{statusText}</span>
        </div>
      )}

      {currentWinner ? (
        <div className="live-current-status">
          <span>{statusText}</span>
        </div>
      ) : null}

      <div className="live-winners-list">
        {Array.from({
          length:
            live.totalWinnerCount,
        }).map((_, index) => {
          const winner =
            live.winners[index];

          if (winner) {
            return (
              <WinnerRow
                key={winner.id}
                winner={winner}
                revealed
                current={
                  index ===
                  live.winners.length - 1
                }
              />
            );
          }

          return (
            <div
              key={`hidden-${index}`}
              className="live-winner-row hidden"
            >
              <div className="live-winner-rank">
                ?
              </div>

              <div className="live-winner-number">
                <span>ቁጥር</span>

                <strong>•••</strong>
              </div>

              <div className="live-winner-user">
                <strong>
                  አሸናፊው እየተጠበቀ ነው
                </strong>

                <small>
                  በቅርቡ...
                </small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="live-draw-footer">
        🔐 የአሸናፊ ምርጫው በbackend
        በsecure random ተወስኗል።
        <br />
        📡 ማሳያው ከሰርቨሩ በቀጥታ
        ይዘምናል።
      </div>
    </section>
  );
}

export default function LiveDraw(
  props: LiveDrawProps,
) {
  if (props.live) {
    if (
      props.live.status ===
      "completed"
    ) {
      return (
        <CompletedDraw
          result={{
            drawId:
              props.live.drawId,
            drawName:
              props.live.drawName,
            prizeType:
              props.live.prizeType,
            prizeName:
              props.live.prizeName,
            prizeImageUrl:
              props.live.prizeImageUrl,
            displayedPrizeValue:
              props.live
                .displayedPrizeValue,
            winnerCount:
              props.live.winnerCount,
            eligibleEntryCount:
              props.live
                .eligibleEntryCount,
            executedAt:
              props.live.executedAt,
            publishedAt:
              props.live.publishedAt ??
              props.live.executedAt,
            winners:
              props.live.winners,
          }}
        />
      );
    }

    return (
      <LiveDrawing
        live={props.live}
      />
    );
  }

  return (
    <CompletedDraw
      result={props.result}
    />
  );
}
