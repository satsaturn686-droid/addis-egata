
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "";

type Reward = {
  id: string;
  referral_id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  reward_amount: string | number;
  status: string;
  created_at: string;
  qualified_at: string | null;
};

type Contest = {
  id: string;
  contest_month: string;
  status: string;
  total_budget: string | number;
  created_at: string;
};

type Winner = {
  id: string;
  contest_id: string;
  user_id: string;
  rank: number;
  prize_amount: string | number;
  status: string;
  paid_at: string | null;
};

type ContestResponse = {
  contests: Contest[];
  winners: Winner[];
};

function getInitData(): string {
  const webApp = window.Telegram?.WebApp;

  if (webApp?.initData) return webApp.initData;

  const stored = sessionStorage.getItem(
    "addis-egata-telegram-init-data",
  );

  if (stored) return stored;

  throw new Error("Telegram authentication data is unavailable.");
}

async function adminRequest<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Telegram-Init-Data": getInitData(),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error || payload?.message || `API error ${response.status}`,
    );
  }

  return payload as T;
}

function amount(value: string | number): string {
  return `${Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} ብር`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("am-ET");
}

export default function AdminReferrals() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [contestData, setContestData] = useState<ContestResponse>({
    contests: [],
    winners: [],
  });
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [rewardResult, contestResult] = await Promise.all([
        adminRequest<{ rewards: Reward[] }>("/admin/referrals/rewards/pending"),
        adminRequest<ContestResponse>("/admin/referrals/monthly-contests"),
      ]);

      setRewards(rewardResult.rewards || []);
      setContestData({
        contests: contestResult.contests || [],
        winners: contestResult.winners || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "መረጃውን ማምጣት አልተቻለም።");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setWorking(key);
    setError("");
    setMessage("");

    try {
      await action();
      setMessage(successMessage);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ተግባሩ አልተሳካም።");
    } finally {
      setWorking(null);
    }
  }

  return (
    <main style={{
      maxWidth: 900,
      margin: "0 auto",
      padding: 16,
      color: "#f4f7fb",
    }}>
      <h1>የግብዣ አስተዳደር</h1>
      <p>የግብዣ ቦነሶችን እና ወርሃዊ ውድድሮችን ከዚህ ያስተዳድሩ።</p>

      <button type="button" onClick={() => void loadData()} disabled={loading}>
        {loading ? "በመጫን ላይ..." : "🔄 መረጃ አድስ"}
      </button>

      {error && (
        <p role="alert" style={{ color: "#ff8585", overflowWrap: "anywhere" }}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}

      <hr />

      <h2>የግብዣ ቦነሶች</h2>
      {rewards.length === 0 && !loading && (
        <p>የሚጠብቅ ቦነስ የለም።</p>
      )}

      {rewards.map((reward) => (
        <section key={reward.id} style={{
          border: "1px solid #394655",
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
          overflowWrap: "anywhere",
        }}>
          <p><strong>ቦነስ:</strong> {amount(reward.reward_amount)}</p>
          <p><strong>ሁኔታ:</strong> {reward.status}</p>
          <p><strong>የጋባዥ መለያ:</strong> {reward.inviter_user_id}</p>
          <p><strong>የተጋበዘ መለያ:</strong> {reward.invitee_user_id}</p>
          <p><strong>የተመዘገበበት:</strong> {dateLabel(reward.created_at)}</p>

          {reward.status === "pending" && (
            <button
              type="button"
              disabled={working !== null}
              onClick={() => {
                if (!window.confirm("ይህን ቦነስ በWallet ላይ እንዲገባ ያጽድቁ?")) return;
                void runAction(
                  `reward-${reward.id}`,
                  () => adminRequest(
                    `/admin/referrals/rewards/${encodeURIComponent(reward.id)}/approve`,
                    "POST",
                  ),
                  "ቦነሱ ተፈቅዷል።",
                );
              }}
            >
              {working === `reward-${reward.id}` ? "በመስራት ላይ..." : "ቦነስ አጽድቅ"}
            </button>
          )}
        </section>
      ))}

      <hr />

      <h2>ወርሃዊ ውድድር</h2>
      <p>የውድድሩ ጠቅላላ በጀት 2,500 ብር ነው። የወሩ ውድድር ከተጠናቀቀ በኋላ ብቻ ይፍጠሩ።</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          aria-label="የውድድር ወር"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <button
          type="button"
          disabled={!month || working !== null}
          onClick={() => {
            if (!window.confirm(`${month} የውድድር ውጤት ይፍጠሩ?`)) return;
            void runAction(
              "create-contest",
              () => adminRequest(
                "/admin/referrals/monthly-contests",
                "POST",
                { month },
              ),
              "የውድድር ረቂቅ ተፈጥሯል።",
            );
          }}
        >
          የውድድር ረቂቅ ፍጠር
        </button>
      </div>

      {contestData.contests.map((contest) => {
        const winners = contestData.winners.filter(
          (winner) => winner.contest_id === contest.id,
        );

        return (
          <section key={contest.id} style={{
            border: "1px solid #394655",
            borderRadius: 12,
            padding: 14,
            marginTop: 12,
            overflowWrap: "anywhere",
          }}>
            <h3>{String(contest.contest_month).slice(0, 7)}</h3>
            <p><strong>ሁኔታ:</strong> {contest.status}</p>
            <p><strong>በጀት:</strong> {amount(contest.total_budget)}</p>

            {winners.map((winner) => (
              <div key={winner.id} style={{
                borderTop: "1px solid #394655",
                paddingTop: 8,
                marginTop: 8,
              }}>
                <p>
                  {winner.rank}. ተጠቃሚ: {winner.user_id}
                  {" — "}{amount(winner.prize_amount)}
                </p>
                <p>ሁኔታ: {winner.status}</p>
                {winner.status === "approved" && contest.status === "approved" && (
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() => {
                      if (!window.confirm("የውድድር ሽልማቱን ወደ Wallet ያስገቡ?")) return;
                      void runAction(
                        `winner-${winner.id}`,
                        () => adminRequest(
                          `/admin/referrals/monthly-winners/${encodeURIComponent(winner.id)}/pay`,
                          "POST",
                        ),
                        "የውድድር ሽልማቱ ተከፍሏል።",
                      );
                    }}
                  >
                    {working === `winner-${winner.id}` ? "በመስራት ላይ..." : "ሽልማት ክፈል"}
                  </button>
                )}
              </div>
            ))}

            {(contest.status === "draft" || contest.status === "closed") && (
              <button
                type="button"
                disabled={working !== null}
                onClick={() => {
                  if (!window.confirm("የውድድሩን ውጤት ያጽድቁ?")) return;
                  void runAction(
                    `contest-${contest.id}`,
                    () => adminRequest(
                      `/admin/referrals/monthly-contests/${encodeURIComponent(contest.id)}/approve`,
                      "POST",
                    ),
                    "የውድድሩ ውጤት ጸድቋል።",
                  );
                }}
              >
                {working === `contest-${contest.id}` ? "በመስራት ላይ..." : "የውድድር ውጤት አጽድቅ"}
              </button>
            )}
          </section>
        );
      })}
    </main>
  );
}
