import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getAdminPaymentSettings,
  updatePaymentSettings,
} from "./admin-api";

type PaymentSettingsForm = {
  telebirrNumber: string;
  serviceEnabled: boolean;
  serviceOpenTime: string;
  serviceCloseTime: string;
  timezone: string;
  localTime: string;
  isOpen: boolean;
};

function formatEthiopianTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return value;
  }

  const civilHour = Number(match[1]);
  const minute = match[2];

  if (civilHour < 0 || civilHour > 23) {
    return value;
  }

  // Convert the API's international clock to the Ethiopian clock.
  const ethiopianHour = (civilHour + 18) % 24;
  const displayHour = ethiopianHour % 12 || 12;
  const period =
    ethiopianHour < 6
      ? "ጠዋት"
      : ethiopianHour < 12
        ? "ከቀኑ"
        : ethiopianHour < 18
          ? "ምሽት"
          : "ሌሊት";

  return period + " " + displayHour + ":" + minute;
}

export default function AdminPaymentSettings() {
  const [settings, setSettings] =
    useState<PaymentSettingsForm>({
      telebirrNumber: "",
      serviceEnabled: true,
      serviceOpenTime: "09:00",
      serviceCloseTime: "18:00",
      timezone: "Africa/Addis_Ababa",
      localTime: "",
      isOpen: false,
    });

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

        setSettings({
          telebirrNumber:
            response.settings.telebirrNumber,
          serviceEnabled:
            response.settings.serviceEnabled,
          serviceOpenTime:
            response.settings.serviceOpenTime,
          serviceCloseTime:
            response.settings.serviceCloseTime,
          timezone:
            response.settings.timezone,
          localTime:
            response.settings.localTime,
          isOpen:
            response.settings.isOpen,
        });
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

    const telebirrNumber =
      settings.telebirrNumber.trim();

    if (!telebirrNumber) {
      setError("የTelebirr ቁጥር ያስገቡ።");
      setSuccess(null);
      return;
    }

    if (
      !settings.serviceOpenTime ||
      !settings.serviceCloseTime
    ) {
      setError("የመክፈቻና የመዝጊያ ሰዓት ያስገቡ።");
      setSuccess(null);
      return;
    }

    if (
      settings.serviceOpenTime ===
      settings.serviceCloseTime
    ) {
      setError(
        "የመክፈቻና የመዝጊያ ሰዓት አንድ መሆን አይችልም።",
      );
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response =
        await updatePaymentSettings({
          telebirrNumber,
          serviceEnabled:
            settings.serviceEnabled,
          serviceOpenTime:
            settings.serviceOpenTime,
          serviceCloseTime:
            settings.serviceCloseTime,
        });

      setSettings({
        telebirrNumber:
          response.settings.telebirrNumber,
        serviceEnabled:
          response.settings.serviceEnabled,
        serviceOpenTime:
          response.settings.serviceOpenTime,
        serviceCloseTime:
          response.settings.serviceCloseTime,
        timezone:
          response.settings.timezone,
        localTime:
          response.settings.localTime,
        isOpen:
          response.settings.isOpen,
      });

      setSuccess(
        "የክፍያ ቅንብሮቹ በትክክል ተቀምጠዋል።",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "የክፍያ ቅንብሮቹን ማስቀመጥ አልተቻለም።",
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
            margin-bottom: 16px;
          }

          .admin-payment-settings-title {
            margin: 0;
            font-size: 20px;
            line-height: 1.4;
          }

          .admin-payment-settings-description {
            margin: 8px 0 22px;
            color: #8f9baa;
            font-size: 13px;
            line-height: 1.7;
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
            margin: 8px 0 18px;
            color: #7f8b98;
            font-size: 12px;
            line-height: 1.6;
          }

          .admin-payment-settings-field {
            margin-top: 20px;
          }

          .admin-payment-settings-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .admin-payment-settings-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            border: 1px solid #344150;
            border-radius: 12px;
            background: #0b0f14;
            padding: 15px;
            margin-top: 18px;
          }

          .admin-payment-settings-toggle-title {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
          }

          .admin-payment-settings-toggle-description {
            margin: 5px 0 0;
            color: #8f9baa;
            font-size: 12px;
            line-height: 1.5;
          }

          .admin-payment-settings-checkbox {
            width: 22px;
            height: 22px;
            flex-shrink: 0;
            accent-color: #55d68b;
            cursor: pointer;
          }

          .admin-payment-settings-status {
            padding: 14px;
            border: 1px solid #344150;
            border-radius: 12px;
            background: #0b0f14;
            margin-top: 18px;
          }

          .admin-payment-settings-status-title {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
          }

          .admin-payment-settings-status-open {
            color: #7ee2a8;
          }

          .admin-payment-settings-status-closed {
            color: #ffb5bd;
          }

          .admin-payment-settings-status-info {
            margin: 7px 0 0;
            color: #9aa7b6;
            font-size: 12px;
            line-height: 1.6;
          }

          .admin-payment-settings-error,
          .admin-payment-settings-success {
            margin-top: 16px;
            padding: 12px 14px;
            border-radius: 10px;
            font-size: 13px;
            line-height: 1.6;
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

            .admin-payment-settings-grid {
              grid-template-columns: 1fr;
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

      {loading ? (
        <section className="admin-payment-settings-card">
          <p>የክፍያ ቅንብሮቹን በመጫን ላይ...</p>
        </section>
      ) : (
        <form onSubmit={handleSubmit}>
          <section className="admin-payment-settings-card">
            <h1 className="admin-payment-settings-title">
              Telebirr የክፍያ ቅንብር
            </h1>

            <p className="admin-payment-settings-description">
              ተጠቃሚዎች Deposit ሲያደርጉ
              የሚጠቀሙበትን የTelebirr ቁጥር
              እዚህ ያስተካክሉ።
            </p>

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
              value={settings.telebirrNumber}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  telebirrNumber:
                    event.target.value,
                }))
              }
              placeholder="ለምሳሌ 09XXXXXXXX"
              disabled={saving}
              required
            />

            <p className="admin-payment-settings-help">
              ይህ ቁጥር በተጠቃሚዎች የWallet
              Deposit መመሪያ ላይ ይታያል።
            </p>
          </section>

          <section className="admin-payment-settings-card">
            <h2 className="admin-payment-settings-title">
              Deposit / Withdraw የሥራ ሰዓት
            </h2>

            <p className="admin-payment-settings-description">
              የኢትዮጵያ ሰዓት አቆጣጠር
              (Africa/Addis_Ababa) ይጠቀማል።
              እዚህ ያስቀመጡት ሰዓት
              ለDeposit እና Withdraw ብቻ ይሠራል።
              የWallet ቀሪ ሂሳብና ታሪክ ሁልጊዜ
              መታየት ይቀጥላሉ።
            </p>

            <div className="admin-payment-settings-toggle">
              <div>
                <p className="admin-payment-settings-toggle-title">
                  Deposit / Withdraw አገልግሎት
                </p>

                <p className="admin-payment-settings-toggle-description">
                  ይህንን ካጠፉት አዲስ Deposit
                  እና Withdraw ጥያቄዎች አይቀበሉም።
                </p>
              </div>

              <input
                className="admin-payment-settings-checkbox"
                type="checkbox"
                aria-label="Deposit and Withdraw አገልግሎት አብራ"
                checked={settings.serviceEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    serviceEnabled:
                      event.target.checked,
                  }))
                }
                disabled={saving}
              />
            </div>

            <div className="admin-payment-settings-field">
              <div className="admin-payment-settings-grid">
                <div>
                  <label
                    className="admin-payment-settings-label"
                    htmlFor="payment-open-time"
                  >
                    የመክፈቻ ሰዓት
                  </label>

                  <input
                    id="payment-open-time"
                    className="admin-payment-settings-input"
                    type="time"
                    value={settings.serviceOpenTime}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        serviceOpenTime:
                          event.target.value,
                      }))
                    }
                    disabled={saving}
                    required
                  />
                </div>

                <div>
                  <label
                    className="admin-payment-settings-label"
                    htmlFor="payment-close-time"
                  >
                    የመዝጊያ ሰዓት
                  </label>

                  <input
                    id="payment-close-time"
                    className="admin-payment-settings-input"
                    type="time"
                    value={settings.serviceCloseTime}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        serviceCloseTime:
                          event.target.value,
                      }))
                    }
                    disabled={saving}
                    required
                  />
                </div>
              </div>

              <p className="admin-payment-settings-help">
                ነባሪ የኢትዮጵያ ሰዓት፦ ጠዋት 3:00 – ምሽት 12:00።
                የመክፈቻና መዝጊያ ሰዓቶች ከታች በኢትዮጵያ አቆጣጠር
                ይታያሉ፤ የአገልግሎቱ ስሌትና በሰርቨር የሚቀመጡ እሴቶች አይቀየሩም።
              </p>
            </div>

            <div className="admin-payment-settings-status">
              <p
                className={
                  "admin-payment-settings-status-title " +
                  (
                    settings.serviceEnabled &&
                    settings.isOpen
                      ? "admin-payment-settings-status-open"
                      : "admin-payment-settings-status-closed"
                  )
                }
              >
                {settings.serviceEnabled &&
                settings.isOpen
                  ? "● አገልግሎቱ አሁን ክፍት ነው"
                  : "● አገልግሎቱ አሁን ዝግ ነው"}
              </p>

              <p className="admin-payment-settings-status-info">
                የተቀመጠው ሰዓት፦{" "}
                {formatEthiopianTime(settings.serviceOpenTime)} –{" "}
                {formatEthiopianTime(settings.serviceCloseTime)}
              </p>

              {settings.localTime ? (
                <p className="admin-payment-settings-status-info">
                  አሁን በኢትዮጵያ ሰዓት፦{" "}
                  {formatEthiopianTime(settings.localTime)}
                </p>
              ) : null}
            </div>
          </section>

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
                : "ሁሉንም ቅንብሮች አስቀምጥ"}
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
    </main>
  );
}
