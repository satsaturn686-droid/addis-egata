import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  createAdminDraw,
  type AdminPrizeInput,
} from "./admin-draw-api";

type AdminDrawCreateProps = {
  onCreated?: () => void;
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("am-ET", {
    maximumFractionDigits: 2,
  }).format(value);
}

function buildInitialPrizes(
  count: number,
): AdminPrizeInput[] {
  return Array.from(
    { length: count },
    (_, index) => ({
      rank: index + 1,
      amount: 0,
    }),
  );
}

export default function AdminDrawCreate({
  onCreated,
}: AdminDrawCreateProps) {
  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [prizeType, setPrizeType] =
    useState<"cash" | "physical">(
      "cash",
    );

  const [prizeName, setPrizeName] =
    useState("");

  const [prizeImageUrl, setPrizeImageUrl] =
    useState("");

  const [prizeDescription, setPrizeDescription] =
    useState("");

  const [displayedPrizeValue, setDisplayedPrizeValue] =
    useState("");

  const [actualPrizeCost, setActualPrizeCost] =
    useState("");

  const [totalNumbers, setTotalNumbers] =
    useState("100");

  const [entryFee, setEntryFee] =
    useState("100");

  const [winnerCount, setWinnerCount] =
    useState("5");

  const [uniqueWinners, setUniqueWinners] =
    useState(true);

  const [startsAt, setStartsAt] =
    useState("");

  const [deadlineAt, setDeadlineAt] =
    useState("");

  const [drawAt, setDrawAt] =
    useState("");

  const [prizes, setPrizes] =
    useState<AdminPrizeInput[]>(
      buildInitialPrizes(5),
    );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const totalPrize = useMemo(
    () =>
      prizes.reduce(
        (sum, prize) =>
          sum +
          (Number.isFinite(prize.amount)
            ? prize.amount
            : 0),
        0,
      ),
    [prizes],
  );

  const estimatedCollection =
    (Number(totalNumbers) || 0) *
    (Number(entryFee) || 0);

  const estimatedDifference =
    estimatedCollection -
    (Number(actualPrizeCost) ||
      totalPrize ||
      0);

  function updateWinnerCount(
    value: string,
  ) {
    setWinnerCount(value);

    const count =
      Number.parseInt(value, 10);

    if (
      Number.isInteger(count) &&
      count >= 5 &&
      count <= 1000
    ) {
      setPrizes(
        buildInitialPrizes(count),
      );
    }
  }

  function updatePrizeAmount(
    rank: number,
    value: string,
  ) {
    const amount =
      Number.parseFloat(value);

    setPrizes((current) =>
      current.map((prize) =>
        prize.rank === rank
          ? {
              ...prize,
              amount:
                Number.isFinite(amount)
                  ? amount
                  : 0,
            }
          : prize,
      ),
    );
  }

  function toOptionalNumber(
    value: string,
  ): number | undefined {
    const normalized =
      value.trim();

    if (!normalized) {
      return undefined;
    }

    const parsed =
      Number.parseFloat(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : undefined;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const numbers =
        Number.parseInt(
          totalNumbers,
          10,
        );

      const fee =
        Number.parseFloat(entryFee);

      const winners =
        Number.parseInt(
          winnerCount,
          10,
        );

      if (
        !Number.isInteger(numbers) ||
        numbers < 5
      ) {
        throw new Error(
          "የቁጥሮች ብዛት ቢያንስ 5 መሆን አለበት።",
        );
      }

      if (
        !Number.isFinite(fee) ||
        fee <= 0
      ) {
        throw new Error(
          "የመግቢያ ክፍያ ከ0 በላይ መሆን አለበት።",
        );
      }

      if (
        !Number.isInteger(winners) ||
        winners < 5 ||
        winners > numbers
      ) {
        throw new Error(
          "የአሸናፊዎች ብዛት ቢያንስ 5 እና ከቁጥሮች ብዛት መብለጥ የለበትም።",
        );
      }

      if (
        prizes.length !== winners
      ) {
        throw new Error(
          "የPrize ቁጥር ከWinner ቁጥር ጋር መመሳሰል አለበት።",
        );
      }

      const response =
        await createAdminDraw({
          name,
          description,
          prizeType,
          prizeName,
          prizeImageUrl,
          prizeDescription,
          displayedPrizeValue:
            toOptionalNumber(
              displayedPrizeValue,
            ),
          actualPrizeCost:
            toOptionalNumber(
              actualPrizeCost,
            ),
          totalNumbers: numbers,
          entryFee: fee,
          winnerCount: winners,
          uniqueWinners,
          startsAt:
            startsAt || undefined,
          deadlineAt:
            deadlineAt || undefined,
          drawAt:
            drawAt || undefined,
          prizes,
        });

      setSuccess(
        `ዕጣው "${response.draw.name}" በDraft ሁኔታ ተፈጥሯል።`,
      );

      if (onCreated) {
        onCreated();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ዕጣውን መፍጠር አልተቻለም።",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-create-page">
      <style>
        {`
          .admin-create-page {
            min-height: 100%;
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            padding: 20px 16px 40px;
            box-sizing: border-box;
            color: #f4f7fb;
            background: #0b0f14;
          }

          .admin-create-header {
            margin-bottom: 20px;
          }

          .admin-create-header h1 {
            margin: 0;
            font-size: 25px;
            line-height: 1.25;
          }

          .admin-create-header p {
            margin: 8px 0 0;
            color: #9aa7b5;
            font-size: 14px;
            line-height: 1.6;
          }

          .admin-create-section {
            margin-bottom: 14px;
            padding: 16px;
            border: 1px solid #202a35;
            border-radius: 16px;
            background: #111720;
          }

          .admin-create-section h2 {
            margin: 0 0 14px;
            font-size: 16px;
          }

          .admin-create-grid {
            display: grid;
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .admin-create-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .admin-create-field.full {
            grid-column: 1 / -1;
          }

          .admin-create-field label {
            color: #b7c1cd;
            font-size: 13px;
          }

          .admin-create-field input,
          .admin-create-field select,
          .admin-create-field textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #293442;
            border-radius: 10px;
            background: #0c1219;
            color: #f4f7fb;
            padding: 11px 12px;
            font: inherit;
            outline: none;
          }

          .admin-create-field textarea {
            min-height: 88px;
            resize: vertical;
          }

          .admin-create-field input:focus,
          .admin-create-field select:focus,
          .admin-create-field textarea:focus {
            border-color: #6d8cff;
          }

          .admin-create-help {
            color: #7f8b98;
            font-size: 12px;
            line-height: 1.5;
          }

          .admin-create-switch {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 44px;
            color: #dbe2ea;
            font-size: 14px;
          }

          .admin-create-switch input {
            width: 20px;
            height: 20px;
          }

          .admin-prize-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .admin-prize-row {
            display: grid;
            grid-template-columns:
              72px minmax(0, 1fr);
            gap: 10px;
            align-items: center;
          }

          .admin-prize-rank {
            color: #c7d0da;
            font-size: 13px;
          }

          .admin-prize-row input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #293442;
            border-radius: 10px;
            background: #0c1219;
            color: #f4f7fb;
            padding: 10px 12px;
            font: inherit;
          }

          .admin-create-summary {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-top: 14px;
          }

          .admin-create-stat {
            padding: 12px;
            border-radius: 12px;
            background: #0c1219;
            border: 1px solid #202a35;
          }

          .admin-create-stat span {
            display: block;
            color: #7f8b98;
            font-size: 11px;
            margin-bottom: 5px;
          }

          .admin-create-stat strong {
            font-size: 15px;
          }

          .admin-create-message {
            margin-bottom: 14px;
            padding: 12px 14px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.5;
          }

          .admin-create-error {
            border: 1px solid #713b43;
            background: #29151a;
            color: #ffb8c1;
          }

          .admin-create-success {
            border: 1px solid #315c48;
            background: #12251c;
            color: #a8e6c6;
          }

          .admin-create-submit {
            width: 100%;
            min-height: 48px;
            border: 0;
            border-radius: 12px;
            background: #e7edf5;
            color: #0b0f14;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
          }

          .admin-create-submit:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          @media (max-width: 560px) {
            .admin-create-grid,
            .admin-create-summary {
              grid-template-columns: 1fr;
            }

            .admin-create-field.full {
              grid-column: auto;
            }

            .admin-create-page {
              padding-left: 12px;
              padding-right: 12px;
            }
          }
        `}
      </style>

      <header className="admin-create-header">
        <h1>አዲስ ዕጣ ፍጠር</h1>
        <p>
          የዕጣውን ቁጥር፣ መግቢያ ክፍያ፣
          ሽልማት እና አሸናፊዎች አዘጋጅ።
        </p>
      </header>

      {error && (
        <div className="admin-create-message admin-create-error">
          {error}
        </div>
      )}

      {success && (
        <div className="admin-create-message admin-create-success">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <section className="admin-create-section">
          <h2>ዋና መረጃ</h2>

          <div className="admin-create-grid">
            <div className="admin-create-field full">
              <label htmlFor="draw-name">
                የዕጣ ስም
              </label>
              <input
                id="draw-name"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="ለምሳሌ Addis ዕጣ — የሳምንቱ ዕጣ"
                required
              />
            </div>

            <div className="admin-create-field full">
              <label htmlFor="draw-description">
                መግለጫ
              </label>
              <textarea
                id="draw-description"
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                placeholder="ስለ ዕጣው አጭር መረጃ"
              />
            </div>

            <div className="admin-create-field">
              <label htmlFor="total-numbers">
                ጠቅላላ ቁጥሮች
              </label>
              <input
                id="total-numbers"
                type="number"
                min="5"
                value={totalNumbers}
                onChange={(event) =>
                  setTotalNumbers(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="admin-create-field">
              <label htmlFor="entry-fee">
                የመግቢያ ክፍያ (ETB)
              </label>
              <input
                id="entry-fee"
                type="number"
                min="0.01"
                step="0.01"
                value={entryFee}
                onChange={(event) =>
                  setEntryFee(
                    event.target.value,
                  )
                }
              />
            </div>
          </div>
        </section>

        <section className="admin-create-section">
          <h2>ሽልማት</h2>

          <div className="admin-create-grid">
            <div className="admin-create-field">
              <label htmlFor="prize-type">
                የሽልማት አይነት
              </label>
              <select
                id="prize-type"
                value={prizeType}
                onChange={(event) =>
                  setPrizeType(
                    event.target.value as
                      | "cash"
                      | "physical",
                  )
                }
              >
                <option value="cash">
                  ገንዘብ
                </option>
                <option value="physical">
                  እቃ / ንብረት
                </option>
              </select>
            </div>

            <div className="admin-create-field">
              <label htmlFor="prize-name">
                የሽልማት ስም
              </label>
              <input
                id="prize-name"
                value={prizeName}
                onChange={(event) =>
                  setPrizeName(
                    event.target.value,
                  )
                }
                placeholder="ለምሳሌ የገንዘብ ሽልማት"
                required
              />
            </div>

            <div className="admin-create-field full">
              <label htmlFor="prize-image">
                የሽልማት ምስል URL
              </label>
              <input
                id="prize-image"
                type="url"
                value={prizeImageUrl}
                onChange={(event) =>
                  setPrizeImageUrl(
                    event.target.value,
                  )
                }
                placeholder="https://..."
              />
            </div>

            <div className="admin-create-field full">
              <label htmlFor="prize-description">
                የሽልማት መግለጫ
              </label>
              <textarea
                id="prize-description"
                value={prizeDescription}
                onChange={(event) =>
                  setPrizeDescription(
                    event.target.value,
                  )
                }
                placeholder="ሽልማቱ ምን እንደሆነ ዝርዝር መረጃ"
              />
            </div>

            <div className="admin-create-field">
              <label htmlFor="displayed-value">
                የሚታይ ዋጋ (ETB)
              </label>
              <input
                id="displayed-value"
                type="number"
                min="0"
                step="0.01"
                value={displayedPrizeValue}
                onChange={(event) =>
                  setDisplayedPrizeValue(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="admin-create-field">
              <label htmlFor="actual-cost">
                ትክክለኛ የግዢ ዋጋ (ETB)
              </label>
              <input
                id="actual-cost"
                type="number"
                min="0"
                step="0.01"
                value={actualPrizeCost}
                onChange={(event) =>
                  setActualPrizeCost(
                    event.target.value,
                  )
                }
              />
            </div>
          </div>
        </section>

        <section className="admin-create-section">
          <h2>አሸናፊዎች እና Prize Distribution</h2>

          <div className="admin-create-grid">
            <div className="admin-create-field">
              <label htmlFor="winner-count">
                የአሸናፊዎች ብዛት
              </label>
              <input
                id="winner-count"
                type="number"
                min="5"
                max={totalNumbers || "1000000"}
                value={winnerCount}
                onChange={(event) =>
                  updateWinnerCount(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="admin-create-field">
              <label>
                ልዩ አሸናፊዎች
              </label>

              <label className="admin-create-switch">
                <input
                  type="checkbox"
                  checked={uniqueWinners}
                  onChange={(event) =>
                    setUniqueWinners(
                      event.target.checked,
                    )
                  }
                />
                አንድ ተጠቃሚ ከአንድ በላይ
                አሸናፊ እንዳይሆን
              </label>
            </div>
          </div>

          <div className="admin-prize-list">
            {prizes.map((prize) => (
              <div
                className="admin-prize-row"
                key={prize.rank}
              >
                <div className="admin-prize-rank">
                  #{prize.rank} አሸናፊ
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prize.amount}
                  onChange={(event) =>
                    updatePrizeAmount(
                      prize.rank,
                      event.target.value,
                    )
                  }
                  aria-label={`Prize ${prize.rank}`}
                />
              </div>
            ))}
          </div>

          <div className="admin-create-summary">
            <div className="admin-create-stat">
              <span>Prize Pool</span>
              <strong>
                {formatAmount(
                  totalPrize,
                )}{" "}
                ETB
              </strong>
            </div>

            <div className="admin-create-stat">
              <span>
                100% ቢሞላ Collection
              </span>
              <strong>
                {formatAmount(
                  estimatedCollection,
                )}{" "}
                ETB
              </strong>
            </div>

            <div className="admin-create-stat">
              <span>
                ግምታዊ ልዩነት
              </span>
              <strong>
                {formatAmount(
                  estimatedDifference,
                )}{" "}
                ETB
              </strong>
            </div>
          </div>
        </section>

        <section className="admin-create-section">
          <h2>ጊዜ ማስተካከያ</h2>

          <div className="admin-create-grid">
            <div className="admin-create-field">
              <label htmlFor="starts-at">
                መጀመሪያ
              </label>
              <input
                id="starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(event) =>
                  setStartsAt(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="admin-create-field">
              <label htmlFor="deadline-at">
                የመጨረሻ ጊዜ
              </label>
              <input
                id="deadline-at"
                type="datetime-local"
                value={deadlineAt}
                onChange={(event) =>
                  setDeadlineAt(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="admin-create-field full">
              <label htmlFor="draw-at">
                ዕጣ የሚወጣበት ጊዜ
              </label>
              <input
                id="draw-at"
                type="datetime-local"
                value={drawAt}
                onChange={(event) =>
                  setDrawAt(
                    event.target.value,
                  )
                }
              />

              <div className="admin-create-help">
                የመጨረሻ ጊዜ ከዕጣ መውጫ
                ጊዜ በፊት መሆን አለበት።
              </div>
            </div>
          </div>
        </section>

        <button
          className="admin-create-submit"
          type="submit"
          disabled={saving}
        >
          {saving
            ? "በመፍጠር ላይ..."
            : "ዕጣውን Draft ፍጠር"}
        </button>
      </form>
    </main>
  );
}
