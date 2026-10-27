import { useCallback, useEffect, useRef, useState } from "react";

import {
getCurrentLiveDrawState,
getLiveDrawState,
getPublishedResults,
type LiveDrawState,
type PublicDrawResult,
} from "./api";

import LiveDraw from "./LiveDraw";

async function withTimeout<T>(
task: (signal: AbortSignal) => Promise<T>,
timeoutMs = 8000,
): Promise<T> {
const controller = new AbortController();
let timer = 0;

try {
return await Promise.race([
task(controller.signal),
new Promise<never>((_, reject) => {
timer = window.setTimeout(() => {
controller.abort();
reject(new Error("የሰርቨር ምላሽ ዘግይቷል። እንደገና ይሞክሩ።"));
}, timeoutMs);
}),
]);
} finally {
window.clearTimeout(timer);
controller.abort();
}
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
<div
style={{
display: "flex",
justifyContent: "flex-end",
marginBottom: 8,
}}
>
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

const mountedRef = useRef(true);
const loadingRef = useRef(false);
const previousLiveDrawIdRef = useRef<string | null>(null);

const loadResults = useCallback(async () => {
if (loadingRef.current) return;
loadingRef.current = true;

try {
  const [publishedOutcome, liveOutcome] = await Promise.allSettled([
    withTimeout((signal) => getPublishedResults(signal)),
    withTimeout((signal) => getCurrentLiveDrawState(signal)),
  ]);

  if (!mountedRef.current) return;

  let succeeded = false;

  if (publishedOutcome.status === "fulfilled") {
    succeeded = true;

    const response = publishedOutcome.value;
    const nextResults = Array.isArray(response.results)
      ? response.results
      : [];

    setResults(nextResults);

    // Do not automatically open a result.
    // The user opens it by tapping its draw row.
    setSelectedDrawId((currentId) => {
      if (
        currentId &&
        nextResults.some((result) => result.drawId === currentId)
      ) {
        return currentId;
      }

      return null;
    });
  }

  if (liveOutcome.status === "fulfilled") {
    succeeded = true;

    const currentLive = liveOutcome.value;

    if (currentLive) {
      const isNewDraw =
        previousLiveDrawIdRef.current !== currentLive.drawId;

      setActiveLiveDrawId(currentLive.drawId);
      previousLiveDrawIdRef.current = currentLive.drawId;

      if (isNewDraw) {
        setLiveOverlayOpen(true);
      }
    } else {
      setActiveLiveDrawId(null);
      previousLiveDrawIdRef.current = null;
      setLiveDraw(null);
      setLiveOverlayOpen(false);
    }
  }

  if (succeeded) {
    setError(null);
  } else {
    const reason =
      publishedOutcome.status === "rejected"
        ? publishedOutcome.reason
        : liveOutcome.status === "rejected"
          ? liveOutcome.reason
          : null;

    setError(
      reason instanceof Error
        ? reason.message
        : "የዕጣ ውጤቶችን ማምጣት አልተቻለም።",
    );
  }
} catch (loadError) {
  if (mountedRef.current) {
    setError(
      loadError instanceof Error
        ? loadError.message
        : "የዕጣ ውጤቶችን ማምጣት አልተቻለም።",
    );
  }
} finally {
  loadingRef.current = false;

  if (mountedRef.current) {
    setLoading(false);
  }
}

}, []);

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
if (!activeLiveDrawId) return;

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
liveDraw.drawId === activeLiveDrawId;

const showLiveOverlay =
liveOverlayOpen &&
liveDraw !== null &&
liveDraw.drawId === activeLiveDrawId;

if (loading && results.length === 0 && !error) {
return (
<section className="results-section">
<div className="results-header">
<span className="status-badge">በመጫን ላይ</span>
<h2>🏆 የዕጣ ውጤቶች</h2>
<p>የዕጣ ዝርዝሩን በመጫን ላይ...</p>
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
        {showingLiveDraw ? "🔴 ቀጥታ" : "የዕጣ ታሪክ"}
      </span>

      <h2>🏆 የዕጣ ውጤቶች</h2>

      <p>
        የዕጣውን ውጤት ለማየት ከታች ካሉት ዕጣዎች አንዱን ይንኩ።
      </p>
    </div>

    {showingLiveDraw && liveDraw && (
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

        <LiveDraw live={liveDraw} />
      </div>
    )}

    {results.length > 0 ? (
      <div
        className="results-draw-list"
        role="list"
        aria-label="የተጠናቀቁ ዕጣዎች"
      >
        {results.map((result) => {
          const active = result.drawId === selectedDrawId;

          return (
            <div
              key={result.drawId}
              className="results-draw-item"
              style={{ marginBottom: 8 }}
            >
              <button
                type="button"
                className={
                  active
                    ? "results-draw-button active"
                    : "results-draw-button"
                }
                aria-expanded={active}
                onClick={() =>
                  setSelectedDrawId((currentId) =>
                    currentId === result.drawId ? null : result.drawId,
                  )
                }
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  textAlign: "left",
                }}
              >
                <span>
                  🏆 {result.drawName}
                  <small
                    style={{
                      display: "block",
                      marginTop: 4,
                      opacity: 0.75,
                    }}
                  >
                    {formatDate(result.publishedAt)}
                  </small>
                </span>

                <span aria-hidden="true">{active ? "▲" : "▼"}</span>
              </button>

              {active && (
                <div className="results-selected-draw">
                  <div className="results-card">
                    <div className="results-card-top">
                      <div>
                        <p className="results-kicker">የተጠናቀቀ ዕጣ</p>
                        <h3>{result.drawName}</h3>
                      </div>

                      <span className="results-completed">
                        ✓ ተጠናቋል
                      </span>
                    </div>

                    <LiveDraw result={result} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="results-card">
        <div className="results-header">
          <span className="status-badge">ማስታወሻ</span>
          <h3>የተጠናቀቁ ዕጣዎች</h3>
          <p>
            {error
              ? error
              : "እስካሁን የታተመ የዕጣ ውጤት የለም።"}
          </p>

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
      </div>
    )}

    {error && results.length > 0 && (
      <p className="results-error" role="status">
        የመረጃ ማደስ ችግር ተፈጥሯል። እንደገና እየሞከርን ነው።
      </p>
    )}
  </section>
</>

);
}
