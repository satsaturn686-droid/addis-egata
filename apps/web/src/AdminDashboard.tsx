import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  getCurrentUser,
  type Payment,
} from "./api";
import {
  approvePayment,
  getPendingPayments,
  rejectPayment,
} from "./admin-api";

type AdminDashboardProps = {
  onBack?: () => void;
};

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("am-ET", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("am-ET", {
    maximumFractionDigits: 2,
  }).format(value);
}

function shortId(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function getPaymentStatusLabel(
  status: Payment["status"],
): string {
  switch (status) {
    case "pending":
      return "በማረጋገጥ ላይ";
    case "approved":
      return "ተፈቅዷል";
    case "rejected":
      return "ተቀባይነት አላገኘም";
    default:
      return status;
  }
}

export default function AdminDashboard({
  onBack,
}: AdminDashboardProps) {
  const [isCheckingAdmin, setIsCheckingAdmin] =
    useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [payments, setPayments] = useState<Payment[]>(
    [],
  );

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] =
    useState(false);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [rejectingId, setRejectingId] =
    useState<string | null>(null);

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadPayments = useCallback(
    async (showRefreshState = false) => {
      if (!isAdmin) {
        return;
      }

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const response =
          await getPendingPayments();

        setPayments(
          Array.isArray(response.payments)
            ? response.payments
            : [],
        );
      } catch (loadError) {
        if (
          loadError instanceof Error &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "የክፍያ መረጃ መጫን አልተቻለም።",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      setIsCheckingAdmin(true);
      setError(null);

      try {
        const response =
          await getCurrentUser();

        if (!active) {
          return;
        }

        const admin =
          response.user?.isAdmin === true;

        setIsAdmin(admin);

        if (!admin) {
          setError(
            "ይህን ገጽ ለመጠቀም Admin ፈቃድ ያስፈልጋል።",
          );
        }
      } catch (authError) {
        if (!active) {
          return;
        }

        setIsAdmin(false);
        setError(
          authError instanceof Error
            ? authError.message
            : "የAdmin ፈቃድ ማረጋገጥ አልተቻለም።",
        );
      } finally {
        if (active) {
          setIsCheckingAdmin(false);
        }
      }
    }

    void checkAdmin();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    void loadPayments();
  }, [isAdmin, loadPayments]);

  async function handleApprove(
    payment: Payment,
  ) {
    const confirmed = window.confirm(
      `ይህን ክፍያ ማጽደቅ ይፈልጋሉ?\n\n` +
        `መጠን: ${formatAmount(
          payment.amount,
        )} ETB\n` +
        `Transaction: ${
          payment.transactionReference
        }`,
    );

    if (!confirmed) {
      return;
    }

    setProcessingId(payment.id);
    setError(null);
    setSuccess(null);

    try {
      await approvePayment(payment.id);

      setPayments((current) =>
        current.filter(
          (item) => item.id !== payment.id,
        ),
      );

      setSuccess(
        "ክፍያው ተፈቅዷል። የEntry ሁኔታም Paid ሆኗል።",
      );
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "ክፍያውን ማጽደቅ አልተቻለም።",
      );
    } finally {
      setProcessingId(null);
    }
  }

  function startReject(paymentId: string) {
    setRejectingId(paymentId);
    setRejectionReason("");
    setError(null);
    setSuccess(null);
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectionReason("");
  }

  async function handleRejectSubmit(
    event: FormEvent<HTMLFormElement>,
    payment: Payment,
  ) {
    event.preventDefault();

    const reason =
      rejectionReason.trim();

    if (!reason) {
      setError(
        "የReject ምክንያት ያስገቡ።",
      );
      return;
    }

    setProcessingId(payment.id);
    setError(null);
    setSuccess(null);

    try {
      await rejectPayment(
        payment.id,
        reason,
      );

      setPayments((current) =>
        current.filter(
          (item) => item.id !== payment.id,
        ),
      );

      setRejectingId(null);
      setRejectionReason("");

      setSuccess(
        "ክፍያው ተReject ተደርጓል። ቁጥሩም እንደገና ሊመረጥ ይችላል።",
      );
    } catch (rejectError) {
      setError(
        rejectError instanceof Error
          ? rejectError.message
          : "ክፍያውን Reject ማድረግ አልተቻለም።",
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (isCheckingAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-loading">
          <div className="admin-spinner" />
          <h1>Admin መረጃ በመጫን ላይ...</h1>
          <p>
            የፈቃድዎን ሁኔታ በማረጋገጥ ላይ ነን።
          </p>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-denied">
          <div className="admin-icon">🔒</div>

          <h1>የAdmin ፈቃድ ያስፈልጋል</h1>

          <p>
            ይህ ገጽ ለAdmin ብቻ የተዘጋጀ ነው።
          </p>

          {error && (
            <div className="admin-error">
              {error}
            </div>
          )}

          {onBack && (
            <button
              type="button"
              className="admin-secondary-button"
              onClick={onBack}
            >
              ← ወደ መነሻ
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <style>{`
        .admin-page {
          width: 100%;
          min-height: 100%;
          box-sizing: border-box;
          padding: 16px;
          color: #f5f7fa;
          background:
            radial-gradient(
              circle at top,
              rgba(45, 212, 191, 0.08),
              transparent 34%
            ),
            #0b0f14;
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .admin-shell {
          width: min(100%, 760px);
          margin: 0 auto;
        }

        .admin-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .admin-brand {
          margin: 0;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .admin-subtitle {
          margin: 6px 0 0;
          color: #9ca8b7;
          font-size: 13px;
          line-height: 1.5;
        }

        .admin-header-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .admin-button,
        .admin-secondary-button,
        .admin-approve-button,
        .admin-reject-button {
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          padding: 10px 14px;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          transition:
            opacity 0.15s ease,
            transform 0.15s ease;
        }

        .admin-button:disabled,
        .admin-secondary-button:disabled,
        .admin-approve-button:disabled,
        .admin-reject-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .admin-button:active,
        .admin-secondary-button:active,
        .admin-approve-button:active,
        .admin-reject-button:active {
          transform: scale(0.98);
        }

        .admin-button {
          color: #0b0f14;
          background: #f5f7fa;
        }

        .admin-secondary-button {
          color: #e5e7eb;
          background: #18202a;
          border: 1px solid #2a3542;
        }

        .admin-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .admin-stat {
          padding: 15px;
          border: 1px solid #202a35;
          border-radius: 16px;
          background: #111820;
        }

        .admin-stat-label {
          color: #8f9baa;
          font-size: 12px;
        }

        .admin-stat-value {
          margin-top: 5px;
          font-size: 25px;
          line-height: 1;
          font-weight: 850;
        }

        .admin-message {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.55;
        }

        .admin-error {
          padding: 12px 14px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          border-radius: 12px;
          background: rgba(127, 29, 29, 0.22);
          color: #fecaca;
          font-size: 13px;
          line-height: 1.55;
        }

        .admin-success {
          padding: 12px 14px;
          border: 1px solid rgba(74, 222, 128, 0.3);
          border-radius: 12px;
          background: rgba(20, 83, 45, 0.22);
          color: #bbf7d0;
          font-size: 13px;
          line-height: 1.55;
        }

        .admin-list {
          display: grid;
          gap: 12px;
        }

        .admin-payment {
          overflow: hidden;
          border: 1px solid #202a35;
          border-radius: 18px;
          background: #111820;
        }

        .admin-payment-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 15px;
          border-bottom: 1px solid #202a35;
        }

        .admin-payment-amount {
          margin: 0;
          font-size: 23px;
          font-weight: 850;
        }

        .admin-payment-method {
          margin-top: 4px;
          color: #8f9baa;
          font-size: 12px;
        }

        .admin-status {
          flex: 0 0 auto;
          padding: 6px 9px;
          border-radius: 999px;
          background: rgba(251, 191, 36, 0.12);
          color: #fcd34d;
          font-size: 11px;
          font-weight: 800;
        }

        .admin-payment-body {
          padding: 15px;
        }

        .admin-detail-grid {
          display: grid;
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
          gap: 10px;
        }

        .admin-detail {
          min-width: 0;
          padding: 10px;
          border-radius: 12px;
          background: #0d131a;
        }

        .admin-detail-label {
          margin-bottom: 4px;
          color: #778392;
          font-size: 11px;
        }

        .admin-detail-value {
          overflow-wrap: anywhere;
          color: #e7ebef;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 650;
        }

        .admin-reference {
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }

        .admin-receipt {
          display: inline-flex;
          margin-top: 12px;
          color: #8ee8d8;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
        }

        .admin-actions {
          display: flex;
          gap: 9px;
          margin-top: 14px;
        }

        .admin-actions > button {
          flex: 1;
        }

        .admin-approve-button {
          color: #052e1a;
          background: #86efac;
        }

        .admin-reject-button {
          color: #450a0a;
          background: #fca5a5;
        }

        .admin-reject-form {
          margin-top: 12px;
          padding: 12px;
          border: 1px solid #313c49;
          border-radius: 14px;
          background: #0d131a;
        }

        .admin-reject-label {
          display: block;
          margin-bottom: 7px;
          color: #c8d0d9;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-reject-input {
          width: 100%;
          min-height: 90px;
          box-sizing: border-box;
          resize: vertical;
          border: 1px solid #34404d;
          border-radius: 11px;
          outline: none;
          padding: 11px;
          color: #f5f7fa;
          background: #111820;
          font: inherit;
          font-size: 13px;
        }

        .admin-reject-input:focus {
          border-color: #8ee8d8;
        }

        .admin-reject-actions {
          display: flex;
          gap: 8px;
          margin-top: 9px;
        }

        .admin-empty {
          padding: 34px 18px;
          border: 1px dashed #303b47;
          border-radius: 18px;
          text-align: center;
          background: rgba(17, 24, 32, 0.7);
        }

        .admin-empty-icon {
          font-size: 30px;
        }

        .admin-empty h2 {
          margin: 9px 0 5px;
          font-size: 17px;
        }

        .admin-empty p {
          margin: 0;
          color: #8f9baa;
          font-size: 13px;
          line-height: 1.5;
        }

        .admin-loading,
        .admin-card {
          width: min(100%, 520px);
          margin: 50px auto 0;
          box-sizing: border-box;
          padding: 22px;
          border: 1px solid #202a35;
          border-radius: 20px;
          background: #111820;
          text-align: center;
        }

        .admin-loading h1,
        .admin-card h1 {
          margin: 12px 0 6px;
          font-size: 19px;
        }

        .admin-loading p,
        .admin-card p {
          margin: 0;
          color: #8f9baa;
          font-size: 13px;
          line-height: 1.5;
        }

        .admin-spinner {
          width: 28px;
          height: 28px;
          margin: 0 auto;
          border: 3px solid #2b3642;
          border-top-color: #f5f7fa;
          border-radius: 50%;
          animation: admin-spin 0.8s linear infinite;
        }

        .admin-icon {
          font-size: 34px;
        }

        .admin-denied .admin-error {
          margin-top: 15px;
          text-align: left;
        }

        .admin-denied .admin-secondary-button {
          margin-top: 14px;
        }

        @keyframes admin-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 520px) {
          .admin-page {
            padding: 12px;
          }

          .admin-header {
            flex-direction: column;
          }

          .admin-header-actions {
            width: 100%;
            justify-content: stretch;
          }

          .admin-header-actions > button {
            flex: 1;
          }

          .admin-detail-grid {
            grid-template-columns: 1fr;
          }

          .admin-payment-top {
            flex-direction: column;
          }

          .admin-status {
            align-self: flex-start;
          }
        }
      `}</style>

      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <h1 className="admin-brand">
              Addis ዕጣ Admin
            </h1>
            <p className="admin-subtitle">
              Wallet & Payment Verification
            </p>
          </div>

          <div className="admin-header-actions">
            {onBack && (
              <button
                type="button"
                className="admin-secondary-button"
                onClick={onBack}
              >
                ← መነሻ
              </button>
            )}

            <button
              type="button"
              className="admin-button"
              onClick={() =>
                void loadPayments(true)
              }
              disabled={refreshing}
            >
              {refreshing
                ? "በመጫን ላይ..."
                : "↻ Refresh"}
            </button>
          </div>
        </header>

        <section className="admin-summary">
          <div className="admin-stat">
            <div className="admin-stat-label">
              Pending Payments
            </div>
            <div className="admin-stat-value">
              {payments.length}
            </div>
          </div>

          <div className="admin-stat">
            <div className="admin-stat-label">
              Pending Amount
            </div>
            <div className="admin-stat-value">
              {formatAmount(
                payments.reduce(
                  (total, payment) =>
                    total + payment.amount,
                  0,
                ),
              )}{" "}
              ETB
            </div>
          </div>
        </section>

        {error && (
          <div
            className="admin-message admin-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="admin-message admin-success"
            role="status"
          >
            {success}
          </div>
        )}

        {loading ? (
          <section className="admin-empty">
            <div className="admin-spinner" />
            <h2>ክፍያዎችን በመጫን ላይ...</h2>
            <p>
              Pending Telebirr payments
              በማምጣት ላይ ነን።
            </p>
          </section>
        ) : payments.length === 0 ? (
          <section className="admin-empty">
            <div className="admin-empty-icon">
              ✓
            </div>
            <h2>
              Pending payment የለም
            </h2>
            <p>
              አሁን ለAdmin ማረጋገጥ
              የሚጠብቅ የTelebirr ክፍያ የለም።
            </p>
          </section>
        ) : (
          <section className="admin-list">
            {payments.map((payment) => {
              const isProcessing =
                processingId === payment.id;

              const isRejecting =
                rejectingId === payment.id;

              return (
                <article
                  className="admin-payment"
                  key={payment.id}
                >
                  <div className="admin-payment-top">
                    <div>
                      <p className="admin-payment-amount">
                        {formatAmount(
                          payment.amount,
                        )}{" "}
                        ETB
                      </p>

                      <div className="admin-payment-method">
                        Telebirr •{" "}
                        {formatDate(
                          payment.createdAt,
                        )}
                      </div>
                    </div>

                    <span className="admin-status">
                      {getPaymentStatusLabel(
                        payment.status,
                      )}
                    </span>
                  </div>

                  <div className="admin-payment-body">
                    <div className="admin-detail-grid">
                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          Transaction Reference
                        </div>
                        <div className="admin-detail-value admin-reference">
                          {
                            payment.transactionReference
                          }
                        </div>
                      </div>

                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          Sender Name
                        </div>
                        <div className="admin-detail-value">
                          {payment.senderName ||
                            "—"}
                        </div>
                      </div>

                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          Payment ID
                        </div>
                        <div className="admin-detail-value admin-reference">
                          {shortId(payment.id)}
                        </div>
                      </div>

                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          Entry ID
                        </div>
                        <div className="admin-detail-value admin-reference">
                          {shortId(
                            payment.entryId,
                          )}
                        </div>
                      </div>

                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          User ID
                        </div>
                        <div className="admin-detail-value admin-reference">
                          {shortId(
                            payment.userId,
                          )}
                        </div>
                      </div>

                      <div className="admin-detail">
                        <div className="admin-detail-label">
                          Created
                        </div>
                        <div className="admin-detail-value">
                          {formatDate(
                            payment.createdAt,
                          )}
                        </div>
                      </div>
                    </div>

                    {payment.receiptImageUrl && (
                      <a
                        className="admin-receipt"
                        href={
                          payment.receiptImageUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        🧾 Receipt ክፈት
                      </a>
                    )}

                    {!isRejecting && (
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-approve-button"
                          onClick={() =>
                            void handleApprove(
                              payment,
                            )
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing
                            ? "በመስራት ላይ..."
                            : "✓ Approve"}
                        </button>

                        <button
                          type="button"
                          className="admin-reject-button"
                          onClick={() =>
                            startReject(
                              payment.id,
                            )
                          }
                          disabled={isProcessing}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}

                    {isRejecting && (
                      <form
                        className="admin-reject-form"
                        onSubmit={(event) =>
                          void handleRejectSubmit(
                            event,
                            payment,
                          )
                        }
                      >
                        <label
                          className="admin-reject-label"
                          htmlFor={`reject-${payment.id}`}
                        >
                          የReject ምክንያት
                        </label>

                        <textarea
                          id={`reject-${payment.id}`}
                          className="admin-reject-input"
                          value={rejectionReason}
                          onChange={(event) =>
                            setRejectionReason(
                              event.target.value,
                            )
                          }
                          placeholder="ለምሳሌ፦ Transaction reference አልተረጋገጠም።"
                          maxLength={500}
                          autoFocus
                          disabled={isProcessing}
                        />

                        <div className="admin-reject-actions">
                          <button
                            type="button"
                            className="admin-secondary-button"
                            onClick={
                              cancelReject
                            }
                            disabled={
                              isProcessing
                            }
                          >
                            ተመለስ
                          </button>

                          <button
                            type="submit"
                            className="admin-reject-button"
                            disabled={
                              isProcessing ||
                              !rejectionReason.trim()
                            }
                          >
                            {isProcessing
                              ? "በመላክ ላይ..."
                              : "Reject አረጋግጥ"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
