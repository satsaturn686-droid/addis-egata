import {
  useEffect,
  useState,
} from "react";

import {
  getPaymentSettings,
} from "./api";

import {
  createWalletDeposit,
  getWallet,
} from "./Wallet-api";

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

export default function UserWalletButton() {
  const [open, setOpen] = useState(false);

  const [balance, setBalance] =
    useState<number | null>(null);

  const [telebirrNumber, setTelebirrNumber] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [reference, setReference] =
    useState("");

  const [senderName, setSenderName] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [depositing, setDepositing] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  async function loadWallet() {
    setLoading(true);
    setError(null);

    try {
      const [walletResponse, settingsResponse] =
        await Promise.all([
          getWallet(),
          getPaymentSettings(),
        ]);

      setBalance(
        walletResponse.wallet.balance,
      );

      setTelebirrNumber(
        settingsResponse.settings
          .telebirrNumber,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Wallet መረጃ መጫን አልተቻለም።",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadWallet();
  }, [open]);

  async function handleDeposit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      setError(
        "ትክክለኛ የDeposit መጠን ያስገቡ።",
      );
      return;
    }

    const trimmedReference =
      reference.trim();

    if (!trimmedReference) {
      setError(
        "የTelebirr Transaction Reference ያስገቡ።",
      );
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

  return (
    <>
      <button
        type="button"
        className="profile-button"
        aria-label="Wallet"
        onClick={openWallet}
      >
        💰
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wallet"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background:
              "rgba(0,0,0,0.58)",
            padding:
              "16px 16px calc(16px + env(safe-area-inset-bottom))",
          }}
          onClick={closeWallet}
        >
          <section
            className="draw-card"
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "88vh",
              overflowY: "auto",
              margin: 0,
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
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
                <p className="eyebrow">
                  USER WALLET
                </p>

                <h2>
                  💰 የእኔ Wallet
                </h2>
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
                padding: "18px",
                borderRadius: "16px",
                background:
                  "rgba(96,165,250,0.10)",
                border:
                  "1px solid rgba(96,165,250,0.25)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  opacity: 0.72,
                }}
              >
                Wallet Balance
              </span>

              <strong
                style={{
                  display: "block",
                  marginTop: "6px",
                  fontSize: "28px",
                }}
              >
                {loading
                  ? "..."
                  : formatMoney(
                      balance ?? 0,
                    )}
              </strong>
            </div>

            <form
              onSubmit={handleDeposit}
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "14px",
                padding: "14px",
                borderRadius: "14px",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <strong>
                💳 Wallet ላይ ገንዘብ ጨምር
              </strong>

              <p
                className="hero-description"
                style={{
                  margin: 0,
                }}
              >
                ወደ{" "}
                <strong>
                  {telebirrNumber ||
                    "Admin የTelebirr ቁጥር አላስገባም"}
                </strong>{" "}
                ይላኩ።
                <br />
                ከዚያ Transaction Reference
                ያስገቡ።
                <br />
                Admin ካረጋገጠ በኋላ
                Wallet ብርዎ ይጨምራል።
              </p>

              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(
                    event.target.value,
                  )
                }
                placeholder="የDeposit መጠን"
                style={{
                  minHeight: "48px",
                  borderRadius: "12px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background:
                    "rgba(255,255,255,0.05)",
                  color: "inherit",
                  padding: "12px",
                  fontSize: "16px",
                }}
              />

              <input
                type="text"
                value={reference}
                onChange={(event) =>
                  setReference(
                    event.target.value,
                  )
                }
                placeholder="Telebirr Transaction Reference"
                maxLength={200}
                style={{
                  minHeight: "48px",
                  borderRadius: "12px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background:
                    "rgba(255,255,255,0.05)",
                  color: "inherit",
                  padding: "12px",
                  fontSize: "16px",
                }}
              />

              <input
                type="text"
                value={senderName}
                onChange={(event) =>
                  setSenderName(
                    event.target.value,
                  )
                }
                placeholder="የላኪው ስም (አማራጭ)"
                maxLength={200}
                style={{
                  minHeight: "48px",
                  borderRadius: "12px",
                  border:
                    "1px solid rgba(255,255,255,0.14)",
                  background:
                    "rgba(255,255,255,0.05)",
                  color: "inherit",
                  padding: "12px",
                  fontSize: "16px",
                }}
              />

              <button
                className="primary-button"
                type="submit"
                disabled={depositing}
              >
                {depositing
                  ? "Deposit በመላክ ላይ..."
                  : "Wallet ላይ ገንዘብ ጨምር"}
              </button>
            </form>

            {message && (
              <div
                role="status"
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "12px",
                  background:
                    "rgba(52,211,153,0.10)",
                  border:
                    "1px solid rgba(52,211,153,0.25)",
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
                  background:
                    "rgba(255,80,80,0.10)",
                  border:
                    "1px solid rgba(255,80,80,0.25)",
                  color: "#ffb4b4",
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
