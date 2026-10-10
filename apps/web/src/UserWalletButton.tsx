
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { getPaymentSettings } from "./api";

import {
  createWalletDeposit,
  createWalletWithdrawal,
  getWallet,
  getWalletHistory,
  type WalletHistory,
} from "./Wallet-api";

type HistoryTab =
  | "transactions"
  | "deposits"
  | "withdrawals";

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ብር`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("am-ET", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "በመጠባበቅ ላይ",
    approved: "ጸድቋል",
    paid: "ተከፍሏል",
    rejected: "ውድቅ ተደርጓል",
    completed: "ተጠናቋል",
    success: "ተሳክቷል",
    failed: "አልተሳካም",
  };

  return labels[status.toLowerCase()] ?? status;
}

function statusColor(status: string): string {
  const value = status.toLowerCase();

  if (
    ["approved", "paid", "completed", "success"].includes(value)
  ) {
    return "#34d399";
  }

  if (["rejected", "failed"].includes(value)) {
    return "#f87171";
  }

  return "#fbbf24";
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "48px",
  boxSizing: "border-box",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  padding: "12px",
  fontSize: "16px",
};

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  marginTop: "14px",
  padding: "14px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: "40px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  padding: "8px 12px",
  cursor: "pointer",
};

export default function UserWalletButton() {
  const [open, setOpen] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [telebirrNumber, setTelebirrNumber] = useState("");

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [senderName, setSenderName] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTelebirr, setWithdrawTelebirr] = useState("");

  const [loading, setLoading] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] =
    useState<HistoryTab>("transactions");

  async function loadWallet() {
    setLoading(true);
    setError(null);

    try {
      const [walletResponse, settingsResponse] = await Promise.all([
        getWallet(),
        getPaymentSettings(),
      ]);

      setBalance(walletResponse.wallet.balance);
      setTelebirrNumber(settingsResponse.settings.telebirrNumber);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Wallet መረጃ መጫን አልተቻለም።",
      );
    } finally {
      setLoading(false);
    }

    await loadHistory();
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await getWalletHistory();
      setHistory(response.history);
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "የግብይት ታሪክ መጫን አልተቻለም።",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadWallet();
    }
  }, [open]);

  async function handleDeposit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const numericAmount = Number(amount);
    const trimmedReference = reference.trim();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("ትክክለኛ የDeposit መጠን ያስገቡ።");
      return;
    }

    if (!trimmedReference) {
      setError("የTelebirr Transaction Reference ያስገቡ።");
      return;
    }

    setDepositing(true);
    setError(null);
    setMessage(null);

    try {
      await createWalletDeposit(
        numericAmount,
        trimmedReference,
        senderName.trim() || undefined,
      );

      setReference("");
      setSenderName("");
      setAmount("");

      setMessage(
        "✓ Deposit ጥያቄዎ ተልኳል። Admin ካረጋገጠ በኋላ Wallet ብርዎ ይጨምራል።",
      );

      await loadWallet();
    } catch (depositError) {
      setError(
        depositError instanceof Error
          ? depositError.message
          : "Deposit ማስገባት አልተቻለም።",
      );
    } finally {
      setDepositing(false);
    }
  }

  async function handleWithdraw(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const numericAmount = Number(withdrawAmount);
    const number = withdrawTelebirr.trim();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("ትክክለኛ የWithdraw መጠን ያስገቡ።");
      return;
    }

    if (balance !== null && numericAmount > balance) {
      setError("በWallet ውስጥ ካለው ብር በላይ Withdraw ማድረግ አይችሉም።");
      return;
    }

    if (!number) {
      setError("የሚቀበሉበት Telebirr ቁጥር ያስገቡ።");
      return;
    }

    setWithdrawing(true);
    setError(null);
    setMessage(null);

    try {
      await createWalletWithdrawal(numericAmount, number);

      setWithdrawAmount("");
      setWithdrawTelebirr("");

      setMessage(
        "✓ Withdraw ጥያቄዎ ተልኳል። Admin ክፍያውን ካጠናቀቀ በኋላ ይረጋገጣል።",
      );

      await loadWallet();
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Withdraw ማስገባት አልተቻለም።",
      );
    } finally {
      setWithdrawing(false);
    }
  }

  function openWallet() {
    setOpen(true);
    setMessage(null);
    setError(null);
  }

  function closeWallet() {
    setOpen(false);
    setMessage(null);
    setError(null);
  }

  const transactions = history?.transactions ?? [];
  const deposits = history?.deposits ?? [];
  const withdrawals = history?.withdrawals ?? [];

  return (
    <>
      <button
        type="button"
        className="profile-button"
        aria-label="ዋሌት"
        onClick={openWallet}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">💰</span>
        <span>ዋሌት</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="የእኔ Wallet"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.68)",
            padding: "12px 12px calc(12px + env(safe-area-inset-bottom))",
          }}
          onClick={closeWallet}
        >
          <section
            className="draw-card"
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "92vh",
              overflowY: "auto",
              margin: 0,
              padding: "16px",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div className="draw-info">
                <p className="eyebrow">ADDIS ዕጣ · WALLET</p>
                <h2 style={{ marginBottom: 0 }}>💰 የእኔ Wallet</h2>
              </div>

              <button
                type="button"
                className="profile-button"
                aria-label="Wallet ዝጋ"
                onClick={closeWallet}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "20px",
                borderRadius: "16px",
                background:
                  "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(96,165,250,0.10))",
                border: "1px solid rgba(52,211,153,0.28)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.78,
                }}
              >
                አሁን ያለዎት ቀሪ ሂሳብ
              </span>

              <strong
                style={{
                  display: "block",
                  marginTop: "8px",
                  fontSize: "clamp(26px, 7vw, 36px)",
                  overflowWrap: "anywhere",
                }}
              >
                {loading ? "በመጫን ላይ..." : formatMoney(balance ?? 0)}
              </strong>

              <button
                type="button"
                style={{ ...secondaryButtonStyle, marginTop: "12px" }}
                disabled={loading || historyLoading}
                onClick={() => void loadWallet()}
              >
                ↻ መረጃ አድስ
              </button>
            </div>

            <form onSubmit={handleDeposit} style={panelStyle}>
              <strong>💳 Wallet ላይ ገንዘብ ጨምር</strong>

              <p className="hero-description" style={{ margin: 0 }}>
                በTelebirr ወደዚህ ቁጥር ገንዘብ ይላኩ፦
              </p>

              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(16,185,129,0.10)",
                  border: "1px solid rgba(52,211,153,0.22)",
                  fontSize: "17px",
                  fontWeight: 700,
                  overflowWrap: "anywhere",
                }}
              >
                {telebirrNumber || "Admin የTelebirr ቁጥር አላስገባም"}
              </div>

              <p className="hero-description" style={{ margin: 0 }}>
                ክፍያውን ከፈጸሙ በኋላ Transaction Reference ያስገቡ።
                Admin ካረጋገጠ በኋላ ቀሪ ሂሳብዎ ይጨምራል።
              </p>

              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="የDeposit መጠን (ብር)"
                style={fieldStyle}
              />

              <input
                type="text"
                required
                maxLength={200}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Telebirr Transaction Reference"
                style={fieldStyle}
              />

              <input
                type="text"
                maxLength={200}
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="የላኪው ስም (አማራጭ)"
                style={fieldStyle}
              />

              <button
                className="primary-button"
                type="submit"
                disabled={depositing}
              >
                {depositing ? "Deposit በመላክ ላይ..." : "Deposit ጥያቄ ላክ"}
              </button>
            </form>

            <form onSubmit={handleWithdraw} style={panelStyle}>
              <strong>💸 ከWallet ገንዘብ አውጣ</strong>

              <p className="hero-description" style={{ margin: 0 }}>
                የሚቀበሉበትን Telebirr ቁጥር ያስገቡ።
                ጥያቄው Admin ዘንድ ይሄዳል፤ ክፍያው በእጅ ይፈጸማል።
              </p>

              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder="የWithdraw መጠን (ብር)"
                style={fieldStyle}
              />

              <input
                type="text"
                required
                maxLength={100}
                value={withdrawTelebirr}
                onChange={(event) => setWithdrawTelebirr(event.target.value)}
                placeholder="የሚቀበሉበት Telebirr ቁጥር"
                style={fieldStyle}
              />

              <button
                className="primary-button"
                type="submit"
                disabled={withdrawing}
              >
                {withdrawing ? "Withdraw በመላክ ላይ..." : "💸 Withdraw ጠይቅ"}
              </button>
            </form>

            <section style={{ ...panelStyle, gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <strong>📜 የግብይት ታሪክ</strong>

                <button
                  type="button"
                  style={secondaryButtonStyle}
                  disabled={historyLoading}
                  onClick={() => void loadHistory()}
                >
                  {historyLoading ? "በመጫን ላይ..." : "↻ ታሪክ አድስ"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "6px",
                }}
              >
                {([
                  ["transactions", "ሁሉም"],
                  ["deposits", "Deposit"],
                  ["withdrawals", "Withdraw"],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={historyTab === tab}
                    onClick={() => setHistoryTab(tab)}
                    style={{
                      ...secondaryButtonStyle,
                      padding: "8px 4px",
                      fontSize: "12px",
                      background:
                        historyTab === tab
                          ? "rgba(16,185,129,0.18)"
                          : "rgba(255,255,255,0.04)",
                      borderColor:
                        historyTab === tab
                          ? "rgba(52,211,153,0.55)"
                          : "rgba(255,255,255,0.12)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {historyLoading && !history && (
                <p className="hero-description">የግብይት ታሪክ በመጫን ላይ...</p>
              )}

              {historyError && (
                <div
                  role="alert"
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    color: "#fca5a5",
                    background: "rgba(248,113,113,0.08)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {historyError}
                </div>
              )}

              {!historyLoading && !historyError && history && (
                <>
                  {historyTab === "transactions" && (
                    transactions.length === 0 ? (
                      <p className="hero-description">እስካሁን የግብይት ታሪክ የለም።</p>
                    ) : (
                      transactions.map((item) => (
                        <article
                          key={item.id}
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.09)",
                            background: "rgba(255,255,255,0.025)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                              alignItems: "flex-start",
                            }}
                          >
                            <strong style={{ overflowWrap: "anywhere" }}>
                              {item.description || item.type || "የWallet ግብይት"}
                            </strong>
                            <strong style={{ whiteSpace: "nowrap" }}>
                              {formatMoney(item.amount)}
                            </strong>
                          </div>

                          <p
                            className="hero-description"
                            style={{ margin: "6px 0 0", fontSize: "12px" }}
                          >
                            ቀሪ ሂሳብ፦ {formatMoney(item.balanceAfter)}
                          </p>

                          {item.reference && (
                            <p
                              className="hero-description"
                              style={{
                                margin: "4px 0 0",
                                fontSize: "12px",
                                overflowWrap: "anywhere",
                              }}
                            >
                              ማጣቀሻ፦ {item.reference}
                            </p>
                          )}

                          <p
                            className="hero-description"
                            style={{ margin: "4px 0 0", fontSize: "12px" }}
                          >
                            {formatDate(item.createdAt)}
                          </p>
                        </article>
                      ))
                    )
                  )}

                  {historyTab === "deposits" && (
                    deposits.length === 0 ? (
                      <p className="hero-description">የDeposit ታሪክ የለም።</p>
                    ) : (
                      deposits.map((item) => (
                        <article
                          key={item.id}
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.09)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <strong>Deposit · {formatMoney(item.amount)}</strong>
                            <span
                              style={{
                                color: statusColor(item.status),
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {statusLabel(item.status)}
                            </span>
                          </div>

                          <p
                            className="hero-description"
                            style={{
                              margin: "6px 0 0",
                              fontSize: "12px",
                              overflowWrap: "anywhere",
                            }}
                          >
                            Reference፦ {item.transactionReference}
                          </p>

                          {item.rejectionReason && (
                            <p
                              style={{
                                margin: "6px 0 0",
                                color: "#fca5a5",
                                fontSize: "12px",
                              }}
                            >
                              ምክንያት፦ {item.rejectionReason}
                            </p>
                          )}

                          <p
                            className="hero-description"
                            style={{ margin: "6px 0 0", fontSize: "12px" }}
                          >
                            {formatDate(item.createdAt)}
                          </p>
                        </article>
                      ))
                    )
                  )}

                  {historyTab === "withdrawals" && (
                    withdrawals.length === 0 ? (
                      <p className="hero-description">የWithdraw ታሪክ የለም።</p>
                    ) : (
                      withdrawals.map((item) => (
                        <article
                          key={item.id}
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.09)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <strong>Withdraw · {formatMoney(item.amount)}</strong>
                            <span
                              style={{
                                color: statusColor(item.status),
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {statusLabel(item.status)}
                            </span>
                          </div>

                          <p
                            className="hero-description"
                            style={{
                              margin: "6px 0 0",
                              fontSize: "12px",
                              overflowWrap: "anywhere",
                            }}
                          >
                            Telebirr፦ {item.telebirrNumber}
                          </p>

                          {item.paymentReference && (
                            <p
                              className="hero-description"
                              style={{
                                margin: "4px 0 0",
                                fontSize: "12px",
                                overflowWrap: "anywhere",
                              }}
                            >
                              የክፍያ ማጣቀሻ፦ {item.paymentReference}
                            </p>
                          )}

                          {item.rejectionReason && (
                            <p
                              style={{
                                margin: "6px 0 0",
                                color: "#fca5a5",
                                fontSize: "12px",
                              }}
                            >
                              ምክንያት፦ {item.rejectionReason}
                            </p>
                          )}

                          <p
                            className="hero-description"
                            style={{ margin: "6px 0 0", fontSize: "12px" }}
                          >
                            {formatDate(item.createdAt)}
                          </p>
                        </article>
                      ))
                    )
                  )}
                </>
              )}
            </section>

            {message && (
              <div
                role="status"
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(52,211,153,0.10)",
                  border: "1px solid rgba(52,211,153,0.25)",
                }}
              >
                {message}
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "rgba(255,80,80,0.10)",
                  border: "1px solid rgba(255,80,80,0.25)",
                  color: "#ffb4b4",
                  overflowWrap: "anywhere",
                }}
              >
                {error}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
