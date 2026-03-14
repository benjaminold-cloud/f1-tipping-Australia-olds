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

function countdownText(targetDate, now) {
  if (!targetDate) return "TBC";

  const diff = new Date(targetDate).getTime() - now.getTime();
  if (diff <= 0) return "Closed";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function getRoundStatus(round, now) {
  if (!round) {
    return {
      locked: true,
      nextLabel: "No round selected",
      nextTime: null,
      sprintOpen: false,
      raceOpen: false
    };
  }

  const sprintLock = round.is_sprint ? round.sprint_lock_at : null;
  const raceLock = round.race_lock_at || round.tips_close;

  if (round.is_sprint && sprintLock && now < new Date(sprintLock)) {
    return {
      locked: false,
      nextLabel: "Sprint tips lock in",
      nextTime: sprintLock,
      sprintOpen: true,
      raceOpen: true
    };
  }

  if (now < new Date(raceLock)) {
    return {
      locked: false,
      nextLabel: "Grand Prix tips lock in",
      nextTime: raceLock,
      sprintOpen: false,
      raceOpen: true
    };
  }

  return {
    locked: true,
    nextLabel: "Tips closed",
    nextTime: raceLock,
    sprintOpen: false,
    raceOpen: false
  };
}

// Scoring:
// - 2 points for each driver in correct position
// - 1 point for each driver in top 3 but wrong position
// - +1 bonus if all top 3 picked but wrong order
// - +3 bonus if all top 3 in exact order
// - sprint = half points
function scoreTip(tip, result, isSprint) {
  if (!tip || !result) return 0;

  const picks = [tip.p1_driver_id, tip.p2_driver_id, tip.p3_driver_id];
  const actual = [result.p1_driver_id, result.p2_driver_id, result.p3_driver_id];

  let points = 0;

  for (let i = 0; i < 3; i += 1) {
    if (!picks[i] || !actual[i]) continue;

    if (picks[i] === actual[i]) {
      points += 2;
    } else if (actual.includes(picks[i])) {
      points += 1;
    }
  }

  const pickedAllTop3 =
    actual.length === 3 &&
    actual.every((driverId) => picks.includes(driverId));

  const exactOrder =
    picks.length === 3 &&
    picks.every((driverId, idx) => driverId === actual[idx]);

  if (pickedAllTop3) {
    points += exactOrder ? 3 : 1;
  }

  return isSprint ? points / 2 : points;
}

function blankTip(resultType) {
  return {
    result_type: resultType,
    p1_driver_id: "",
    p2_driver_id: "",
    p3_driver_id: "",
    oscar_finish: ""
  };
}

function TipForm({ title, draft, setDraft, drivers, disabled, onSave, saveLabel }) {
  return (
    <div style={styles.subCard}>
      <h3 style={styles.sectionTitle}>{title}</h3>

      {[1, 2, 3].map((n) => (
        <select
          key={n}
          style={styles.input}
          disabled={disabled}
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
        disabled={disabled}
        placeholder="Oscar finish"
        value={draft.oscar_finish ?? ""}
        onChange={(e) =>
          setDraft((prev) => ({
            ...prev,
            oscar_finish: e.target.value
          }))
        }
      />

      <button style={styles.primary} onClick={onSave} disabled={disabled}>
        {disabled ? "Locked" : saveLabel}
      </button>
    </div>
  );
}

function ResultCard({ title, result, driverNameById }) {
  if (!result) {
    return (
      <div style={styles.subCard}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <p style={styles.mutedText}>No result loaded yet.</p>
      </div>
    );
  }

  return (
    <div style={styles.subCard}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>P1</span>
        <span>{driverNameById.get(result.p1_driver_id) || result.p1_driver_id || "-"}</span>
      </div>
      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>P2</span>
        <span>{driverNameById.get(result.p2_driver_id) || result.p2_driver_id || "-"}</span>
      </div>
      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>P3</span>
        <span>{driverNameById.get(result.p3_driver_id) || result.p3_driver_id || "-"}</span>
      </div>
      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>Oscar finish</span>
        <span>{result.oscar_finish ?? "DNF / N/A"}</span>
      </div>
      {"source" in result ? (
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Source</span>
          <span>{result.source || "manual"}</span>
        </div>
      ) : null}
    </div>
  );
}

function TipsCard({ title, tips, profilesById, driverNameById }) {
  if (!tips.length) {
    return (
      <div style={styles.subCard}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <p style={styles.mutedText}>No tips submitted yet.</p>
      </div>
    );
  }

  return (
    <div style={styles.subCard}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {tips.map((tip) => (
        <div key={`${tip.user_id}-${tip.result_type}`} style={styles.tipEntry}>
          <div style={styles.tipName}>{profilesById.get(tip.user_id) || "Player"}</div>
          <div style={styles.tipLine}>P1: {driverNameById.get(tip.p1_driver_id) || "-"}</div>
          <div style={styles.tipLine}>P2: {driverNameById.get(tip.p2_driver_id) || "-"}</div>
          <div style={styles.tipLine}>P3: {driverNameById.get(tip.p3_driver_id) || "-"}</div>
          <div style={styles.tipLine}>Oscar: {tip.oscar_finish ?? "-"}</div>
        </div>
      ))}
    </div>
  );
}

function Auth({ onReady }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setMsg("Enter your new password");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function forgotPassword() {
    if (!email) {
      setMsg("Enter your email first");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://f1-tipping-australia-olds.vercel.app"
    });

    if (error) setMsg(error.message);
    else setMsg("Password reset email sent");
  }

  async function updatePassword(e) {
    e.preventDefault();

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) setMsg(error.message);
    else {
      setMsg("Password updated");
      setRecoveryMode(false);
      setMode("signin");
      setNewPassword("");
    }
  }

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

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMsg(error.message);
        return;
      }

      onReady();
    } catch (err) {
      setMsg(err?.message || "Something went wrong");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.authWrap}>
        <div style={styles.card}>
          <h1 style={{ marginTop: 0 }}>🏁 Olds F1 Tipping</h1>

          {!recoveryMode ? (
            <>
              <div style={styles.tabRowTwo}>
                <button type="button" onClick={() => setMode("signin")} style={styles.tabButton}>
                  Sign in
                </button>
                <button type="button" onClick={() => setMode("signup")} style={styles.tabButton}>
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

              <button type="button" onClick={forgotPassword} style={styles.linkButton}>
                Forgot password?
              </button>
            </>
          ) : (
            <form onSubmit={updatePassword}>
              <h3 style={styles.sectionTitle}>Reset Password</h3>
              <input
                style={styles.input}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
              />
              <button style={styles.primary} type="submit">
                Update password
              </button>
            </form>
          )}

          {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [tips, setTips] = useState([]);
  const [results, setResults] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [sprintDraft, setSprintDraft] = useState(blankTip("sprint"));
  const [raceDraft, setRaceDraft] = useState(blankTip("race"));
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState("tips");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadAll(userId) {
    const [
      { data: profilesData },
      { data: driversData },
      { data: roundsData },
      { data: tipsData },
      { data: resultsData }
    ] = await Promise.all([
      supabase.from("profiles").select("id, display_name, is_admin").order("display_name"),
      supabase.from("drivers").select("*").order("name"),
      supabase.from("rounds").select("*").eq("season", 2026).order("round_number"),
      supabase.from("tips").select("*"),
      supabase.from("results").select("*")
    ]);

    setProfiles(profilesData || []);
    setDrivers(driversData || []);
    setRounds(roundsData || []);
    setTips(tipsData || []);
    setResults(resultsData || []);

    const myProfile = (profilesData || []).find((p) => p.id === userId) || null;
    setProfile(myProfile);

    const firstOpen =
      (roundsData || []).find((r) => !getRoundStatus(r, new Date()).locked) ||
      (roundsData || [])[0];

    if (firstOpen) {
      setActiveRoundId(firstOpen.id);

      const mySprintTip = (tipsData || []).find(
        (t) => t.round_id === firstOpen.id && t.user_id === userId && t.result_type === "sprint"
      );
      const myRaceTip = (tipsData || []).find(
        (t) => t.round_id === firstOpen.id && t.user_id === userId && t.result_type === "race"
      );

      setSprintDraft(mySprintTip || blankTip("sprint"));
      setRaceDraft(myRaceTip || blankTip("race"));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadAll(data.session.user.id);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        await loadAll(sess.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const activeRound = useMemo(
    () => rounds.find((r) => r.id === activeRoundId) || null,
    [rounds, activeRoundId]
  );

  useEffect(() => {
    if (!activeRound || !session?.user) return;

    const mySprintTip = tips.find(
      (t) =>
        t.round_id === activeRound.id &&
        t.user_id === session.user.id &&
        t.result_type === "sprint"
    );
    const myRaceTip = tips.find(
      (t) =>
        t.round_id === activeRound.id &&
        t.user_id === session.user.id &&
        t.result_type === "race"
    );

    setSprintDraft(mySprintTip || blankTip("sprint"));
    setRaceDraft(myRaceTip || blankTip("race"));
  }, [activeRound, tips, session]);

  const roundStatus = useMemo(
    () => getRoundStatus(activeRound, now),
    [activeRound, now]
  );

  const driverNameById = useMemo(() => {
    return new Map((drivers || []).map((d) => [d.id, d.name]));
  }, [drivers]);

  const profilesById = useMemo(() => {
    return new Map((profiles || []).map((p) => [p.id, p.display_name || "Player"]));
  }, [profiles]);

  const selectedSprintResult = useMemo(() => {
    if (!activeRound) return null;
    return results.find(
      (r) => r.round_id === activeRound.id && r.result_type === "sprint"
    ) || null;
  }, [results, activeRound]);

  const selectedRaceResult = useMemo(() => {
    if (!activeRound) return null;
    return results.find(
      (r) => r.round_id === activeRound.id && r.result_type === "race"
    ) || null;
  }, [results, activeRound]);

  const selectedSprintTips = useMemo(() => {
    if (!activeRound) return [];
    return tips.filter(
      (t) => t.round_id === activeRound.id && t.result_type === "sprint"
    );
  }, [tips, activeRound]);

  const selectedRaceTips = useMemo(() => {
    if (!activeRound) return [];
    return tips.filter(
      (t) => t.round_id === activeRound.id && t.result_type === "race"
    );
  }, [tips, activeRound]);

  const leaderboard = useMemo(() => {
    const byUser = new Map();

    tips.forEach((tip) => {
      if (!byUser.has(tip.user_id)) {
        byUser.set(tip.user_id, {
          user_id: tip.user_id,
          name: profilesById.get(tip.user_id) || "Player",
          total: 0
        });
      }
    });

    tips.forEach((tip) => {
      const result = results.find(
        (r) => r.round_id === tip.round_id && r.result_type === tip.result_type
      );
      const row = byUser.get(tip.user_id);
      if (!row) return;

      row.total += scoreTip(tip, result, tip.result_type === "sprint");
    });

    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }, [tips, results, profilesById]);

  async function saveTip(resultType, draft) {
    if (!session?.user || !activeRound) return;

    const payload = {
      round_id: activeRound.id,
      user_id: session.user.id,
      result_type: resultType,
      p1_driver_id: draft.p1_driver_id || null,
      p2_driver_id: draft.p2_driver_id || null,
      p3_driver_id: draft.p3_driver_id || null,
      oscar_finish: draft.oscar_finish ? Number(draft.oscar_finish) : null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("tips")
      .upsert(payload, { onConflict: "round_id,user_id,result_type" });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg(`${resultType === "sprint" ? "Sprint" : "Grand Prix"} tip saved`);
    await loadAll(session.user.id);
  }

  async function syncResultsNow() {
    if (!profile?.is_admin) return;

    try {
      setSyncing(true);
      setMsg("Syncing results...");

      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      const accessToken = currentSession?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-results`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: accessToken ? `Bearer ${accessToken}` : ""
          },
          body: JSON.stringify({})
        }
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMsg(json?.error || "Sync failed");
        return;
      }

      setMsg(
        json?.actions?.length
          ? `Sync complete: ${json.actions.join(", ")}`
          : "Sync complete"
      );

      if (session?.user?.id) {
        await loadAll(session.user.id);
      }
    } catch (err) {
      setMsg(err?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (!session) return <Auth onReady={() => window.location.reload()} />;

  return (
    <div style={styles.page}>
      <div style={styles.appWrap}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>🏁 Olds F1 Tipping 2026</h1>
            <p style={styles.pageSub}>Sprint tips are half points. Grand Prix tips are full points.</p>
          </div>
          <div style={styles.headerActions}>
            {profile?.is_admin ? (
              <button onClick={syncResultsNow} style={styles.secondary} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Results"}
              </button>
            ) : null}
            <button onClick={signOut} style={styles.primary}>
              Sign out
            </button>
          </div>
        </div>

        {msg ? <div style={styles.notice}>{msg}</div> : null}

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Round</h2>

          <select
            style={styles.input}
            value={activeRoundId || ""}
            onChange={(e) => setActiveRoundId(Number(e.target.value))}
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                R{r.round_number} · {r.grand_prix}
                {r.is_sprint ? " · Sprint Weekend" : ""}
              </option>
            ))}
          </select>

          {activeRound ? (
            <>
              <div style={styles.countdownBox}>
                <div style={styles.countdownLabel}>{roundStatus.nextLabel}</div>
                <div style={styles.countdownValue}>
                  {countdownText(roundStatus.nextTime, now)}
                </div>
              </div>

              <div style={styles.infoBlock}>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Grand Prix</span>
                  <span>{activeRound.grand_prix}</span>
                </div>

                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Weekend type</span>
                  <span>{activeRound.is_sprint ? "Sprint Weekend" : "Grand Prix Weekend"}</span>
                </div>

                {activeRound.is_sprint ? (
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Sprint tips lock</span>
                    <span>{fmt(activeRound.sprint_lock_at)}</span>
                  </div>
                ) : null}

                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Grand Prix tips lock</span>
                  <span>{fmt(activeRound.race_lock_at || activeRound.tips_close)}</span>
                </div>

                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Grand Prix start</span>
                  <span>{fmt(activeRound.race_start)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div style={styles.tabRow}>
          <button
            type="button"
            style={activeTab === "tips" ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab("tips")}
          >
            Tips
          </button>
          <button
            type="button"
            style={activeTab === "leaderboard" ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab("leaderboard")}
          >
            Leaderboard
          </button>
          <button
            type="button"
            style={activeTab === "results" ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab("results")}
          >
            Results
          </button>
          <button
            type="button"
            style={activeTab === "picks" ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab("picks")}
          >
            Round Picks
          </button>
        </div>

        {activeTab === "tips" ? (
          <div style={styles.stack}>
            {activeRound?.is_sprint ? (
              <TipForm
                title="Sprint Tip"
                draft={sprintDraft}
                setDraft={setSprintDraft}
                drivers={drivers}
                disabled={!roundStatus.sprintOpen}
                onSave={() => saveTip("sprint", sprintDraft)}
                saveLabel="Save sprint tip"
              />
            ) : null}

            <TipForm
              title="Grand Prix Tip"
              draft={raceDraft}
              setDraft={setRaceDraft}
              drivers={drivers}
              disabled={!roundStatus.raceOpen}
              onSave={() => saveTip("race", raceDraft)}
              saveLabel="Save Grand Prix tip"
            />
          </div>
        ) : null}

        {activeTab === "leaderboard" ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p>No tips yet.</p>
            ) : (
              leaderboard.map((row, i) => (
                <div key={row.user_id} style={styles.leaderRow}>
                  <span>
                    #{i + 1} {row.name}
                  </span>
                  <strong>{row.total}</strong>
                </div>
              ))
            )}
          </div>
        ) : null}

        {activeTab === "results" ? (
          <div style={styles.stack}>
            {activeRound?.is_sprint ? (
              <ResultCard
                title="Sprint Result"
                result={selectedSprintResult}
                driverNameById={driverNameById}
              />
            ) : null}

            <ResultCard
              title="Grand Prix Result"
              result={selectedRaceResult}
              driverNameById={driverNameById}
            />
          </div>
        ) : null}

        {activeTab === "picks" ? (
          <div style={styles.stack}>
            {activeRound?.is_sprint ? (
              <TipsCard
                title="Sprint Tips"
                tips={selectedSprintTips}
                profilesById={profilesById}
                driverNameById={driverNameById}
              />
            ) : null}

            <TipsCard
              title="Grand Prix Tips"
              tips={selectedRaceTips}
              profilesById={profilesById}
              driverNameById={driverNameById}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f1115",
    color: "white",
    padding: 12,
    fontFamily: "Arial, sans-serif"
  },
  appWrap: {
    maxWidth: 900,
    margin: "0 auto"
  },
  authWrap: {
    maxWidth: 480,
    margin: "0 auto"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap"
  },
  headerActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },
  pageTitle: {
    margin: 0,
    fontSize: 28
  },
  pageSub: {
    marginTop: 6,
    marginBottom: 0,
    color: "#9ca3af"
  },
  stack: {
    display: "grid",
    gap: 16
  },
  card: {
    background: "#171a21",
    border: "1px solid #2a2f3a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  subCard: {
    background: "#11151c",
    border: "1px solid #2a2f3a",
    borderRadius: 14,
    padding: 16
  },
  sectionTitle: {
    marginTop: 0
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    marginBottom: 12,
    background: "#0f1115",
    color: "white",
    boxSizing: "border-box"
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
  secondary: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #4b5563",
    background: "#11151c",
    color: "white",
    fontWeight: 700,
    cursor: "pointer"
  },
  linkButton: {
    marginTop: 10,
    background: "transparent",
    border: "none",
    color: "#93c5fd",
    cursor: "pointer",
    padding: 0,
    fontSize: 14
  },
  tabRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    marginBottom: 16
  },
  tabRowTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 16
  },
  tabButton: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    background: "#11151c",
    color: "white",
    cursor: "pointer",
    fontWeight: 600
  },
  activeTabButton: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #555",
    background: "white",
    color: "black",
    cursor: "pointer",
    fontWeight: 700
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
  },
  countdownBox: {
    background: "#0f1115",
    border: "1px solid #2a2f3a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16
  },
  countdownLabel: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 6
  },
  countdownValue: {
    fontSize: 28,
    fontWeight: 800
  },
  infoBlock: {
    background: "#11151c",
    border: "1px solid #2a2f3a",
    borderRadius: 14,
    padding: 14
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #232833"
  },
  infoLabel: {
    color: "#9ca3af"
  },
  tipEntry: {
    padding: "10px 0",
    borderBottom: "1px solid #232833"
  },
  tipName: {
    fontWeight: 700,
    marginBottom: 6
  },
  tipLine: {
    color: "#d1d5db",
    fontSize: 14,
    marginBottom: 3
  },
  mutedText: {
    color: "#9ca3af",
    margin: 0
  }
};