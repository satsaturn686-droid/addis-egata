import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getDraws,
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
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

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
  const fullName = [
    firstName,
    lastName,
  ]
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
        background:
          "rgba(4,7,12,0.94)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        padding:
          "max(16px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom))",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(100%, 760px)",
          margin: "0 auto",
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "8px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="የLive Draw ማሳያውን ዝጋ"
            style={{
              border:
                "1px solid rgba(255,255,255,0.18)",
              borderRadius: "999px",
              background:
                "rgba(255,255,255,0.08)",
              color: "inherit",
              padding: "9px 14px",
              fontSize: "14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ✕ ዝጋ
          </button>
        </div>

        <div
          style={{
            borderRadius: "22px",
            border:
              "1px solid rgba(255,255,255,0.12)",
            background:
              "rgba(255,255,255,0.035)",
            boxShadow:
              "0 30px 100px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <LiveDraw live={liveDraw} />
        </div>
      </div>
    </div>
  );
}

export default function PublicResults() {
  const [results, setResults] =
    useState<PublicDrawResult[]>([]);

  const [liveDraw, setLiveDraw] =
    useState<LiveDrawState | null>(null);

  const [activeLiveDrawId, setActiveLiveDrawId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedDrawId, setSelectedDrawId] =
    useState<string | null>(null);

  const [liveOverlayOpen, setLiveOverlayOpen] =
    useState(false);

  const latestResultIdRef =
    useRef<string | null>(null);

  const previousLiveDrawIdRef =
    useRef<string | null>(null);

  useEffect(() => {
    const controller =
      new AbortController();

    let firstLoad = true;
    let stopped = false;

    async function loadResults() {
      try {
        if (firstLoad) {
          setLoading(true);
        }

        const [
          publishedResponse,
          drawsResponse,
        ] = await Promise.all([
          getPublishedResults(
            controller.signal,
          ),
          getDraws(
            controller.signal,
          ),
        ]);

        if (stopped) {
          return;
        }

        const latestResult =
          publishedResponse.results[0] ??
          null;

        const activeDrawing =
          drawsResponse.draws.find(
            (draw) =>
              draw.status ===
              "drawing",
          ) ?? null;

        const previousLatestResultId =
          latestResultIdRef.current;

        setResults(
          publishedResponse.results,
        );

        if (activeDrawing) {
          const isNewLiveDraw =
            previousLiveDrawIdRef.current !==
            activeDrawing.id;

          setActiveLiveDrawId(
            activeDrawing.id,
          );

          setSelectedDrawId(
            (currentSelectedId) => {
              if (
                !currentSelectedId ||
                currentSelectedId ===
                  previousLatestResultId
              ) {
                return activeDrawing.id;
              }

              if (
                currentSelectedId ===
                activeDrawing.id
              ) {
                return currentSelectedId;
              }

              return activeDrawing.id;
            },
          );

          if (isNewLiveDraw) {
            setLiveOverlayOpen(true);
          }

          previousLiveDrawIdRef.current =
            activeDrawing.id;
        } else {
          setActiveLiveDrawId(null);

          previousLiveDrawIdRef.current =
            null;

          setSelectedDrawId(
            (currentSelectedId) => {
              if (!latestResult) {
                return null;
              }

              if (!currentSelectedId) {
                return latestResult.drawId;
              }

              if (
                previousLatestResultId &&
                currentSelectedId ===
                  previousLatestResultId &&
                latestResult.drawId !==
                  previousLatestResultId
              ) {
                return latestResult.drawId;
              }

              if (
                publishedResponse.results.some(
                  (result) =>
                    result.drawId ===
                    currentSelectedId,
                )
              ) {
                return currentSelectedId;
              }

              return latestResult.drawId;
            },
          );
        }

        latestResultIdRef.current =
          latestResult?.drawId ?? null;

        setError(null);
        firstLoad = false;
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        if (firstLoad) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "የዕጣ ውጤቶችን መጫን አልተቻለም።",
          );
        }
      } finally {
        if (firstLoad) {
          setLoading(false);
          firstLoad = false;
        }
      }
    }

    void loadResults();

    const refreshTimer =
      window.setInterval(
        () => {
          void loadResults();
        },
        2000,
      );

    return () => {
      stopped = true;
      controller.abort();

      window.clearInterval(
        refreshTimer,
      );
    };
  }, []);

  useEffect(() => {
    if (!activeLiveDrawId) {
      setLiveDraw(null);
      return;
    }

    const drawingId =
      activeLiveDrawId;

    const controller =
      new AbortController();

    let stopped = false;

    async function loadLiveState() {
      try {
        const response =
          await getLiveDrawState(
            drawingId,
            controller.signal,
          );

        if (stopped) {
          return;
        }

        /*
         * completed ሲሆን የመጨረሻውን
         * live state እንዳይጠፋ እንይዛለን።
         *
         * /results በቀጣይ polling ላይ
         * published result ይዞ ይመጣል።
         */
        setLiveDraw(
          response.live,
        );

        if (
          response.live.status ===
            "completed" ||
          response.live.publishedAt
        ) {
          setLiveOverlayOpen(true);
        }
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        if (!stopped) {
          console.error(
            "Live draw state error:",
            loadError,
          );
        }
      }
    }

    void loadLiveState();

    const liveTimer =
      window.setInterval(
        () => {
          void loadLiveState();
        },
        1000,
      );

    return () => {
      stopped = true;
      controller.abort();

      window.clearInterval(
        liveTimer,
      );
    };
  }, [activeLiveDrawId]);

  useEffect(() => {
    if (
      !liveDraw ||
      liveDraw.status !==
        "completed"
    ) {
      return;
    }

    /*
     * የተጠናቀቀ ውጤት ከታተመ በኋላ
     * Live overlay እንዲዘጋ እና
     * published result እንዲታይ እንደገና
     * public results እንዲጫን እንረዳለን።
     */
    const timer =
      window.setTimeout(
        () => {
          setLiveOverlayOpen(false);
        },
        3500,
      );

    return () =>
      window.clearTimeout(timer);
  }, [
    liveDraw?.drawId,
    liveDraw?.status,
    liveDraw?.publishedAt,
  ]);

  const selectedResult =
    results.find(
      (result) =>
        result.drawId ===
        selectedDrawId,
    ) ?? null;

  const showingLiveDraw =
    liveDraw !== null &&
    liveDraw.status ===
      "drawing" &&
    liveDraw.drawId ===
      selectedDrawId;

  const showLiveOverlay =
    liveOverlayOpen &&
    liveDraw !== null &&
    liveDraw.drawId ===
      activeLiveDrawId;

  if (loading) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            በመጫን ላይ
          </span>

          <h2>
            የዕጣ ውጤቶች
          </h2>

          <p>
            የዕጣ ውጤቶችን
            በመጫን ላይ...
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            ማስታወሻ
          </span>

          <h2>
            የዕጣ ውጤቶች
          </h2>

          <p className="results-error">
            {error}
          </p>
        </div>
      </section>
    );
  }

  const resultList =
    results;

  return (
    <>
      {showLiveOverlay &&
      liveDraw ? (
        <LiveOverlay
          liveDraw={liveDraw}
          onClose={() =>
            setLiveOverlayOpen(false)
          }
        />
      ) : null}

      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            {showingLiveDraw
              ? "🔴 ቀጥታ"
              : "የታተመ"}
          </span>

          <h2>
            {showingLiveDraw
              ? "የቀጥታ ዕጣ"
              : "የዕጣ ውጤቶች"}
          </h2>

          <p>
            {showingLiveDraw
              ? "የዕጣውን ሂደት በቀጥታ ይመልከቱ።"
              : "የተጠናቀቁ ዕጣዎችንና አሸናፊዎችን ይመልከቱ።"}
          </p>
        </div>

        {showingLiveDraw &&
        liveDraw ? (
          <LiveDraw
            live={liveDraw}
          />
        ) : selectedResult ? (
          <LiveDraw
            result={selectedResult}
          />
        ) : (
          <div className="results-card">
            <div className="results-header">
              <span className="status-badge">
                አሁን የለም
              </span>

              <h3>
                የዕጣ ውጤት
              </h3>

              <p>
                እስካሁን የታተመ የዕጣ
                ውጤት የለም።
              </p>
            </div>
          </div>
        )}

        {resultList.length > 0 ? (
          <div
            className="results-draw-list"
            role="tablist"
            aria-label="የዕጣ ውጤቶች"
          >
            {resultList.map(
              (result) => {
                const active =
                  result.drawId ===
                  selectedDrawId;

                return (
                  <button
                    key={
                      result.drawId
                    }
                    type="button"
                    role="tab"
                    aria-selected={
                      active
                    }
                    className={
                      active
                        ? "results-draw-button active"
                        : "results-draw-button"
                    }
                    onClick={() =>
                      setSelectedDrawId(
                        result.drawId,
                      )
                    }
                  >
                    <span>
                      {result.drawName}
                    </span>

                    <small>
                      {formatDate(
                        result.publishedAt,
                      )}
                    </small>
                  </button>
                );
              },
            )}
          </div>
        ) : null}

        {showingLiveDraw &&
        liveDraw ? (
          <div className="results-card">
            <div className="results-card-top">
              <div>
                <p className="results-kicker">
                  🔴 በቀጥታ ላይ
                </p>

                <h3>
                  {liveDraw.drawName}
                </h3>
              </div>

              <span className="results-completed">
                {liveDraw.revealedWinnerCount}
                {" / "}
                {liveDraw.totalWinnerCount}
              </span>
            </div>

            <div className="results-prize">
              {liveDraw.prizeImageUrl ? (
                <img
                  src={
                    liveDraw.prizeImageUrl
                  }
                  alt={
                    liveDraw.prizeName
                  }
                  className="results-prize-image"
                />
              ) : (
                <div
                  className="results-prize-placeholder"
                  aria-hidden="true"
                >
                  🎁
                </div>
              )}

              <div>
                <span>
                  ሽልማት
                </span>

                <strong>
                  {liveDraw.prizeName}
                </strong>

                {liveDraw.displayedPrizeValue !==
                null ? (
                  <small>
                    {formatMoney(
                      liveDraw.displayedPrizeValue,
                    )}
                  </small>
                ) : null}
              </div>
            </div>

            <div className="results-summary">
              <div>
                <span>
                  ተሳታፊዎች
                </span>

                <strong>
                  {liveDraw.eligibleEntryCount.toLocaleString(
                    "en-US",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  አሸናፊዎች
                </span>

                <strong>
                  {liveDraw.totalWinnerCount.toLocaleString(
                    "en-US",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  የተገለጹ
                </span>

                <strong>
                  {liveDraw.revealedWinnerCount.toLocaleString(
                    "en-US",
                  )}
                </strong>
              </div>
            </div>

            <div className="results-winners">
              <div className="results-winners-heading">
                <h3>
                  🎱 እየወጡ ያሉ አሸናፊዎች
                </h3>

                <span>
                  {
                    liveDraw.winners.length
                  }
                </span>
              </div>

              {liveDraw.winners.map(
                (winner) => (
                  <div
                    key={
                      winner.id
                    }
                    className="winner-row"
                  >
                    <div className="winner-rank">
                      {winner.rank}
                    </div>

                    <div className="winner-number">
                      <span>
                        ቁጥር
                      </span>

                      <strong>
                        #{winner.number}
                      </strong>
                    </div>

                    <div className="winner-user">
                      <strong>
                        {getWinnerName(
                          winner.firstName,
                          winner.lastName,
                          winner.username,
                        )}
                      </strong>

                      <small>
                        {formatDate(
                          winner.selectedAt,
                        )}
                      </small>
                    </div>

                    <div className="winner-prize">
                      {formatMoney(
                        winner.prizeAmount,
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="results-note">
              <strong>
                🔴 የቀጥታ ማስታወሻ
              </strong>

              <p>
                አሸናፊዎች ከሰርቨሩ
                በሚመጣው ተመሳሳይ
                የዕጣ ሁኔታ መሰረት
                አንድ በአንድ
                እየተገለጹ ነው።
              </p>
            </div>
          </div>
        ) : selectedResult ? (
          <div className="results-card">
            <div className="results-card-top">
              <div>
                <p className="results-kicker">
                  የተጠናቀቀ ዕጣ
                </p>

                <h3>
                  {selectedResult.drawName}
                </h3>
              </div>

              <span className="results-completed">
                ✓ ተጠናቋል
              </span>
            </div>

            <div className="results-prize">
              {selectedResult.prizeImageUrl ? (
                <img
                  src={
                    selectedResult.prizeImageUrl
                  }
                  alt={
                    selectedResult.prizeName
                  }
                  className="results-prize-image"
                />
              ) : (
                <div
                  className="results-prize-placeholder"
                  aria-hidden="true"
                >
                  🎁
                </div>
              )}

              <div>
                <span>
                  ሽልማት
                </span>

                <strong>
                  {selectedResult.prizeName}
                </strong>

                {selectedResult.displayedPrizeValue !==
                null ? (
                  <small>
                    {formatMoney(
                      selectedResult.displayedPrizeValue,
                    )}
                  </small>
                ) : null}
              </div>
            </div>

            <div className="results-summary">
              <div>
                <span>
                  ተሳታፊዎች
                </span>

                <strong>
                  {selectedResult.eligibleEntryCount.toLocaleString(
                    "en-US",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  አሸናፊዎች
                </span>

                <strong>
                  {selectedResult.winnerCount.toLocaleString(
                    "en-US",
                  )}
                </strong>
              </div>

              <div>
                <span>
                  የተወጣበት ቀን
                </span>

                <strong>
                  {formatDate(
                    selectedResult.executedAt,
                  )}
                </strong>
              </div>
            </div>

            <div className="results-winners">
              <div className="results-winners-heading">
                <h3>
                  🏆 አሸናፊዎች
                </h3>

                <span>
                  {
                    selectedResult
                      .winners
                      .length
                  }
                </span>
              </div>

              {selectedResult.winners.map(
                (winner) => (
                  <div
                    key={
                      winner.id
                    }
                    className="winner-row"
                  >
                    <div className="winner-rank">
                      {winner.rank}
                    </div>

                    <div className="winner-number">
                      <span>
                        ቁጥር
                      </span>

                      <strong>
                        #{winner.number}
                      </strong>
                    </div>

                    <div className="winner-user">
                      <strong>
                        {getWinnerName(
                          winner.firstName,
                          winner.lastName,
                          winner.username,
                        )}
                      </strong>

                      <small>
                        {formatDate(
                          winner.selectedAt,
                        )}
                      </small>
                    </div>

                    <div className="winner-prize">
                      {formatMoney(
                        winner.prizeAmount,
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="results-note">
              <strong>
                የውጤት ማስታወሻ
              </strong>

              <p>
                ይህ ውጤት በbackend
                በsecure random
                ተወስኖ የታተመ
                የዕጣ ውጤት ነው።
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
