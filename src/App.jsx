import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function fmt(dateStr) {
  if (!dateStr) return "TBC";
  return new Date(dateStr).toLocaleString();
}

function isLocked(round) {
  return new Date(round.tips_close) <= new Date();
}

function scoreTip(tip, result, isSprint) {
  if (!tip || !result) return 0;

  const picks = [tip.p1_driver_id, tip.p2_driver_id, tip.p3_driver_id];
  const actual = [result.p1_driver_id, result.p2_driver_id, result.p3_driver_id];

  let points = 0;
  let correctDrivers = 0;

  for (let i = 0; i < 3; i += 1) {
    if (picks[i] === actual[i]) points += 2;
    if (picks.includes(actual[i])) correctDrivers += 1;
  }

  if (correctDrivers === 3) {
    const exact = picks.every((d, i) => d === actual[i]);
    points += exact ? 3 : 1;
  }

  if (Number(tip.oscar_finish) === Number(result.oscar_finish)) {
    points += 2;
  }

  return isSprint ? points / 2 : points;
}

function Auth({ onReady }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function testConnection() {
      try {
        const { error } = await supabase.auth.getSession();
        if (error) {
          setMsg(`Session test error: ${error.message}`);
        }
      } catch (err) {
        setMsg(`Connection failed: ${err.message}`);
      }
    }
    testConnection();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] }
          }
        });

        if (error) {
          setMsg(error.message);
          return;
        }

        setMsg("Account created. Check your email if confirmation is required, then sign in.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      onReady();
    } catch (err) {
      console.error("Signup/signin error", err);
      setMsg(err?.message || "Something went wrong");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>🏁 Olds F1 Tipping</h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setMode("signin")}
            style={styles.tab}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={styles.tab}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <input
              style={styles.input}
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}

          <input
            style={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />

          <input
            style={styles.input}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          <button style={styles.primary} type="submit">
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [tips, setTips] = useState([]);
  const [results, setResults] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [draft, setDraft] = useState({
    p1_driver_id: "",
    p2_driver_id: "",
    p3_driver_id: "",
    oscar_finish: ""
  });
  const [msg, setMsg] = useState("");

  async function loadAll(userId) {
    const [
      { data: driversData },
      { data: roundsData },
      { data: tipsData },
      { data: resultsData }
    ] = await Promise.all([
      supabase.from("drivers").select("*").order("name"),
      supabase.from("rounds").select("*").eq("season", 2026).order("round_number"),
      supabase.from("tips").select("*"),
      supabase.from("results").select("*")
    ]);

    setDrivers(driversData || []);
    setRounds(roundsData || []);
    setTips(tipsData || []);
    setResults(resultsData || []);

    const firstOpen =
      (roundsData || []).find((r) => !isLocked(r)) || (roundsData || [])[0];

    if (firstOpen) {
      setActiveRoundId(firstOpen.id);
      const myTip = (tipsData || []).find(
        (t) => t.round_id === firstOpen.id && t.user_id === userId
      );
      if (myTip) setDraft(myTip);
      else {
        setDraft({
          p1_driver_id: "",
          p2_driver_id: "",
          p3_driver_id: "",
          oscar_finish: ""
        });
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      if (data.session?.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.session.user.id)
          .maybeSingle();

        setProfile(p || null);
        await loadAll(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess);

        if (sess?.user) {
          const { data: p } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", sess.user.id)
            .maybeSingle();

          setProfile(p || null);
          await loadAll(sess.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const activeRound = useMemo(
    () => rounds.find((r) => r.id === activeRoundId) || null,
    [rounds, activeRoundId]
  );

  const leaderboard = useMemo(() => {
    const byUser = new Map();

    tips.forEach((tip) => {
      if (!byUser.has(tip.user_id)) {
        byUser.set(tip.user_id, {
          user_id: tip.user_id,
          name: tip.user_id === profile?.id ? profile?.display_name || "You" : "Player",
          total: 0
        });
      }
    });

    tips.forEach((tip) => {
      const round = rounds.find((r) => r.id === tip.round_id);
      const raceResult = results.find(
        (r) => r.round_id === tip.round_id && r.result_type === "race"
      );
      const sprintResult = results.find(
        (r) => r.round_id === tip.round_id && r.result_type === "sprint"
      );
      const row = byUser.get(tip.user_id);
      row.total += scoreTip(tip, raceResult, false);
      if (round?.is_sprint) row.total += scoreTip(tip, sprintResult, true);
    });

    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }, [tips, results, rounds, profile]);

  async function saveTip() {
    if (!session?.user || !activeRound) return;

    const payload = {
      round_id: activeRound.id,
      user_id: session.user.id,
      p1_driver_id: draft.p1_driver_id || null,
      p2_driver_id: draft.p2_driver_id || null,
      p3_driver_id: draft.p3_driver_id || null,
      oscar_finish: draft.oscar_finish ? Number(draft.oscar_finish) : null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("tips")
      .upsert(payload, { onConflict: "round_id,user_id" });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Tip saved");
    await loadAll(session.user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!session) return <Auth onReady={() => {}} />;

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={styles.header}>
          <div>
            <h1>🏁 Olds F1 Tipping 2026</h1>
            <p>Top 3 + Oscar finish. Sprint races score half points.</p>
          </div>
          <button onClick={signOut} style={styles.primary}>
            Sign out
          </button>
        </div>

        {msg ? <div style={styles.notice}>{msg}</div> : null}

        <div style={styles.grid}>
          <div style={styles.card}>
            <h2>Rounds</h2>

            <select
              style={styles.input}
              value={activeRoundId || ""}
              onChange={(e) => setActiveRoundId(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  R{r.round_number} · {r.grand_prix}
                </option>
              ))}
            </select>

            {activeRound ? (
              <>
                <p><strong>Race:</strong> {fmt(activeRound.race_start)}</p>
                <p><strong>Tips close:</strong> {fmt(activeRound.tips_close)}</p>
                <p><strong>Status:</strong> {isLocked(activeRound) ? "Locked" : "Open"}</p>

                <h3>Your tip</h3>

                {[1, 2, 3].map((n) => (
                  <select
                    key={n}
                    style={styles.input}
                    disabled={isLocked(activeRound)}
                    value={draft[`p${n}_driver_id`] || ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [`p${n}_driver_id`]: e.target.value
                      }))
                    }
                  >
                    <option value="">Pick P{n}</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.team}
                      </option>
                    ))}
                  </select>
                ))}

                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  max="22"
                  disabled={isLocked(activeRound)}
                  placeholder="Oscar finish"
                  value={draft.oscar_finish || ""}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      oscar_finish: e.target.value
                    }))
                  }
                />

                <button
                  style={styles.primary}
                  onClick={saveTip}
                  disabled={isLocked(activeRound)}
                >
                  {isLocked(activeRound) ? "Round locked" : "Save tip"}
                </button>
              </>
            ) : null}
          </div>

          <div style={styles.card}>
            <h2>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p>No tips yet.</p>
            ) : (
              leaderboard.map((row, i) => (
                <div key={row.user_id} style={styles.leaderRow}>
                  <span>#{i + 1} {row.name}</span>
                  <strong>{row.total}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f1115",
    color: "white",
    padding: 24,
    fontFamily: "Arial, sans-serif"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 24
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24
  },
  card: {
    background: "#171a21",
    border: "1px solid #2a2f3a",
    borderRadius: 16,
    padding: 20
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    marginBottom: 12,
    background: "#0f1115",
    color: "white"
  },
  primary: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "white",
    color: "black",
    fontWeight: 700,
    cursor: "pointer"
  },
  tab: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #333",
    background: "#0f1115",
    color: "white",
    cursor: "pointer"
  },
  notice: {
    background: "#171a21",
    border: "1px solid #2a2f3a",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16
  },
  leaderRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #2a2f3a"
  }
};
