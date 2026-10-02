import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  openAdminDraw,
} from "./admin-draw-api";

import {
  getAdminDrawList,
  type AdminDrawListItem,
} from "./admin-draw-list-api";

import {
  closeManagedDraw,
  executeManagedDraw,
  type AdminDrawExecutionResponse,
} from "./admin-draw-manage-api";

const STATUS_LABELS: Record<
  AdminDrawListItem["status"],
  string
> = {
  draft: "ዝግጁ ያልሆነ",
  open: "ክፍት",
  full: "ሙሉ",
  closed: "ዝግ",
  drawing: "ዕጣ በመውጣት ላይ",
  completed: "ተጠናቋል",
  cancelled: "ተሰርዟል",
};

const STATUS_CLASS: Record<
  AdminDrawListItem["status"],
  string
> = {
  draft: "status-draft",
  open: "status-open",
  full: "status-full",
  closed: "status-closed",
  drawing: "status-drawing",
  completed: "status-completed",
  cancelled: "status-cancelled",
};

function formatMoney(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits: 2,
    },
  ).format(value)} ETB`;
}

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "am-ET",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getPrizeText(
  draw: AdminDrawListItem,
): string {
  if (draw.prizeType === "cash") {
    return draw.displayedPrizeValue !== null
      ? formatMoney(
          draw.displayedPrizeValue,
        )
      : draw.prizeName;
  }

  return draw.prizeName;
}

function canOpen(
  status: AdminDrawListItem["status"],
): boolean {
  return (
    status === "draft" ||
    status === "closed"
  );
}

function canClose(
  status: AdminDrawListItem["status"],
): boolean {
  return (
    status === "open" ||
    status === "full"
  );
}

function canExecute(
  status: AdminDrawListItem["status"],
): boolean {
  return (
    status === "full" ||
    status === "closed"
  );
}

export default function AdminDrawManage() {
  const [draws, setDraws] = useState<
    AdminDrawListItem[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [busyDrawId, setBusyDrawId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [executionResult, setExecutionResult] =
    useState<
      AdminDrawExecutionResponse["result"] | null
    >(null);

  const loadDraws = useCallback(
    async (
      showRefreshing = false,
    ) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const response =
          await getAdminDrawList();

        setDraws(response.draws);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "የዕጣ ዝርዝርን መጫን አልተቻለም።",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadDraws();
  }, [loadDraws]);

  const summary = useMemo(() => {
    return {
      total: draws.length,
      active: draws.filter(
        (draw) =>
          draw.status === "open" ||
          draw.status === "full",
      ).length,
      completed: draws.filter(
        (draw) =>
          draw.status === "completed",
      ).length,
      draft: draws.filter(
        (draw) =>
          draw.status === "draft",
      ).length,
    };
  }, [draws]);

  async function handleOpen(
    draw: AdminDrawListItem,
  ) {
    if (!canOpen(draw.status)) {
      return;
    }

    const isReopen =
      draw.status === "closed";

    const confirmed =
      window.confirm(
        isReopen
          ? `“${draw.name}” ዕጣን ድጋሚ ክፍት ማድረግ ይፈልጋሉ?\n\nየተከፈሉ መግቢያዎች አይሰረዙም።`
          : `“${draw.name}” ዕጣን ለተሳታፊዎች ክፍት ማድረግ ይፈልጋሉ?`,
      );

    if (!confirmed) {
      return;
    }

    setBusyDrawId(draw.id);
    setError(null);
    setSuccess(null);
    setExecutionResult(null);

    try {
      await openAdminDraw(draw.id);

      setSuccess(
        isReopen
          ? `“${draw.name}” ዕጣ ድጋሚ ተከፍቷል።`
          : `“${draw.name}” ዕጣ ተከፍቷል።`,
      );

      await loadDraws(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "ዕጣውን መክፈት አልተቻለም።",
      );
    } finally {
      setBusyDrawId(null);
    }
  }

  async function handleClose(
    draw: AdminDrawListItem,
  ) {
    if (!canClose(draw.status)) {
      return;
    }

    const confirmed =
      window.confirm(
        `“${draw.name}” ዕጣን መዝጋት ይፈልጋሉ?\n\nከዘጉ በኋላ አዲስ ቁጥር ምርጫ አይቀጥልም።`,
      );

    if (!confirmed) {
      return;
    }

    setBusyDrawId(draw.id);
    setError(null);
    setSuccess(null);
    setExecutionResult(null);

    try {
      await closeManagedDraw(
        draw.id,
      );

      setSuccess(
        `“${draw.name}” ዕጣ ተዘግቷል።`,
      );

      await loadDraws(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "ዕጣውን መዝጋት አልተቻለም።",
      );
    } finally {
      setBusyDrawId(null);
    }
  }

  async function handleExecute(
    draw: AdminDrawListItem,
  ) {
    if (!canExecute(draw.status)) {
      return;
    }

    const confirmed =
      window.confirm(
        `“${draw.name}” ዕጣን አሁን በsecure random ስርዓት ማውጣት ይፈልጋሉ?\n\nይህ እርምጃ ከተፈጸመ በኋላ ውጤቱ እንደ ተጠናቀቀ ይመዘገባል።`,
      );

    if (!confirmed) {
      return;
    }

    setBusyDrawId(draw.id);
    setError(null);
    setSuccess(null);
    setExecutionResult(null);

    try {
      const response =
        await executeManagedDraw(
          draw.id,
        );

      setExecutionResult(
        response.result,
      );

      setSuccess(
        `“${draw.name}” ዕጣ ተሳክቶ ወጥቷል።`,
      );

      await loadDraws(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "ዕጣውን ማውጣት አልተቻለም።",
      );
    } finally {
      setBusyDrawId(null);
    }
  }

  function renderAction(
    draw: AdminDrawListItem,
  ) {
    const busy =
      busyDrawId === draw.id;

    if (
      draw.status === "draft" ||
      draw.status === "closed"
    ) {
      return (
        <button
          type="button"
          className="draw-action primary"
          disabled={busy}
          onClick={() =>
            void handleOpen(draw)
          }
        >
          {busy
            ? "በመክፈት ላይ..."
            : draw.status === "closed"
              ? "ድጋሚ ክፈት"
              : "ዕጣውን ክፈት"}
        </button>
      );
    }

    if (
      draw.status === "open" ||
      draw.status === "full"
    ) {
      return (
        <div className="action-row">
          <button
            type="button"
            className="draw-action secondary"
            disabled={busy}
            onClick={() =>
              void handleClose(draw)
            }
          >
            {busy
              ? "በመዝጋት ላይ..."
              : "ዝጋ"}
          </button>

          {draw.status === "full" ? (
            <button
              type="button"
              className="draw-action primary"
              disabled={busy}
              onClick={() =>
                void handleExecute(draw)
              }
            >
              {busy
                ? "በማውጣት ላይ..."
                : "ዕጣ አውጣ"}
            </button>
          ) : null}
        </div>
      );
    }

    if (draw.status === "completed") {
      return (
        <span className="action-note">
          ውጤቱ ታትሟል
        </span>
      );
    }

    if (draw.status === "drawing") {
      return (
        <span className="action-note">
          ዕጣው እየወጣ ነው
        </span>
      );
    }

    return (
      <span className="action-note">
        ምንም እርምጃ የለም
      </span>
    );
  }

  return (
    <main className="admin-draw-manage">
      <style>
        {`
          .admin-draw-manage {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            padding: 18px 16px 40px;
            box-sizing: border-box;
            color: #f4f7fb;
          }

          .manage-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 18px;
          }

          .manage-title {
            margin: 0;
            font-size: 21px;
            line-height: 1.25;
          }

          .manage-subtitle {
            margin: 6px 0 0;
            color: #7f8b98;
            font-size: 13px;
            line-height: 1.5;
          }

          .refresh-button {
            min-height: 44px;
            padding: 0 14px;
            border: 1px solid #293442;
            border-radius: 10px;
            background: #111720;
            color: #dce4ed;
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            white-space: nowrap;
          }

          .refresh-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .summary-grid {
            display: grid;
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
            gap: 9px;
            margin-bottom: 18px;
          }

          .summary-card {
            padding: 12px;
            border: 1px solid #202a35;
            border-radius: 12px;
            background: #10161e;
          }

          .summary-label {
            color: #7f8b98;
            font-size: 11px;
          }

          .summary-value {
            margin-top: 5px;
            font-size: 20px;
            font-weight: 800;
          }

          .message {
            margin-bottom: 14px;
            padding: 12px 13px;
            border-radius: 10px;
            font-size: 13px;
            line-height: 1.45;
          }

          .message.error {
            border: 1px solid #5a2b32;
            background: #241318;
            color: #ffb8c0;
          }

          .message.success {
            border: 1px solid #294b39;
            background: #101d17;
            color: #a9e2bf;
          }

          .execution-result {
            margin-bottom: 16px;
            padding: 15px;
            border: 1px solid #354152;
            border-radius: 12px;
            background: #111821;
          }

          .execution-result h3 {
            margin: 0 0 10px;
            font-size: 14px;
          }

          .result-grid {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 9px;
          }

          .result-item {
            padding: 10px;
            border-radius: 9px;
            background: #0b1016;
          }

          .result-item span {
            display: block;
            color: #7f8b98;
            font-size: 11px;
          }

          .result-item strong {
            display: block;
            margin-top: 4px;
            font-size: 15px;
          }

          .draw-list {
            display: grid;
            gap: 12px;
          }

          .draw-card {
            padding: 15px;
            border: 1px solid #222d39;
            border-radius: 14px;
            background: #10161e;
          }

          .draw-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }

          .draw-name {
            margin: 0;
            font-size: 17px;
            line-height: 1.35;
          }

          .prize-name {
            margin: 5px 0 0;
            color: #9aa7b5;
            font-size: 12px;
          }

          .status-badge {
            flex-shrink: 0;
            padding: 6px 9px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
          }

          .status-draft {
            background: #28251b;
            color: #e7d9a4;
          }

          .status-open {
            background: #12251b;
            color: #a8e5bd;
          }

          .status-full {
            background: #17252f;
            color: #a9d9f1;
          }

          .status-closed {
            background: #25222a;
            color: #c8bdcf;
          }

          .status-drawing {
            background: #25201a;
            color: #f1cf98;
          }

          .status-completed {
            background: #19212b;
            color: #c1cedc;
          }

          .status-cancelled {
            background: #26181b;
            color: #e6aeb5;
          }

          .draw-stats {
            display: grid;
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-top: 14px;
          }

          .draw-stat {
            min-width: 0;
          }

          .draw-stat-label {
            display: block;
            color: #6f7c89;
            font-size: 10px;
          }

          .draw-stat-value {
            display: block;
            margin-top: 3px;
            color: #dfe6ee;
            font-size: 12px;
            font-weight: 700;
            overflow-wrap: anywhere;
          }

          .draw-times {
            display: grid;
            gap: 5px;
            margin-top: 13px;
            padding-top: 12px;
            border-top: 1px solid #202a34;
            color: #8996a4;
            font-size: 11px;
            line-height: 1.5;
          }

          .draw-actions {
            margin-top: 14px;
          }

          .action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .draw-action {
            min-height: 44px;
            padding: 0 14px;
            border-radius: 10px;
            border: 1px solid #34404e;
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
          }

          .draw-action.primary {
            background: #e7edf5;
            color: #0b0f14;
            border-color: #e7edf5;
          }

          .draw-action.secondary {
            background: #151c25;
            color: #d7e0e9;
          }

          .draw-action:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .action-note {
            color: #7f8b98;
            font-size: 12px;
          }

          .empty-state {
            padding: 28px 16px;
            border: 1px dashed #293442;
            border-radius: 14px;
            text-align: center;
            color: #7f8b98;
            font-size: 13px;
          }

          .loading {
            padding: 30px 16px;
            text-align: center;
            color: #8d99a7;
            font-size: 13px;
          }

          button:focus-visible {
            outline: 2px solid #8aa2ff;
            outline-offset: 2px;
          }

          @media (max-width: 640px) {
            .admin-draw-manage {
              padding-left: 12px;
              padding-right: 12px;
            }

            .summary-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .draw-stats {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .result-grid {
              grid-template-columns:
                1fr;
            }
          }

          @media (max-width: 460px) {
            .manage-header {
              flex-direction: column;
            }

            .refresh-button {
              width: 100%;
            }

            .draw-card-head {
              flex-direction: column;
            }

            .status-badge {
              align-self: flex-start;
            }
          }
        `}
      </style>

      <header className="manage-header">
        <div>
          <h1 className="manage-title">
            ዕጣ አስተዳደር
          </h1>

          <p className="manage-subtitle">
            ዕጣዎችን ክፈት፣ ዝጋ እና
            የተዘጋ ዕጣን በsecure random
            ስርዓት አውጣ።
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          disabled={
            loading ||
            refreshing ||
            busyDrawId !== null
          }
          onClick={() =>
            void loadDraws(true)
          }
        >
          {refreshing
            ? "በመጫን ላይ..."
            : "አድስ"}
        </button>
      </header>

      <section
        className="summary-grid"
        aria-label="የዕጣ ማጠቃለያ"
      >
        <div className="summary-card">
          <div className="summary-label">
            ጠቅላላ
          </div>
          <div className="summary-value">
            {summary.total}
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-label">
            ንቁ
          </div>
          <div className="summary-value">
            {summary.active}
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-label">
            ዝግጁ
          </div>
          <div className="summary-value">
            {summary.draft}
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-label">
            ተጠናቋል
          </div>
          <div className="summary-value">
            {summary.completed}
          </div>
        </div>
      </section>

      {error ? (
        <div
          className="message error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          className="message success"
          role="status"
        >
          {success}
        </div>
      ) : null}

      {executionResult ? (
        <section className="execution-result">
          <h3>
            የመጨረሻ የዕጣ ውጤት
          </h3>

          <div className="result-grid">
            <div className="result-item">
              <span>
                አሸናፊዎች
              </span>
              <strong>
                {executionResult.winners.length}
              </strong>
            </div>

            <div className="result-item">
              <span>
                የተመረጡ ተሳታፊዎች
              </span>
              <strong>
                {
                  executionResult.eligibleEntryCount
                }
              </strong>
            </div>

            <div className="result-item">
              <span>
                የተፈጸመበት ጊዜ
              </span>
              <strong>
                {formatDate(
                  executionResult.executedAt,
                )}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="loading">
          የዕጣ ዝርዝሮችን በመጫን ላይ...
        </div>
      ) : draws.length === 0 ? (
        <div className="empty-state">
          እስካሁን የተፈጠረ ዕጣ የለም።
        </div>
      ) : (
        <section className="draw-list">
          {draws.map((draw) => (
            <article
              key={draw.id}
              className="draw-card"
            >
              <div className="draw-card-head">
                <div>
                  <h2 className="draw-name">
                    {draw.name}
                  </h2>

                  <p className="prize-name">
                    ሽልማት፦{" "}
                    {getPrizeText(draw)}
                  </p>
                </div>

                <span
                  className={`status-badge ${
                    STATUS_CLASS[
                      draw.status
                    ]
                  }`}
                >
                  {
                    STATUS_LABELS[
                      draw.status
                    ]
                  }
                </span>
              </div>

              <div className="draw-stats">
                <div className="draw-stat">
                  <span className="draw-stat-label">
                    የመግቢያ ክፍያ
                  </span>
                  <span className="draw-stat-value">
                    {formatMoney(
                      draw.entryFee,
                    )}
                  </span>
                </div>

                <div className="draw-stat">
                  <span className="draw-stat-label">
                    ቁጥሮች
                  </span>
                  <span className="draw-stat-value">
                    {draw.totalNumbers}
                  </span>
                </div>

                <div className="draw-stat">
                  <span className="draw-stat-label">
                    አሸናፊዎች
                  </span>
                  <span className="draw-stat-value">
                    {draw.winnerCount}
                  </span>
                </div>

                <div className="draw-stat">
                  <span className="draw-stat-label">
                    ልዩ አሸናፊ
                  </span>
                  <span className="draw-stat-value">
                    {draw.uniqueWinners
                      ? "አዎ"
                      : "አይ"}
                  </span>
                </div>
              </div>

              <div className="draw-times">
                <div>
                  መጀመሪያ፦{" "}
                  {formatDate(
                    draw.startsAt,
                  )}
                </div>

                <div>
                  መጨረሻ፦{" "}
                  {formatDate(
                    draw.deadlineAt,
                  )}
                </div>

                <div>
                  የዕጣ ጊዜ፦{" "}
                  {formatDate(
                    draw.drawAt,
                  )}
                </div>

                {draw.actualPrizeCost !==
                null ? (
                  <div>
                    የሽልማት ወጪ፦{" "}
                    {formatMoney(
                      draw.actualPrizeCost,
                    )}
                  </div>
                ) : null}
              </div>

              <div className="draw-actions">
                {renderAction(draw)}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
