import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getAdminPaymentSettings,
  updateTelebirrNumber,
} from "./admin-api";

export default function AdminPaymentSettings() {
  const [telebirrNumber, setTelebirrNumber] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadSettings = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const response =
          await getAdminPaymentSettings();

        setTelebirrNumber(
          response.settings.telebirrNumber,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "የክፍያ ቅንብሩን ማምጣት አልተቻለም።",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const normalizedNumber =
      telebirrNumber.trim();

    if (!normalizedNumber) {
      setError(
        "የTelebirr ቁጥር ያስገቡ።",
      );
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response =
        await updateTelebirrNumber(
          normalizedNumber,
        );

      setTelebirrNumber(
        response.settings.telebirrNumber,
      );

      setSuccess(
        "የTelebirr ቁጥሩ በትክክል ተቀምጧል።",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "የTelebirr ቁጥሩን ማስቀመጥ አልተቻለም።",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-payment-settings">
      <style>
        {`
          .admin-payment-settings {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            padding: 20px 16px 40px;
            box-sizing: border-box;
            color: #f4f7fb;
          }

          .admin-payment-settings-card {
            border: 1px solid #293442;
            border-radius: 16px;
            background: #111720;
            padding: 20px;
          }

          .admin-payment-settings-title {
            margin: 0;
            font-size: 20px;
            line-height: 1.35;
          }

          .admin-payment-settings-description {
            margin: 8px 0 22px;
            color: #8f9baa;
            font-size: 13px;
            line-height: 1.6;
          }

          .admin-payment-settings-label {
            display: block;
            margin-bottom: 8px;
            color: #dce4ed;
            font-size: 13px;
            font-weight: 700;
          }

          .admin-payment-settings-input {
            width: 100%;
            min-height: 48px;
            box-sizing: border-box;
            border: 1px solid #344150;
            border-radius: 10px;
            background: #0b0f14;
            color: #f4f7fb;
            padding: 0 14px;
            font: inherit;
            font-size: 16px;
            outline: none;
          }

          .admin-payment-settings-input:focus {
            border-color: #8aa2ff;
          }

          .admin-payment-settings-input:disabled {
            opacity: 0.65;
          }

          .admin-payment-settings-help {
            margin: 8px 0 0;
            color: #7f8b98;
            font-size: 12px;
            line-height: 1.5;
          }

          .admin-payment-settings-error,
          .admin-payment-settings-success {
            margin-top: 16px;
            padding: 12px 14px;
            border-radius: 10px;
            font-size: 13px;
            line-height: 1.5;
          }

          .admin-payment-settings-error {
            border: 1px solid #63383d;
            background: #241418;
            color: #ffb5bd;
          }

          .admin-payment-settings-success {
            border: 1px solid #315843;
            background: #14231a;
            color: #a9e0b9;
          }

          .admin-payment-settings-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
          }

          .admin-payment-settings-button {
            min-height: 46px;
            border: 1px solid #dbe3ed;
            border-radius: 10px;
            background: #e7edf5;
            color: #0b0f14;
            padding: 0 18px;
            font: inherit;
            font-size: 14px;
            font-weight: 800;
            cursor: pointer;
          }

          .admin-payment-settings-button:disabled {
            cursor: not-allowed;
            opacity: 0.55;
          }

          .admin-payment-settings-reload {
            border-color: #344150;
            background: #151c25;
            color: #dce4ed;
          }

          @media (max-width: 560px) {
            .admin-payment-settings {
              padding-left: 12px;
              padding-right: 12px;
            }

            .admin-payment-settings-card {
              padding: 16px;
            }

            .admin-payment-settings-actions {
              flex-direction: column;
            }

            .admin-payment-settings-button {
              width: 100%;
            }
          }
        `}
      </style>

      <section className="admin-payment-settings-card">
        <h1 className="admin-payment-settings-title">
          Telebirr የክፍያ ቁጥር
        </h1>

        <p className="admin-payment-settings-description">
          ተጠቃሚዎች ለዕጣ ክፍያቸው
          የሚልኩበትን የTelebirr ቁጥር
          ከዚህ ይቀይሩ።
          እዚህ የሚቀመጠው ቁጥር
          በተጠቃሚው የክፍያ መመሪያ ላይ
          ይታያል።
        </p>

        {loading ? (
          <p>
            የክፍያ ቅንብሩን በመጫን ላይ...
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label
              className="admin-payment-settings-label"
              htmlFor="telebirr-number"
            >
              የTelebirr ቁጥር
            </label>

            <input
              id="telebirr-number"
              className="admin-payment-settings-input"
              type="text"
              inputMode="tel"
              autoComplete="tel"
              value={telebirrNumber}
              onChange={(event) =>
                setTelebirrNumber(
                  event.target.value,
                )
              }
              placeholder="ለምሳሌ 09XXXXXXXX"
              disabled={saving}
            />

            <p className="admin-payment-settings-help">
              ተጠቃሚዎች ክፍያ ሲፈጽሙ
              ይህንን ቁጥር ያያሉ።
            </p>

            {error ? (
              <div
                className="admin-payment-settings-error"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                className="admin-payment-settings-success"
                role="status"
              >
                {success}
              </div>
            ) : null}

            <div className="admin-payment-settings-actions">
              <button
                type="submit"
                className="admin-payment-settings-button"
                disabled={saving}
              >
                {saving
                  ? "በማስቀመጥ ላይ..."
                  : "ቁጥሩን አስቀምጥ"}
              </button>

              <button
                type="button"
                className="admin-payment-settings-button admin-payment-settings-reload"
                onClick={() => {
                  void loadSettings();
                }}
                disabled={loading || saving}
              >
                እንደገና ጫን
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
