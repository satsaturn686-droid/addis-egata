
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCurrentLiveDrawState,
  getLiveDrawState,
  getPublishedResults,
  type LiveDrawState,
  type PublicDrawResult,
} from "./api";

import LiveDraw from "./LiveDraw";

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("am-ET", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

  if (fullName) return fullName;
  if (username) return `@${username}`;

  return "ተሳታፊ";
}

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();

  const timer = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted &&
      !(error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new Error("የሰርቨር ምላሽ ዘግይቷል። እባክዎ እንደገና ይሞክሩ።");
    }

    if (controller.signal.aborted) {
      throw new Error("የሰርቨር ምላሽ ዘግይቷል። እባክዎ እንደገና ይሞክሩ።");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function LiveOverlay({
  liveDraw,
  onClose,
}: {
  liveDraw: LiveDrawState;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ቀጥታ ዕጣ"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflowY: "auto",
        background: "rgba(4,7,12,0.94)",
        backdropFilter: "blur(14px)",
        padding: "max(16px, env(safe-area-inset-top)) 12px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "min(100%, 760px)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button type="button" onClick={onClose}>
            ✕ ዝጋ
          </button>
        </div>

        <div style={{ borderRadius: 20, overflow: "hidden" }}>
          <LiveDraw live={liveDraw} />
        </div>
      </div>
    </div>
  );
}

export default function PublicResults() {
  const [results, setResults] = useState<PublicDrawResult[]>([]);
  const [liveDraw, setLiveDraw] = useState<LiveDrawState | null>(null);
  const [activeLiveDrawId, setActiveLiveDrawId] = useState<string | null>(null);
  const [selectedDrawId, setSelectedDrawId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveOverlayOpen, setLiveOverlayOpen] = useState(false);

  const latestResultIdRef = useRef<string | null>(null);
  const previousLiveDrawIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadResults = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const [publishedOutcome, liveOutcome] = await Promise.allSettled([
      withTimeout((signal) => getPublishedResults(signal)),
      withTimeout((signal) => getCurrentLiveDrawState(signal)),
    ]);

    if (!mountedRef.current) {
      loadingRef.current = false;
      return;
    }

    let hadSuccess = false;

    if (publishedOutcome.status === "fulfilled") {
      hadSuccess = true;

      const published = publishedOutcome.value;
      const nextResults = Array.isArray(published.results)
        ? published.results
        : [];

      const latestResult = nextResults[0] ?? null;
      const previousLatestResultId = latestResultIdRef.current;

      setResults(nextResults);
      latestResultIdRef.current = latestResult?.drawId ?? null;

      setSelectedDrawId((currentId) => {
        if (activeLiveDrawId) return activeLiveDrawId;

        if (
          currentId &&
          nextResults.some((result) => result.drawId === currentId)
        ) {
          return currentId;
        }

        return latestResult?.drawId ?? null;
      });

      if (!latestResult && nextResults.length === 0) {
        setSelectedDrawId((currentId) =>
          currentId && currentId === previousLatestResultId ? null : currentId,
        );
      }
    }

    if (liveOutcome.status === "fulfilled") {
      hadSuccess = true;

      const currentLive = liveOutcome.value;

      if (currentLive) {
        const isNewLiveDraw =
          previousLiveDrawIdRef.current !== currentLive.drawId;

        setActiveLiveDrawId(currentLive.drawId);
        setSelectedDrawId(currentLive.drawId);
        previousLiveDrawIdRef.current = currentLive.drawId;

        if (isNewLiveDraw) {
          setLiveOverlayOpen(true);
        }
      } else {
        setActiveLiveDrawId(null);
        previousLiveDrawIdRef.current = null;
      }
    }

    if (hadSuccess) {
      setError(null);
    } else {
      const publishedError =
        publishedOutcome.status === "rejected"
          ? publishedOutcome.reason
          : null;

      const liveError =
        liveOutcome.status === "rejected"
          ? liveOutcome.reason
          : null;

      const reason = publishedError ?? liveError;

      setError(
        reason instanceof Error
          ? reason.message
          : "የዕጣ ውጤቶችን ማምጣት አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
      );
    }

    setLoading(false);
    loadingRef.current = false;
  }, [activeLiveDrawId]);

  useEffect(() => {
    mountedRef.current = true;

    void loadResults();

    const timer = window.setInterval(() => {
      void loadResults();
    }, 5000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [loadResults]);

  useEffect(() => {
    if (!activeLiveDrawId) {
      setLiveDraw(null);
      return;
    }

    let stopped = false;

    const loadLive = async () => {
      try {
        const response = await withTimeout((signal) =>
          getLiveDrawState(activeLiveDrawId, signal),
        );

        if (stopped) return;

        setLiveDraw(response.live);

        if (
          response.live.status === "completed" ||
          response.live.publishedAt
        ) {
          setLiveOverlayOpen(true);
        }
      } catch (loadError) {
        if (!stopped) {
          console.error("Live draw state error:", loadError);
        }
      }
    };

    void loadLive();

    const timer = window.setInterval(() => {
      void loadLive();
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeLiveDrawId]);

  useEffect(() => {
    if (!liveDraw || liveDraw.status !== "completed") return;

    const timer = window.setTimeout(() => {
      setLiveOverlayOpen(false);
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [liveDraw?.drawId, liveDraw?.status, liveDraw?.publishedAt]);

  const selectedResult =
    results.find((result) => result.drawId === selectedDrawId) ?? null;

  const showingLiveDraw =
    liveDraw !== null &&
    liveDraw.status === "drawing" &&
    liveDraw.drawId === selectedDrawId;

  const showLiveOverlay =
    liveOverlayOpen &&
    liveDraw !== null &&
    liveDraw.drawId === activeLiveDrawId;

  if (loading) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">በመጫን ላይ</span>
          <h2>🏆 የዕጣ ውጤቶች</h2>
          <p>የዕጣ ውጤቶችን በመጫን ላይ...</p>
        </div>
      </section>
    );
  }

  if (error && results.length === 0 && !liveDraw && !activeLiveDrawId) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">ማስታወሻ</span>
          <h2>🏆 የዕጣ ውጤቶች</h2>
          <p className="results-error">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              void loadResults();
            }}
          >
            እንደገና ሞክር
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {showLiveOverlay && liveDraw && (
        <LiveOverlay
          liveDraw={liveDraw}
          onClose={() => setLiveOverlayOpen(false)}
        />
      )}

      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            {showingLiveDraw ? "🔴 ቀጥታ" : "የታተመ"}
          </span>
          <h2>{showingLiveDraw ? "የቀጥታ ዕጣ" : "🏆 የዕጣ ውጤቶች"}</h2>
          <p>
            {showingLiveDraw
              ? "የዕጣውን ሂደት በቀጥታ ይመልከቱ።"
              : "የተጠናቀቁ ዕጣዎችንና አሸናፊዎችን ይመልከቱ።"}
          </p>
        </div>

        {showingLiveDraw && liveDraw ? (
          <LiveDraw live={liveDraw} />
        ) : selectedResult ? (
          <LiveDraw result={selectedResult} />
        ) : (
          <div className="results-card">
            <div className="results-header">
              <span className="status-badge">አሁን የለም</span>
              <h3>የዕጣ ውጤት</h3>
              <p>እስካሁን የታተመ የዕጣ ውጤት የለም።</p>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div
            className="results-draw-list"
            role="tablist"
            aria-label="የዕጣ ውጤቶች"
          >
            {results.map((result) => {
              const active = result.drawId === selectedDrawId;

              return (
                <button
                  key={result.drawId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={
                    active
                      ? "results-draw-button active"
                      : "results-draw-button"
                  }
                  onClick={() => setSelectedDrawId(result.drawId)}
                >
                  <span>{result.drawName}</span>
                  <small>{formatDate(result.publishedAt)}</small>
                </button>
              );
            })}
          </div>
        )}

        {showingLiveDraw && liveDraw ? (
          <div className="results-card">
            <div className="results-card-top">
              <div>
                <p className="results-kicker">🔴 በቀጥታ ላይ</p>
                <h3>{liveDraw.drawName}</h3>
              </div>
              <span className="results-completed">
                {liveDraw.revealedWinnerCount} / {liveDraw.totalWinnerCount}
              </span>
            </div>

            <div className="results-prize">
              {liveDraw.prizeImageUrl ? (
                <img
                  src={liveDraw.prizeImageUrl}
                  alt={liveDraw.prizeName}
                  className="results-prize-image"
                />
              ) : (
                <div className="results-prize-placeholder" aria-hidden="true">
                  🎁
                </div>
              )}

              <div>
                <span>ሽልማት</span>
                <strong>{liveDraw.prizeName}</strong>
                {liveDraw.displayedPrizeValue !== null && (
                  <small>{formatMoney(liveDraw.displayedPrizeValue)}</small>
                )}
              </div>
            </div>

            <div className="results-summary">
              <div>
                <span>ተሳታፊዎች</span>
                <strong>{liveDraw.eligibleEntryCount.toLocaleString("en-US")}</strong>
              </div>
              <div>
                <span>አሸናፊዎች</span>
                <strong>{liveDraw.totalWinnerCount.toLocaleString("en-US")}</strong>
              </div>
              <div>
                <span>የተገለጹ</span>
                <strong>{liveDraw.revealedWinnerCount.toLocaleString("en-US")}</strong>
              </div>
            </div>

            <div className="results-winners">
              <div className="results-winners-heading">
                <h3>🎱 እየወጡ ያሉ አሸናፊዎች</h3>
                <span>{liveDraw.winners.length}</span>
              </div>

              {liveDraw.winners.map((winner) => (
                <div key={winner.id} className="winner-row">
                  <div className="winner-rank">{winner.rank}</div>
                  <div className="winner-number">
                    <span>ቁጥር</span>
                    <strong>#{winner.number}</strong>
                  </div>
                  <div className="winner-user">
                    <strong>
                      {getWinnerName(
                        winner.firstName,
                        winner.lastName,
                        winner.username,
                      )}
                    </strong>
                    <small>{formatDate(winner.selectedAt)}</small>
                  </div>
                  <div className="winner-prize">
                    {formatMoney(winner.prizeAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : selectedResult ? (
          <div className="results-card">
            <div className="results-card-top">
              <div>
                <p className="results-kicker">የተጠናቀቀ ዕጣ</p>
                <h3>{selectedResult.drawName}</h3>
              </div>
              <span className="results-completed">✓ ተጠናቋል</span>
            </div>

            <div className="results-prize">
              {selectedResult.prizeImageUrl ? (
                <img
                  src={selectedResult.prizeImageUrl}
                  alt={selectedResult.prizeName}
                  className="results-prize-image"
                />
              ) : (
                <div className="results-prize-placeholder" aria-hidden="true">
                  🎁
                </div>
              )}
              <div>
                <span>ሽልማት</span>
                <strong>{selectedResult.prizeName}</strong>
                {selectedResult.displayedPrizeValue !== null && (
                  <small>
                    {formatMoney(selectedResult.displayedPrizeValue)}
                  </small>
                )}
              </div>
            </div>

            <div className="results-summary">
              <div>
                <span>ተሳታፊዎች</span>
                <strong>
                  {selectedResult.eligibleEntryCount.toLocaleString("en-US")}
                </strong>
              </div>
              <div>
                <span>አሸናፊዎች</span>
                <strong>
                  {selectedResult.winnerCount.toLocaleString("en-US")}
                </strong>
              </div>
            </div>

            <div className="results-winners">
              <div className="results-winners-heading">
                <h3>🏆 አሸናፊዎች</h3>
                <span>{selectedResult.winners.length}</span>
              </div>

              {selectedResult.winners.map((winner) => (
                <div key={winner.id} className="winner-row">
                  <div className="winner-rank">{winner.rank}</div>
                  <div className="winner-number">
                    <span>ቁጥር</span>
                    <strong>#{winner.number}</strong>
                  </div>
                  <div className="winner-user">
                    <strong>
                      {getWinnerName(
                        winner.firstName,
                        winner.lastName,
                        winner.username,
                      )}
                    </strong>
                    <small>{formatDate(winner.selectedAt)}</small>
                  </div>
                  <div className="winner-prize">
                    {formatMoney(winner.prizeAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error && (
          <p className="results-error" role="status">
            የቀጥታ መረጃ ማደስ አልተቻለም፤ እንደገና እየሞከርን ነው።
          </p>
        )}
      </section>
    </>
  );
}
