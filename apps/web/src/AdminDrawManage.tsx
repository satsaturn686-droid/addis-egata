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
  getAdminDrawNumbers,
  scheduleManagedDraw,
  type AdminDrawExecutionResponse,
  type AdminDrawNumber,
  type AdminDrawNumbersResponse,
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

type NumberFilter =
  | "all"
  | "paid"
  | "reserved"
  | "pending_payment"
  | "available";

const NUMBER_STATUS_LABELS: Record<
  NumberFilter,
  string
> = {
  all: "ሁሉም",
  paid: "🟢 Paid",
  reserved: "🟡 Reserved",
  pending_payment: "🔵 Pending Payment",
  available: "⚪ Available",
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

function getNumberStatusLabel(
  status: AdminDrawNumber["status"],
): string {
  return (
    NUMBER_STATUS_LABELS[status] ??
    "⚪ Available"
  );
}

function getNumberStatusClass(
  status: AdminDrawNumber["status"],
): string {
  return `number-status-${status}`;
}

function formatNumber(
  number: number,
  totalNumbers: number,
): string {
  const width = Math.max(
    2,
    String(totalNumbers).length,
  );

  return `#${String(number).padStart(
    width,
    "0",
  )}`;
}

function normalizeSearch(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
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
  const [
    confirmingDraw,
      const [
    confirmingDraw,
    setConfirmingDraw,
  ] = useState<AdminDrawListItem | null>(null);
    setConfirmingDraw,
  ] = useState<AdminDrawListItem | null>(null);
  const [
    selectedNumberDrawId,
    setSelectedNumberDrawId,
  ] = useState<string | null>(null);

  const [
    numberData,
    setNumberData,
  ] = useState<
    AdminDrawNumbersResponse | null
  >(null);

  const [
    numberLoading,
    setNumberLoading,
  ] = useState(false);

  const [
    numberRefreshing,
    setNumberRefreshing,
  ] = useState(false);

  const [
    numberError,
    setNumberError,
  ] = useState<string | null>(null);

  const [
    numberSearch,
    setNumberSearch,
  ] = useState("");

  const [
    userSearch,
    setUserSearch,
  ] = useState("");

  const [
    numberFilter,
    setNumberFilter,
  ] = useState<NumberFilter>("all");

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
  const [
    countdownNow,
    setCountdownNow,
  ] = useState(Date.now());

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setCountdownNow(Date.now());
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, []);
  const loadNumberData = useCallback(
    async (
      drawId: string,
      showLoading = true,
    ) => {
      if (showLoading) {
        setNumberLoading(true);
      } else {
        setNumberRefreshing(true);
      }

      setNumberError(null);

      try {
        const response =
          await getAdminDrawNumbers(
            drawId,
          );

        setNumberData(response);
        setSelectedNumberDrawId(
          drawId,
        );
      } catch (loadError) {
        setNumberError(
          loadError instanceof Error
            ? loadError.message
            : "የቁጥሮችን ዝርዝር መጫን አልተቻለም።",
        );
      } finally {
        setNumberLoading(false);
        setNumberRefreshing(false);
      }
    },
    [],
  );

  function handleToggleNumberList(
    drawId: string,
  ) {
    if (
      selectedNumberDrawId === drawId
    ) {
      setSelectedNumberDrawId(null);
      setNumberData(null);
      setNumberError(null);
      setNumberSearch("");
      setUserSearch("");
      setNumberFilter("all");
      return;
    }

    setNumberData(null);
    setNumberSearch("");
    setUserSearch("");
    setNumberFilter("all");

    void loadNumberData(
      drawId,
      true,
    );
  }

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

  const filteredNumbers =
    useMemo(() => {
      if (!numberData) {
        return [];
      }

      const normalizedNumberSearch =
        normalizeSearch(numberSearch);

      const normalizedUserSearch =
        userSearch
          .trim()
          .toLowerCase();

      return numberData.numbers.filter(
        (item) => {
          if (
            numberFilter !== "all" &&
            item.status !== numberFilter
          ) {
            return false;
          }

          if (
            normalizedNumberSearch
          ) {
            const exactNumber =
              String(item.number);

            if (
              !exactNumber.includes(
                normalizedNumberSearch,
              )
            ) {
              return false;
            }
          }

          if (
            normalizedUserSearch
          ) {
            const displayName =
              item.user?.displayName
                ?.toLowerCase() ?? "";

            const username =
              item.user?.username
                ?.toLowerCase() ?? "";

            if (
              !displayName.includes(
                normalizedUserSearch,
              ) &&
              !username.includes(
                normalizedUserSearch,
              )
            ) {
              return false;
            }
          }

          return true;
        },
      );
    }, [
      numberData,
      numberFilter,
      numberSearch,
      userSearch,
    ]);

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

      if (
        selectedNumberDrawId ===
        draw.id
      ) {
        await loadNumberData(
          draw.id,
          false,
        );
      }
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

      if (
        selectedNumberDrawId ===
        draw.id
      ) {
        await loadNumberData(
          draw.id,
          false,
        );
      }
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
  function formatCountdown(
    drawAt: string | null,
  ): string | null {
    if (!drawAt) {
      return null;
    }

    const remaining =
      new Date(drawAt).getTime() -
      countdownNow;

    if (remaining <= 0) {
      return "ሊጀምር ነው...";
    }

    const totalSeconds =
      Math.ceil(
        remaining / 1000,
      );

    const days = Math.floor(
      totalSeconds / 86400,
    );

    const hours = Math.floor(
      (totalSeconds % 86400) /
        3600,
    );

    const minutes = Math.floor(
      (totalSeconds % 3600) /
        60,
    );

    const seconds =
      totalSeconds % 60;

    if (days > 0) {
      return `${days}ቀ ${hours}ሰ ${minutes}ደ`;
    }

    if (hours > 0) {
      return `${hours}ሰ ${minutes}ደ ${seconds}ሰ`;
    }

    return `${minutes}ደ ${seconds}ሰ`;
  }

  async function handleSchedule(
    draw: AdminDrawListItem,
  ) {
    if (draw.status !== "full") {
      return;
    }

    const value =
      scheduleValue.trim();

    if (!value) {
      setError(
        "የዕጣ መውጫ ጊዜ ይምረጡ።",
      );
      return;
    }

    const selectedTime =
      new Date(value);

    if (
      Number.isNaN(
        selectedTime.getTime(),
      ) ||
      selectedTime.getTime() <=
        Date.now()
    ) {
      setError(
        "የዕጣ መውጫ ጊዜ ወደፊት መሆን አለበት።",
      );
      return;
    }

    setBusyDrawId(draw.id);
    setError(null);
    setSuccess(null);

    try {
      await scheduleManagedDraw(
        draw.id,
        selectedTime.toISOString(),
      );

      setSchedulingDraw(null);
      setScheduleValue("");

      setSuccess(
        `“${draw.name}” ዕጣ ተወስኖለታል። Countdown ጀምሯል።`,
      );

      await loadDraws(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "የዕጣ ጊዜን ማስቀመጥ አልተቻለም።",
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

      if (
        selectedNumberDrawId ===
        draw.id
      ) {
        await loadNumberData(
          draw.id,
          false,
        );
      }
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
            <>
              <button
                type="button"
                className="draw-action secondary"
                disabled={busy}
                onClick={() => {
                  setScheduleValue(
                    draw.drawAt
                      ? new Date(
                          draw.drawAt,
                        )
                          .toISOString()
                          .slice(
                            0,
                            16,
                          )
                      : "",
                  );

                  setSchedulingDraw(
                    draw,
                  );
                }}
              >
                ⏱️{" "}
                {draw.drawAt
                  ? "ጊዜ ቀይር"
                  : "የሚወጣበት ጊዜ"}
              </button>

              <button
                type="button"
                className="draw-action primary"
                disabled={busy}
                onClick={() =>
                  setConfirmingDraw(
                    draw,
                  )
                }
              >
                {busy
                  ? "በማውጣት ላይ..."
                  : "ዕጣ አውጣ"}
              </button>
            </>
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

  function renderNumberList(
    draw: AdminDrawListItem,
  ) {
    const isSelected =
      selectedNumberDrawId ===
      draw.id;

    if (!isSelected) {
      return null;
    }

    if (numberLoading) {
      return (
        <section className="number-panel">
          <div className="number-loading">
            የቁጥሮች ዝርዝርን በመጫን ላይ...
          </div>
        </section>
      );
    }

    if (numberError) {
      return (
        <section className="number-panel">
          <div className="number-panel-header">
            <div>
              <h3 className="number-panel-title">
                🔢 የቁጥሮች ዝርዝር
              </h3>
              <p className="number-panel-subtitle">
                {draw.name}
              </p>
            </div>

            <button
              type="button"
              className="number-refresh"
              disabled={
                numberRefreshing
              }
              onClick={() =>
                void loadNumberData(
                  draw.id,
                  false,
                )
              }
            >
              {numberRefreshing
                ? "..."
                : "አድስ"}
            </button>
          </div>

          <div className="message error">
            {numberError}
          </div>
        </section>
      );
    }

    if (!numberData) {
      return null;
    }

    const width =
      Math.max(
        2,
        String(
          numberData.draw
            .totalNumbers,
        ).length,
      );

    return (
      <section className="number-panel">
        <div className="number-panel-header">
          <div>
            <h3 className="number-panel-title">
              🔢 የቁጥሮች ዝርዝር
            </h3>

            <p className="number-panel-subtitle">
              {numberData.draw.name}
            </p>
          </div>

          <div className="number-panel-actions">
            <button
              type="button"
              className="number-refresh"
              disabled={
                numberRefreshing
              }
              onClick={() =>
                void loadNumberData(
                  draw.id,
                  false,
                )
              }
            >
              {numberRefreshing
                ? "በመጫን..."
                : "↻ አድስ"}
            </button>

            <button
              type="button"
              className="number-close"
              onClick={() => {
                setSelectedNumberDrawId(
                  null,
                );
                setNumberData(null);
                setNumberSearch("");
                setUserSearch("");
                setNumberFilter("all");
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="number-summary-grid">
          <div className="number-summary-card">
            <span>
              የተያዙ
            </span>
            <strong>
              {
                numberData.summary
                  .occupiedNumbers
              }
              {" / "}
              {
                numberData.summary
                  .totalNumbers
              }
            </strong>
          </div>

          <div className="number-summary-card">
            <span>
              ⚪ Available
            </span>
            <strong>
              {
                numberData.summary
                  .availableNumbers
              }
            </strong>
          </div>

          <div className="number-summary-card">
            <span>
              🟢 Paid
            </span>
            <strong>
              {
                numberData.summary
                  .paidCount
              }
            </strong>
          </div>

          <div className="number-summary-card">
            <span>
              🟡 Reserved
            </span>
            <strong>
              {
                numberData.summary
                  .reservedCount
              }
            </strong>
          </div>

          <div className="number-summary-card">
            <span>
              🔵 Pending Payment
            </span>
            <strong>
              {
                numberData.summary
                  .pendingPaymentCount
              }
            </strong>
          </div>

          <div className="number-summary-card collected">
            <span>
              💰 የተሰበሰበ
            </span>
            <strong>
              {formatMoney(
                numberData.summary
                  .collectedAmount,
              )}
            </strong>
          </div>
        </div>

        <div className="number-search-grid">
          <label className="search-field">
            <span>
              🔢 ቁጥር ፈልግ
            </span>

            <input
              type="search"
              inputMode="numeric"
              value={numberSearch}
              onChange={(event) =>
                setNumberSearch(
                  event.target.value,
                )
              }
              placeholder="#25"
            />
          </label>

          <label className="search-field">
            <span>
              👤 በተጠቃሚ ፈልግ
            </span>

            <input
              type="search"
              value={userSearch}
              onChange={(event) =>
                setUserSearch(
                  event.target.value,
                )
              }
              placeholder="Pink"
            />
          </label>
        </div>

        <div className="number-filters">
          {(
            [
              "all",
              "paid",
              "reserved",
              "pending_payment",
              "available",
            ] as NumberFilter[]
          ).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`number-filter ${
                numberFilter === filter
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setNumberFilter(
                  filter,
                )
              }
            >
              {
                NUMBER_STATUS_LABELS[
                  filter
                ]
              }
            </button>
          ))}
        </div>

        <div className="number-result-count">
          {filteredNumbers.length} /{" "}
          {numberData.numbers.length}{" "}
          ቁጥሮች ታይተዋል
        </div>

        <div className="numbers-table-wrap">
          <table className="numbers-table">
            <thead>
              <tr>
                <th>ቁጥር</th>
                <th>ተጠቃሚ</th>
                <th>ሁኔታ</th>
                <th>ክፍያ</th>
              </tr>
            </thead>

            <tbody>
              {filteredNumbers.map(
                (item) => (
                  <tr key={item.number}>
                    <td>
                      <strong>
                        {formatNumber(
                          item.number,
                          numberData.draw
                            .totalNumbers,
                        )}
                      </strong>
                    </td>

                    <td>
                      {item.user ? (
                        <div className="number-user">
                          <strong>
                            {
                              item.user
                                .displayName
                            }
                          </strong>

                          {item.user
                            .username ? (
                            <span>
                              @
                              {
                                item.user
                                  .username
                              }
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      <span
                        className={`number-status ${getNumberStatusClass(
                          item.status,
                        )}`}
                      >
                        {getNumberStatusLabel(
                          item.status,
                        )}
                      </span>

                      {item.status ===
                        "reserved" &&
                      item.reservedUntil ? (
                        <small className="reserved-until">
                          እስከ{" "}
                          {formatDate(
                            item.reservedUntil,
                          )}
                        </small>
                      ) : null}
                    </td>

                    <td>
                      {item.payment ? (
                        <div className="number-payment">
                          <strong>
                            {formatMoney(
                              item.payment
                                .amount,
                            )}
                          </strong>

                          {item.payment
                            .transactionReference ? (
                            <small>
                              {
                                item.payment
                                  .transactionReference
                              }
                            </small>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ),
              )}

              {filteredNumbers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="no-number-results"
                  >
                    የፈለጉት ቁጥር ወይም
                    ተጠቃሚ አልተገኘም።
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="number-legend">
          <span>
            🟢 Paid
          </span>
          <span>
            🟡 Reserved
          </span>
          <span>
            🔵 Pending Payment
          </span>
          <span>
            ⚪ Available
          </span>
        </div>
      </section>
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

          .number-panel {
            margin-top: 15px;
            padding: 14px;
            border: 1px solid #293746;
            border-radius: 14px;
            background: #0c1219;
          }

          .number-panel-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 14px;
          }

          .number-panel-title {
            margin: 0;
            font-size: 15px;
          }

          .number-panel-subtitle {
            margin: 4px 0 0;
            color: #7f8b98;
            font-size: 11px;
          }

          .number-panel-actions {
            display: flex;
            gap: 6px;
          }

          .number-refresh,
          .number-close {
            min-height: 38px;
            padding: 0 10px;
            border: 1px solid #2c3947;
            border-radius: 9px;
            background: #141c25;
            color: #dce4ed;
            font: inherit;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
          }

          .number-close {
            width: 38px;
            padding: 0;
          }

          .number-refresh:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .number-loading {
            padding: 28px 10px;
            text-align: center;
            color: #84919f;
            font-size: 12px;
          }

          .number-summary-grid {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 7px;
            margin-bottom: 13px;
          }

          .number-summary-card {
            padding: 10px;
            border: 1px solid #202b36;
            border-radius: 10px;
            background: #111820;
          }

          .number-summary-card span {
            display: block;
            color: #7d8a98;
            font-size: 10px;
            line-height: 1.35;
          }

          .number-summary-card strong {
            display: block;
            margin-top: 4px;
            font-size: 14px;
          }

          .number-summary-card.collected strong {
            font-size: 13px;
          }

          .number-search-grid {
            display: grid;
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 9px;
          }

          .search-field {
            display: grid;
            gap: 5px;
          }

          .search-field span {
            color: #8996a4;
            font-size: 10px;
            font-weight: 700;
          }

          .search-field input {
            width: 100%;
            min-height: 42px;
            padding: 0 11px;
            box-sizing: border-box;
            border: 1px solid #2b3846;
            border-radius: 9px;
            outline: none;
            background: #111820;
            color: #eef3f8;
            font: inherit;
            font-size: 12px;
          }

          .search-field input::placeholder {
            color: #5f6c79;
          }

          .search-field input:focus {
            border-color: #647b99;
          }

          .number-filters {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 9px;
          }

          .number-filter {
            min-height: 34px;
            padding: 0 9px;
            border: 1px solid #293644;
            border-radius: 999px;
            background: #111820;
            color: #aeb9c5;
            font: inherit;
            font-size: 10px;
            font-weight: 800;
            cursor: pointer;
          }

          .number-filter.active {
            background: #e7edf5;
            color: #0b0f14;
            border-color: #e7edf5;
          }

          .number-result-count {
            margin: 4px 0 8px;
            color: #657381;
            font-size: 10px;
          }

          .numbers-table-wrap {
            overflow-x: auto;
            border: 1px solid #202b36;
            border-radius: 10px;
          }

          .numbers-table {
            width: 100%;
            min-width: 540px;
            border-collapse: collapse;
          }

          .numbers-table th {
            padding: 9px 8px;
            border-bottom: 1px solid #293440;
            background: #131b24;
            color: #7d8a98;
            font-size: 9px;
            font-weight: 800;
            text-align: left;
            white-space: nowrap;
          }

          .numbers-table td {
            padding: 9px 8px;
            border-bottom: 1px solid #1c2630;
            color: #dce4ec;
            font-size: 11px;
            vertical-align: middle;
          }

          .numbers-table tbody tr:last-child td {
            border-bottom: 0;
          }

          .number-user,
          .number-payment {
            display: grid;
            gap: 2px;
          }

          .number-user strong,
          .number-payment strong {
            font-size: 11px;
          }

          .number-user span,
          .number-payment small,
          .reserved-until {
            color: #687684;
            font-size: 9px;
          }

          .number-status {
            display: inline-flex;
            align-items: center;
            padding: 4px 7px;
            border-radius: 999px;
            font-size: 9px;
            font-weight: 800;
            white-space: nowrap;
          }

          .number-status-paid {
            background: #12251b;
            color: #a8e5bd;
          }

          .number-status-reserved {
            background: #29251a;
            color: #ead69d;
          }

          .number-status-pending_payment {
            background: #18252e;
            color: #a8d7ed;
          }

          .number-status-available {
            background: #1b2026;
            color: #a9b2bc;
          }

          .reserved-until {
            display: block;
            margin-top: 3px;
          }

          .no-number-results {
            padding: 24px 10px !important;
            text-align: center;
            color: #6f7c89 !important;
          }

          .number-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 10px;
            color: #697785;
            font-size: 9px;
          }

          button:focus-visible,
          input:focus-visible {
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

            .number-summary-grid {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }

            .number-search-grid {
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

            .number-panel-header {
              flex-direction: column;
            }

            .number-panel-actions {
              width: 100%;
            }

            .number-refresh {
              flex: 1;
            }

            .number-summary-grid {
              grid-template-columns:
                1fr 1fr;
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
            ዕጣዎችን ክፈት፣ ዝጋ፣
            ውጤት አውጣ እና የቁጥሮችን
            የክፍያ ሁኔታ በቀጥታ ተቆጣጠር።
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
                  የዕጣ ጊዜ፦{" "}
                  {formatDate(
                    draw.drawAt,
                  )}
                </div>
                {draw.drawAt ? (
                  <div
                    style={{
                      marginTop: "8px",
                      fontWeight: 800,
                    }}
                  >
                    ⏳ Countdown:{" "}
                    {formatCountdown(
                      draw.drawAt,
                    )}
                  </div>
                ) : null}
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
                <div className="action-row">
                  {renderAction(draw)}

                  <button
                    type="button"
                    className="draw-action secondary"
                    disabled={
                      numberLoading &&
                      selectedNumberDrawId ===
                        draw.id
                    }
                    onClick={() =>
                      handleToggleNumberList(
                        draw.id,
                      )
                    }
                  >
                    {selectedNumberDrawId ===
                    draw.id
                      ? "🔢 ዝርዝሩን ዝጋ"
                      : "🔢 የቁጥሮች ዝርዝር"}
                  </button>
                </div>
              </div>

              {renderNumberList(draw)}
            </article>
          ))}
        </section>
      )}
            {schedulingDraw ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1001,
            background:
              "rgba(0, 0, 0, 0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",
            padding: "20px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: "420px",
              borderRadius: "20px",
              padding: "22px",
              background:
                "#141414",
              border:
                "1px solid rgba(255,255,255,0.12)",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.45)",
            }}
          >
            <h2
              style={{
                margin:
                  "0 0 12px",
                fontSize: "20px",
                fontWeight: 800,
              }}
            >
              ⏱️ የዕጣ መውጫ ጊዜ
            </h2>

            <p
              style={{
                margin: "0 0 18px",
                lineHeight: 1.7,
                opacity: 0.88,
              }}
            >
              “{schedulingDraw.name}”
              ዕጣ ሙሉ ነው።
              <br />
              የሚወጣበትን ጊዜ
              ምረጥ።
            </p>

            <input
              type="datetime-local"
              value={
                scheduleValue
              }
              min={
                new Date(
                  Date.now() +
                    60_000,
                )
                  .toISOString()
                  .slice(
                    0,
                    16,
                  )
              }
              onChange={(event) =>
                setScheduleValue(
                  event.target.value,
                )
              }
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                borderRadius:
                  "12px",
                marginBottom:
                  "18px",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="draw-action secondary"
                onClick={() => {
                  setSchedulingDraw(
                    null,
                  );
                  setScheduleValue(
                    "",
                  );
                }}
              >
                ተመለስ
              </button>

              <button
                type="button"
                className="draw-action primary"
                disabled={
                  busyDrawId ===
                  schedulingDraw.id
                }
                onClick={() =>
                  void handleSchedule(
                    schedulingDraw,
                  )
                }
              >
                {busyDrawId ===
                schedulingDraw.id
                  ? "በማስቀመጥ ላይ..."
                  : "Countdown ጀምር"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
            {confirmingDraw ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="execute-draw-confirm-title"
            style={{
              width: "100%",
              maxWidth: "420px",
              borderRadius: "20px",
              padding: "22px",
              background: "#141414",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
            }}
          >
            <h2
              id="execute-draw-confirm-title"
              style={{
                margin: "0 0 12px",
                fontSize: "20px",
                fontWeight: 800,
              }}
            >
              ዕጣ ለማውጣት እርግጠኛ ነህ?
            </h2>

            <p
              style={{
                margin: "0",
                lineHeight: 1.7,
                opacity: 0.88,
              }}
            >
              “{confirmingDraw.name}” ዕጣን አሁን
              በsecure random ስርዓት ማውጣት
              ትፈልጋለህ?
              <br />
              <br />
              ከተረጋገጠ በኋላ የእጣው ውጤት
              በLive መልቀቅ ይጀምራል።
            </p>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                className="draw-action secondary"
                onClick={() =>
                  setConfirmingDraw(null)
                }
              >
                ተመለስ
              </button>

              <button
                type="button"
                className="draw-action primary"
                autoFocus
                onClick={() => {
                  const drawToExecute =
                    confirmingDraw;

                  setConfirmingDraw(null);
                  void handleExecute(
                    drawToExecute,
                  );
                }}
              >
                አረጋግጥ እና ዕጣ አውጣ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
