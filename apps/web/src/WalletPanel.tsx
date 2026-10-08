import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  createWalletDeposit,
  getWallet,
  purchaseEntryWithWallet,
} from "./Wallet-api";

type WalletPanelProps = {
  entryId: string;
  entryFee: number;
  telebirrNumber: string;
  onPurchased: (balance: number) => void;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

export default function WalletPanel({
  entryId,
  entryFee,
  telebirrNumber,
  onPurchased,
}: WalletPanelProps) {
  const [balance, setBalance] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [depositAmount, setDepositAmount] =
    useState(String(entryFee));

  const [reference, setReference] =
    useState("");

  const [senderName, setSenderName] =
    useState("");

  const [depositing, setDepositing] =
    useState(false);

  const [purchasing, setPurchasing] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const loadWallet =
    useCallback(async () => {
      try {
        setLoading(true);

        const response =
          await getWallet();

        setBalance(
          response.wallet.balance,
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
    }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  async function handleDeposit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const amount =
      Number(depositAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        "ትክክለኛ የDeposit መጠን ያስገቡ።",
      );
      return;
    }

    if (!reference.trim()) {
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
        amount,
        reference.trim(),
        senderName.trim() ||
          undefined,
      );

      setReference("");
      setSenderName("");

      setMessage(
        "✓ Deposit ጥያቄዎ ተልኳል። Admin ካረጋገጠ በኋላ Wallet ብርዎ ይጨምራል።",
      );
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

  async function handlePurchase() {
    if (balance < entryFee) {
      setError(
        `Wallet ላይ ${formatMoney(entryFee)} ያስፈልጋል።`,
      );
      return;
    }

    setPurchasing(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        await purchaseEntryWithWallet(
          entryId,
        );

      setBalance(
        response.result.balance,
      );

      setMessage(
        "✓ ቁጥሩ በWallet ተገዝቷል።",
      );

      onPurchased(
        response.result.balance,
      );
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "ቁጥሩን በWallet መግዛት አልተቻለም።",
      );

      await loadWallet();
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div
      style={{
        marginTop: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div
        style={{
          padding: "16px",
          borderRadius: "14px",
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
          💰 Wallet Balance
        </span>

        <strong
          style={{
            display: "block",
            marginTop: "5px",
            fontSize: "26px",
          }}
        >
          {loading
            ? "..."
            : formatMoney(balance)}
        </strong>
      </div>

      {balance >= entryFee ? (
        <button
          className="primary-button"
          type="button"
          disabled={purchasing}
          onClick={() =>
            void handlePurchase()
          }
        >
          {purchasing
            ? "ቁጥሩን በመግዛት ላይ..."
            : `${formatMoney(entryFee)} በWallet ክፈል`}
        </button>
      ) : (
        <div
          style={{
            padding: "14px",
            borderRadius: "14px",
            background:
              "rgba(251,191,36,0.10)",
            border:
              "1px solid rgba(251,191,36,0.25)",
          }}
        >
          <strong>
            💳 Wallet መሙላት ያስፈልጋል
          </strong>

          <p
            className="hero-description"
            style={{
              marginBottom: 0,
              marginTop: "7px",
            }}
          >
            ለዚህ ቁጥር{" "}
            <strong>
              {formatMoney(entryFee)}
            </strong>{" "}
            ያስፈልጋል።
          </p>
        </div>
      )}

      <form
        onSubmit={handleDeposit}
        style={{
          display: "grid",
          gap: "10px",
          padding: "14px",
          borderRadius: "14px",
          background:
            "rgba(255,255,255,0.04)",
          border:
            "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <strong>
          💳 Telebirr Wallet Deposit
        </strong>

        <p
          className="hero-description"
          style={{
            margin: 0,
          }}
        >
          1. ወደ{" "}
          <strong>
            {telebirrNumber ||
              "Admin የTelebirr ቁጥር አላስገባም"}
          </strong>{" "}
          ይላኩ።
          <br />
          2. የTransaction Reference ያስገቡ።
          <br />
          3. Admin ካረጋገጠ Wallet ይጨምራል።
        </p>

        <input
          type="number"
          min="1"
          step="0.01"
          value={depositAmount}
          onChange={(event) =>
            setDepositAmount(
              event.target.value,
            )
          }
          placeholder="Deposit amount"
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
            boxSizing: "border-box",
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
            boxSizing: "border-box",
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
            boxSizing: "border-box",
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
    </div>
  );
}
