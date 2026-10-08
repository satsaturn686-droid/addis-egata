import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getPendingWalletDeposits,
  approveWalletDeposit,
  rejectWalletDeposit,
  type AdminWalletDeposit,
} from "./admin-wallet-api";

function formatMoney(value: number): string {
  return `${value.toLocaleString("en-US")} ብር`;
}

export default function AdminWallet() {
  const [deposits, setDeposits] =
    useState<AdminWalletDeposit[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [processing, setProcessing] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const load = useCallback(
    async () => {
      try {
        setLoading(true);
        setError(null);

        const response =
          await getPendingWalletDeposits();

        setDeposits(
          response.deposits,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Wallet deposit መረጃ መጫን አልተቻለም።",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(
    id: string,
  ) {
    setProcessing(id);
    setError(null);

    try {
      await approveWalletDeposit(id);

      setDeposits((current) =>
        current.filter(
          (deposit) =>
            deposit.id !== id,
        ),
      );
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Deposit ማረጋገጥ አልተቻለም።",
      );
    } finally {
      setProcessing(null);
    }
  }

  async function reject(
    id: string,
  ) {
    const reason =
      window.prompt(
        "የReject ምክንያት ያስገቡ፦",
      );

    if (!reason?.trim()) {
      return;
    }

    setProcessing(id);
    setError(null);

    try {
      await rejectWalletDeposit(
        id,
        reason.trim(),
      );

      setDeposits((current) =>
        current.filter(
          (deposit) =>
            deposit.id !== id,
        ),
      );
    } catch (rejectError) {
      setError(
        rejectError instanceof Error
          ? rejectError.message
          : "Deposit Reject ማድረግ አልተቻለም።",
      );
    } finally {
      setProcessing(null);
    }
  }

  return (
    <main
      style={{
        width: "100%",
        maxWidth: "760px",
        margin: "0 auto",
        padding: "20px 16px 40px",
        boxSizing: "border-box",
        color: "#f4f7fb",
      }}
    >
      <section
        style={{
          border:
            "1px solid #293442",
          borderRadius: "16px",
          background: "#111720",
          padding: "18px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "20px",
          }}
        >
          💰 Wallet ክፍያዎች
        </h1>

        <p
          style={{
            color: "#8f9baa",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          የተጠቃሚዎችን Telebirr Wallet Deposit
          ከዚህ ያረጋግጡ።
        </p>

        {error && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "10px",
              background: "#241418",
              color: "#ffb5bd",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <p>
            በመጫን ላይ...
          </p>
        ) : deposits.length === 0 ? (
          <p
            style={{
              color: "#8f9baa",
            }}
          >
            አሁን የሚጠብቅ Wallet Deposit የለም።
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {deposits.map(
              (deposit) => (
                <article
                  key={deposit.id}
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    border:
                      "1px solid #293442",
                    background:
                      "#0b0f14",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      fontSize: "20px",
                    }}
                  >
                    {formatMoney(
                      deposit.amount,
                    )}
                  </strong>

                  <p
                    style={{
                      margin:
                        "8px 0 0",
                      color: "#aeb9c5",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    👤{" "}
                    {[
                      deposit.firstName,
                      deposit.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      deposit.username ||
                      deposit.telegramId}
                    <br />
                    🧾{" "}
                    {deposit.transactionReference}
                    <br />
                    📱 Telebirr
                    <br />
                    {deposit.senderName
                      ? `👤 ላኪ፦ ${deposit.senderName}`
                      : ""}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "12px",
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        processing ===
                        deposit.id
                      }
                      onClick={() =>
                        void approve(
                          deposit.id,
                        )
                      }
                      style={{
                        flex: 1,
                        minHeight: "44px",
                        borderRadius: "10px",
                        border:
                          "1px solid #315843",
                        background:
                          "#14231a",
                        color: "#a9e0b9",
                        fontWeight: 800,
                      }}
                    >
                      ✓ Approve
                    </button>

                    <button
                      type="button"
                      disabled={
                        processing ===
                        deposit.id
                      }
                      onClick={() =>
                        void reject(
                          deposit.id,
                        )
                      }
                      style={{
                        flex: 1,
                        minHeight: "44px",
                        borderRadius: "10px",
                        border:
                          "1px solid #63383d",
                        background:
                          "#241418",
                        color: "#ffb5bd",
                        fontWeight: 800,
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            void load()
          }
          disabled={loading}
          style={{
            marginTop: "16px",
            minHeight: "44px",
            padding: "0 16px",
            borderRadius: "10px",
            border:
              "1px solid #344150",
            background: "#151c25",
            color: "#dce4ed",
            fontWeight: 700,
          }}
        >
          ↻ አድስ
        </button>
      </section>
    </main>
  );
}
