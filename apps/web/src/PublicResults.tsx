import {
  useEffect,
  useState,
} from "react";

import {
  getPublishedResults,
  type PublicDrawResult,
} from "./api";

function formatMoney(
  value: number,
): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

function formatDate(
  value: string,
): string {
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

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedDrawId, setSelectedDrawId] =
    useState<string | null>(null);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadResults() {
      try {
        setLoading(true);
        setError(null);

        const response =
          await getPublishedResults(
            controller.signal,
          );

        setResults(response.results);

        if (response.results.length > 0) {
          setSelectedDrawId(
            response.results[0].drawId,
          );
        }
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "የዕጣ ውጤቶችን መጫን አልተቻለም።",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadResults();

    return () => {
      controller.abort();
    };
  }, []);

  const selectedResult =
    results.find(
      (result) =>
        result.drawId ===
        selectedDrawId,
    ) ?? null;

  if (loading) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            በመጫን ላይ
          </span>

          <h2>የዕጣ ውጤቶች</h2>

          <p>
            የታተሙ የዕጣ ውጤቶችን
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

          <h2>የዕጣ ውጤቶች</h2>

          <p className="results-error">
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (results.length === 0) {
    return (
      <section className="results-section">
        <div className="results-header">
          <span className="status-badge">
            አሁን የለም
          </span>

          <h2>የዕጣ ውጤቶች</h2>

          <p>
            እስካሁን የታተመ የዕጣ
            ውጤት የለም።
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="results-section">
      <div className="results-header">
        <span className="status-badge">
          የታተመ
        </span>

        <h2>የዕጣ ውጤቶች</h2>

        <p>
          የተጠናቀቁ ዕጣዎችንና
          አሸናፊዎችን ይመልከቱ።
        </p>
      </div>

      <div
        className="results-draw-list"
        role="tablist"
        aria-label="የዕጣ ውጤቶች"
      >
        {results.map((result) => {
          const active =
            result.drawId ===
            selectedDrawId;

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
        })}
      </div>

      {selectedResult ? (
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
                  .toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>
                አሸናፊዎች
              </span>

              <strong>
                {selectedResult
                  .winnerCount
                  .toLocaleString("en-US")}
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
                {selectedResult.winners.length}
              </span>
            </div>

            {selectedResult.winners.map(
              (winner) => (
                <div
                  key={winner.id}
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
