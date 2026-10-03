import { useEffect, useState } from "react";

import type {
  LiveDrawState,
  PublicDrawResult,
  PublicWinner,
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
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (username) {
    return `@${username}`;
  }

  return "ተሳታፊ";
}

function WinnerBall({ winner }: { winner: PublicWinner }) {
  return (
    <div className="live-ball-stage" key={winner.id}>
      <div className="live-ball-glow" />

      <div className="live-ball">
        <strong>{winner.number}</strong>
      </div>

      <span className="live-ball-label">
        አሸናፊ ቁጥር
      </span>

      <strong className="live-ball-name">
        {getWinnerName(
          winner.firstName,
          winner.lastName,
          winner.username,
        )}
      </strong>

      <span className="live-ball-prize">
        #{winner.rank} · {formatMoney(winner.prizeAmount)}
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
          {revealed ? `#${winner.number}` : "•••"}
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

function CompletedDraw({
  result,
}: {
  result: PublicDrawResult;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);

    if (result.winners.length === 0) {
      return;
    }

    const firstTimer = window.setTimeout(() => {
      setVisibleCount(1);
    }, 700);

    const interval = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= result.winners.length) {
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
  }, [result.drawId, result.winners.length]);

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
          <strong>{result.winners.length}</strong>

          <span>
            {" / "}
            {result.winnerCount}
          </span>
        </div>
      </div>

      {latestWinner ? (
        <WinnerBall winner={latestWinner} />
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

      <div className="live-winners-list">
        {result.winners.map((winner, index) => (
          <WinnerRow
            key={winner.id}
            winner={winner}
            revealed={index < visibleCount}
            current={index === visibleCount - 1}
          />
        ))}
      </div>

      <div className="live-draw-footer">
        🔐 የአሸናፊ ምርጫው በbackend በsecure random ተወስኗል።
      </div>
    </section>
  );
}

function LiveDrawing({
  live,
}: {
  live: LiveDrawState;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const elapsedMs = Math.max(
    0,
    now - new Date(live.executedAt).getTime(),
  );

  const countdownSeconds = Math.max(
    0,
    Math.ceil((3000 - elapsedMs) / 1000),
  );

  const currentWinner =
    live.winners.length > 0
      ? live.winners[live.winners.length - 1]
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
        ? "ቀጣዩ አሸናፊ እየተጠበቀ ነው..."
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
        <WinnerBall winner={currentWinner} />
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
          length: live.totalWinnerCount,
        }).map((_, index) => {
          const winner = live.winners[index];

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

                <small>በቅርቡ...</small>
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
    return <LiveDrawing live={props.live} />;
  }

  return <CompletedDraw result={props.result} />;
}
