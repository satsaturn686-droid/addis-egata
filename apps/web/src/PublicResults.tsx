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

function formatMoney(
  value: number,
): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "am-ET",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  );
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

  const latestResultIdRef =
    useRef<string | null>(null);

  useEffect(() => {
    const controller =
      new AbortController();

    let firstLoad = true;

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

              return currentSelectedId;
            },
          );
        } else {
          setActiveLiveDrawId(null);
          setLiveDraw(null);

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

        if (
          response.live.status ===
            "completed" ||
          response.live.publishedAt
        ) {
          setLiveDraw(null);
          return;
        }

        setLiveDraw(
          response.live,
        );
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

  const selectedResult =
    results.find(
      (result) =>
        result.drawId ===
        selectedDrawId,
    ) ?? null;

  const showingLiveDraw =
    liveDraw !== null &&
    liveDraw.drawId ===
      selectedDrawId;

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

  if (
    results.length === 0 &&
    !liveDraw
  ) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            አሁን የለም
          </span>

          <h2>
            የዕጣ ውጤቶች
          </h2>

          <p>
            እስካሁን የታተመ የዕጣ
            ውጤት የለም።
          </p>
        </div>
      </section>
    );
  }

  const resultList =
    results;

  return (
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
      ) : null}

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

              {liveDraw
                .displayedPrizeValue !==
                null ? (
                <small>
                  {formatMoney(
                    liveDraw
                      .displayedPrizeValue,
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
                {liveDraw
                  .eligibleEntryCount
                  .toLocaleString(
                    "en-US",
                  )}
              </strong>
            </div>

            <div>
              <span>
                አሸናፊዎች
              </span>

              <strong>
                {liveDraw
                  .totalWinnerCount
                  .toLocaleString(
                    "en-US",
                  )}
              </strong>
            </div>

            <div>
              <span>
                የተገለጹ
              </span>

              <strong>
                {liveDraw
                  .revealedWinnerCount
                  .toLocaleString(
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
                  liveDraw
                    .winners
                    .length
                }
              </span>
            </div>

            {liveDraw.winners
              .map(
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
              አሸናፊዎች በተወሰነ
              የጊዜ ልዩነት አንድ
              በአንድ እየተገለጹ
              ነው። ሁሉም ተመልካቾች
              ከሰርቨሩ የሚመጣውን
              ተመሳሳይ የዕጣ ሁኔታ
              ይመለከታሉ።
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

              {selectedResult
                .displayedPrizeValue !==
                null ? (
                <small>
                  {formatMoney(
                    selectedResult
                      .displayedPrizeValue,
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
                {selectedResult
                  .eligibleEntryCount
                  .toLocaleString(
                    "en-US",
                  )}
              </strong>
            </div>

            <div>
              <span>
                አሸናፊዎች
              </span>

              <strong>
                {selectedResult
                  .winnerCount
                  .toLocaleString(
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
                  selectedResult
                    .executedAt,
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
              ይህ ውጤት በስርዓቱ
              ከተረጋገጠ የክፍያ
              መረጃ በኋላ የተፈጸመ
              እና የታተመ የዕጣ
              ውጤት ነው።
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
