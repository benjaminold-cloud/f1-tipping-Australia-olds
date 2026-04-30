// app refresh
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SEASON = 2026;
const ROUND_STAY_VISIBLE_HOURS = 48;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const wait = (ms, message) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

function withTimeout(promise, ms = 15000, message = "Action timed out") {
  return Promise.race([promise, wait(ms, message)]);
}

function fmt(value) {
  if (!value) return "TBC";
  return new Date(value).toLocaleString();
}

function blankTip(type) {
  return {
    result_type: type,
    p1_driver_id: "",
    p2_driver_id: "",
    p3_driver_id: "",
    oscar_finish: ""
  };
}

function blankResult(type) {
  return {
    result_type: type,
    p1_driver_id: "",
    p2_driver_id: "",
    p3_driver_id: "",
    oscar_finish: ""
  };
}

function getRoundRef(round) {
  return round?.race_start || round?.race_lock_at || round?.tips_close || null;
}

function getRoundStatus(round, now) {
  if (!round) {
    return { label: "No round selected", time: null, sprintOpen: false, raceOpen: false };
  }

  const sprintLock = round.is_sprint ? round.sprint_lock_at : null;
  const raceLock = round.race_lock_at || round.tips_close;

  if (round.is_sprint && sprintLock && now < new Date(sprintLock)) {
    return { label: "Sprint tips lock in", time: sprintLock, sprintOpen: true, raceOpen: true };
  }

  if (raceLock && now < new Date(raceLock)) {
    return { label: "Grand Prix tips lock in", time: raceLock, sprintOpen: false, raceOpen: true };
  }

  return { label: "Tips closed", time: raceLock, sprintOpen: false, raceOpen: false };
}

function countdown(target, now) {
  if (!target) return "TBC";
  const diff = new Date(target).getTime() - now.getTime();
  if (diff <= 0) return "Closed";

  const total = Math.floor(diff / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`;
}

function preferredRound(rounds, now, currentId) {
  if (!rounds.length) return null;

  const current = rounds.find((r) => String(r.id) === String(currentId));
  if (current) return current;

  const graceMs = ROUND_STAY_VISIBLE_HOURS * 60 * 60 * 1000;

  const visible = rounds.find((r) => {
    const ref = getRoundRef(r);
    return ref && now.getTime() < new Date(ref).getTime() + graceMs;
  });

  if (visible) return visible;

  const upcoming = rounds.find((r) => {
    const ref = getRoundRef(r);
    return ref && now.getTime() < new Date(ref).getTime();
  });

  return upcoming || rounds[rounds.length - 1];
}

function scoreTip(tip, result, isSprint) {
  if (!tip || !result) return 0;

  const picks = [tip.p1_driver_id, tip.p2_driver_id, tip.p3_driver_id];
  const actual = [result.p1_driver_id, result.p2_driver_id, result.p3_driver_id];

  let points = 0;

  for (let i = 0; i < 3; i += 1) {
    if (!picks[i] || !actual[i]) continue;
    if (picks[i] === actual[i]) points += 2;
    else if (actual.includes(picks[i])) points += 1;
  }

  const allTop3 = actual.every((driverId) => driverId && picks.includes(driverId));
  const exactOrder = picks.every((driverId, index) => driverId && driverId === actual[index]);

  if (allTop3) points += exactOrder ? 3 : 1;

  if (
    tip.oscar_finish !== null &&
    tip.oscar_finish !== "" &&
    result.oscar_finish !== null &&
    result.oscar_finish !== "" &&
    Number(tip.oscar_finish) === Number(result.oscar_finish)
  ) {
    points += 2;
  }

  return isSprint ? points / 2 : points;
}

function scoreBreakdown(tip, result, isSprint) {
  const empty = {
    pickScores: [0, 0, 0],
    pickStates: ["pending", "pending", "pending"],
    bonus: 0,
    oscarPoints: 0,
    oscarState: "pending",
    total: 0
  };

  if (!tip || !result) return empty;

  const picks = [tip.p1_driver_id, tip.p2_driver_id, tip.p3_driver_id];
  const actual = [result.p1_driver_id, result.p2_driver_id, result.p3_driver_id];

  const rawPickScores = [0, 0, 0];
  const pickStates = ["miss", "miss", "miss"];

  for (let i = 0; i < 3; i += 1) {
    if (!picks[i] || !actual[i]) continue;
    if (picks[i] === actual[i]) {
      rawPickScores[i] = 2;
      pickStates[i] = "exact";
    } else if (actual.includes(picks[i])) {
      rawPickScores[i] = 1;
      pickStates[i] = "partial";
    }
  }

  const allTop3 = actual.every((driverId) => driverId && picks.includes(driverId));
  const exactOrder = picks.every((driverId, index) => driverId && driverId === actual[index]);
  const rawBonus = allTop3 ? (exactOrder ? 3 : 1) : 0;

  let rawOscar = 0;
  let oscarState = "pending";

  if (
    tip.oscar_finish !== null &&
    tip.oscar_finish !== "" &&
    result.oscar_finish !== null &&
    result.oscar_finish !== ""
  ) {
    oscarState = Number(tip.oscar_finish) === Number(result.oscar_finish) ? "exact" : "miss";
    rawOscar = oscarState === "exact" ? 2 : 0;
  }

  const mult = isSprint ? 0.5 : 1;
  const pickScores = rawPickScores.map((points) => points * mult);
  const bonus = rawBonus * mult;
  const oscarPoints = rawOscar * mult;
  const total = pickScores.reduce((sum, points) => sum + points, 0) + bonus + oscarPoints;

  return { pickScores, pickStates, bonus, oscarPoints, oscarState, total };
}

function Toast({ toast, close }) {
  if (!toast) return null;
  const style =
    toast.type === "success"
      ? styles.toastSuccess
      : toast.type === "error"
      ? styles.toastError
      : styles.toastInfo;

  return (
    <div style={{ ...styles.toast, ...style }}>
      <span>{toast.message}</span>
      <button style={styles.toastClose} onClick={close}>×</button>
    </div>
  );
}

function DriverName({ id, driverMap }) {
  const driver = driverMap.get(id);
  return <span>{driver ? driver.name : id || "-"}</span>;
}

function Row({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreTag({ state, points }) {
  if (state === "pending") return null;
  const label = Number.isInteger(points) ? points : points.toFixed(1);
  const style = state === "exact" ? styles.tagGood : state === "partial" ? styles.tagWarn : styles.tagBad;
  const icon = state === "exact" ? "✓" : state === "partial" ? "•" : "✕";
  return <span style={style}>{icon} +{label}</span>;
}

function Auth({ notify }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(event) {
    event.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      notify(error.message, "error");
      return;
    }
    window.location.reload();
  }

  async function resetPassword() {
    if (!email) {
      notify("Enter your email first", "error");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });

    notify(error ? error.message : "Password reset email sent", error ? "error" : "success");
  }

  return (
    <div style={styles.page}>
      <div style={styles.authCard}>
        <h1>🏁 Olds F1 Tipping</h1>
        <form onSubmit={signIn}>
          <input
            style={styles.input}
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button style={styles.primary}>Sign in</button>
          <button type="button" style={styles.linkButton} onClick={resetPassword}>Forgot password?</button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [tips, setTips] = useState([]);
  const [results, setResults] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState("");
  const [activeTab, setActiveTab] = useState("tips");
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const [raceDraft, setRaceDraft] = useState(blankTip("race"));
  const [sprintDraft, setSprintDraft] = useState(blankTip("sprint"));
  const [raceResultDraft, setRaceResultDraft] = useState(blankResult("race"));
  const [sprintResultDraft, setSprintResultDraft] = useState(blankResult("sprint"));

  const toastTimer = useRef(null);

  function notify(message, type = "info") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function ensureSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error("Session expired. Please sign in again.");
    setSession(data.session);
    return data.session;
  }

  async function loadAll({ keepRound = true, silent = false } = {}) {
    try {
      if (!silent) setLoading(true);

      const sessionValue = await ensureSession();

      const [profilesRes, driversRes, roundsRes, tipsRes, resultsRes] = await withTimeout(
        Promise.all([
          supabase.from("profiles").select("*").order("display_name"),
          supabase.from("drivers").select("*").order("name"),
          supabase.from("rounds").select("*").eq("season", SEASON).order("round_number"),
          supabase.from("tips").select("*"),
          supabase.from("results").select("*")
        ]),
        15000,
        "Loading timed out. Tap Reload App."
      );

      const error =
        profilesRes.error || driversRes.error || roundsRes.error || tipsRes.error || resultsRes.error;

      if (error) throw error;

      const profilesData = profilesRes.data || [];
      const driversData = driversRes.data || [];
      const roundsData = roundsRes.data || [];
      const tipsData = tipsRes.data || [];
      const resultsData = resultsRes.data || [];

      setProfiles(profilesData);
      setDrivers(driversData);
      setRounds(roundsData);
      setTips(tipsData);
      setResults(resultsData);

      const myProfile = profilesData.find((item) => item.id === sessionValue.user.id) || null;
      setProfile(myProfile);

      const pickRound = preferredRound(roundsData, new Date(), keepRound ? activeRoundId : "");
      if (pickRound) setActiveRoundId(pickRound.id);
    } catch (error) {
      notify(error.message || "Failed to load app", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadAll({ keepRound: false });
      else setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const activeRound = useMemo(
    () => rounds.find((round) => String(round.id) === String(activeRoundId)) || null,
    [rounds, activeRoundId]
  );

  const status = useMemo(() => getRoundStatus(activeRound, now), [activeRound, now]);

  const driverMap = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.display_name || "Player"])),
    [profiles]
  );

  const selectedRaceResult = useMemo(
    () =>
      results.find(
        (result) => String(result.round_id) === String(activeRound?.id) && result.result_type === "race"
      ) || null,
    [results, activeRound]
  );

  const selectedSprintResult = useMemo(
    () =>
      results.find(
        (result) =>
          String(result.round_id) === String(activeRound?.id) && result.result_type === "sprint"
      ) || null,
    [results, activeRound]
  );

  const selectedRaceTips = useMemo(
    () =>
      tips.filter(
        (tip) => String(tip.round_id) === String(activeRound?.id) && tip.result_type === "race"
      ),
    [tips, activeRound]
  );

  const selectedSprintTips = useMemo(
    () =>
      tips.filter(
        (tip) => String(tip.round_id) === String(activeRound?.id) && tip.result_type === "sprint"
      ),
    [tips, activeRound]
  );

  useEffect(() => {
    if (!session?.user || !activeRound) return;

    const myRaceTip = tips.find(
      (tip) =>
        String(tip.round_id) === String(activeRound.id) &&
        tip.user_id === session.user.id &&
        tip.result_type === "race"
    );

    const mySprintTip = tips.find(
      (tip) =>
        String(tip.round_id) === String(activeRound.id) &&
        tip.user_id === session.user.id &&
        tip.result_type === "sprint"
    );

    setRaceDraft(myRaceTip || blankTip("race"));
    setSprintDraft(mySprintTip || blankTip("sprint"));
    setRaceResultDraft(selectedRaceResult || blankResult("race"));
    setSprintResultDraft(selectedSprintResult || blankResult("sprint"));
  }, [tips, results, session, activeRound, selectedRaceResult, selectedSprintResult]);

  const leaderboard = useMemo(() => {
    const rows = new Map();

    tips.forEach((tip) => {
      if (!rows.has(tip.user_id)) {
        rows.set(tip.user_id, {
          user_id: tip.user_id,
          name: profileMap.get(tip.user_id) || "Player",
          total: 0
        });
      }

      const result = results.find(
        (item) => String(item.round_id) === String(tip.round_id) && item.result_type === tip.result_type
      );

      rows.get(tip.user_id).total += scoreTip(tip, result, tip.result_type === "sprint");
    });

    return [...rows.values()].sort((a, b) => b.total - a.total);
  }, [tips, results, profileMap]);

  async function saveTip(type, draft, userId = session?.user?.id) {
    try {
      if (!activeRound) throw new Error("No round selected");
      if (!userId) throw new Error("No player selected");

      await ensureSession();
      setBusy(true);

      const payload = {
        round_id: activeRound.id,
        user_id: userId,
        result_type: type,
        p1_driver_id: draft.p1_driver_id || null,
        p2_driver_id: draft.p2_driver_id || null,
        p3_driver_id: draft.p3_driver_id || null,
        oscar_finish: draft.oscar_finish ? Number(draft.oscar_finish) : null,
        updated_at: new Date().toISOString()
      };

      const response = await withTimeout(
        supabase.from("tips").upsert(payload, { onConflict: "round_id,user_id,result_type" }),
        15000,
        "Save timed out. Tap Reload App."
      );

      if (response.error) throw response.error;

      notify(`${type === "sprint" ? "Sprint" : "Grand Prix"} tip saved`, "success");
      await loadAll({ silent: true });
    } catch (error) {
      notify(error.message || "Failed to save tip", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(type, draft) {
    try {
      if (!profile?.is_admin) throw new Error("Admin only");
      if (!activeRound) throw new Error("No round selected");

      await ensureSession();
      setBusy(true);

      const payload = {
        round_id: activeRound.id,
        result_type: type,
        p1_driver_id: draft.p1_driver_id || null,
        p2_driver_id: draft.p2_driver_id || null,
        p3_driver_id: draft.p3_driver_id || null,
        oscar_finish: draft.oscar_finish ? Number(draft.oscar_finish) : null,
        source: "manual",
        updated_at: new Date().toISOString()
      };

      const response = await withTimeout(
        supabase.from("results").upsert(payload, { onConflict: "round_id,result_type" }),
        15000,
        "Save result timed out"
      );

      if (response.error) throw response.error;

      notify(`${type === "sprint" ? "Sprint" : "Grand Prix"} result saved`, "success");
      await loadAll({ silent: true });
    } catch (error) {
      notify(error.message || "Failed to save result", "error");
    } finally {
      setBusy(false);
    }
  }

  async function syncResults() {
    try {
      if (!profile?.is_admin) throw new Error("Admin only");
      if (!activeRound) throw new Error("No round selected");

      setBusy(true);
      notify("Syncing results...", "info");

      const response = await withTimeout(
        supabase.functions.invoke("sync-results", {
          body: { season: SEASON, round_number: activeRound.round_number }
        }),
        20000,
        "Sync timed out"
      );

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      notify(response.data?.success ? "Results synced" : response.data?.message || "Sync complete", "success");
      await loadAll({ silent: true });
    } catch (error) {
      notify(error.message || "Sync failed. Use manual override.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(values) {
    try {
      if (!profile?.is_admin) throw new Error("Admin only");
      setBusy(true);

      const sessionValue = await ensureSession();

      const response = await withTimeout(
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionValue.access_token}`
          },
          body: JSON.stringify(values)
        }),
        15000,
        "Create user timed out"
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Failed to create user");
      }

      notify(`Created user: ${json.display_name || values.display_name}`, "success");
      await loadAll({ silent: true });
    } catch (error) {
      notify(error.message || "Failed to create user", "error");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <h1>🏁 Olds F1 Tipping 2026</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Auth notify={notify} />
        <Toast toast={toast} close={() => setToast(null)} />
      </>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>🏁 Olds F1 Tipping 2026</h1>
            <p style={styles.subtitle}>Sprint tips are half points. Grand Prix tips are full points.</p>
          </div>

          <div style={styles.actions}>
            <button style={styles.secondary} onClick={() => loadAll({ keepRound: true })} disabled={busy}>
              Refresh
            </button>
            <button style={styles.secondary} onClick={() => window.location.reload()}>
              Reload App
            </button>
            {profile?.is_admin && (
              <button style={styles.secondary} onClick={syncResults} disabled={busy}>
                {busy ? "Please wait..." : "Sync Results"}
              </button>
            )}
            <button style={styles.primary} onClick={signOut}>Sign out</button>
          </div>
        </header>

        <section style={styles.card}>
          <h2>Round</h2>
          <select
            style={styles.input}
            value={activeRoundId || ""}
            onChange={(event) => setActiveRoundId(Number(event.target.value))}
          >
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                R{round.round_number} · {round.grand_prix}
                {round.is_sprint ? " · Sprint Weekend" : ""}
              </option>
            ))}
          </select>

          {activeRound && (
            <>
              <div style={styles.countdown}>
                <div style={styles.muted}>{status.label}</div>
                <strong style={styles.countdownText}>{countdown(status.time, now)}</strong>
              </div>

              <div style={styles.info}>
                <Row label="Grand Prix" value={activeRound.grand_prix} />
                <Row label="Weekend type" value={activeRound.is_sprint ? "Sprint Weekend" : "Grand Prix Weekend"} />
                {activeRound.is_sprint && <Row label="Sprint tips lock" value={fmt(activeRound.sprint_lock_at)} />}
                <Row label="Grand Prix tips lock" value={fmt(activeRound.race_lock_at || activeRound.tips_close)} />
                <Row label="Grand Prix start" value={fmt(activeRound.race_start)} />
              </div>
            </>
          )}
        </section>

        <nav style={styles.tabs}>
          {["tips", "leaderboard", "results", "picks", "profile"].map((tab) => (
            <button
              key={tab}
              style={activeTab === tab ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "picks" ? "Round Picks" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {profile?.is_admin && (
            <button
              style={activeTab === "admin" ? styles.adminTabActive : styles.adminTab}
              onClick={() => setActiveTab("admin")}
            >
              Admin
            </button>
          )}
        </nav>

        {activeTab === "tips" && (
          <div style={styles.stack}>
            {activeRound?.is_sprint && (
              <TipForm
                title="Sprint Tip"
                draft={sprintDraft}
                setDraft={setSprintDraft}
                drivers={drivers}
                disabled={!status.sprintOpen || busy}
                onSave={() => saveTip("sprint", sprintDraft)}
              />
            )}

            <TipForm
              title="Grand Prix Tip"
              draft={raceDraft}
              setDraft={setRaceDraft}
              drivers={drivers}
              disabled={!status.raceOpen || busy}
              onSave={() => saveTip("race", raceDraft)}
            />
          </div>
        )}

        {activeTab === "leaderboard" && (
          <section style={styles.card}>
            <h2>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p style={styles.muted}>No points yet.</p>
            ) : (
              leaderboard.map((row, index) => (
                <div key={row.user_id} style={styles.leaderRow}>
                  <strong>#{index + 1} {row.name}</strong>
                  <strong>{row.total}</strong>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "results" && (
          <div style={styles.stack}>
            {activeRound?.is_sprint && (
              <ResultCard title="Sprint Result" result={selectedSprintResult} driverMap={driverMap} />
            )}
            <ResultCard title="Grand Prix Result" result={selectedRaceResult} driverMap={driverMap} />
          </div>
        )}

        {activeTab === "picks" && (
          <div style={styles.stack}>
            {activeRound?.is_sprint && (
              <TipsCard
                title="Sprint Picks"
                tips={selectedSprintTips}
                result={selectedSprintResult}
                isSprint={true}
                profileMap={profileMap}
                driverMap={driverMap}
              />
            )}
            <TipsCard
              title="Grand Prix Picks"
              tips={selectedRaceTips}
              result={selectedRaceResult}
              isSprint={false}
              profileMap={profileMap}
              driverMap={driverMap}
            />
          </div>
        )}

        {activeTab === "profile" && (
          <section style={styles.card}>
            <h2>Profile</h2>
            <p>{profile?.display_name || session.user.email}</p>
            <p style={styles.muted}>{session.user.email}</p>
          </section>
        )}

        {activeTab === "admin" && profile?.is_admin && (
          <AdminPanel
            profiles={profiles}
            rounds={rounds}
            drivers={drivers}
            tips={tips}
            activeRound={activeRound}
            raceResultDraft={raceResultDraft}
            setRaceResultDraft={setRaceResultDraft}
            sprintResultDraft={sprintResultDraft}
            setSprintResultDraft={setSprintResultDraft}
            saveResult={saveResult}
            saveTip={saveTip}
            createUser={createUser}
            busy={busy}
          />
        )}
      </div>

      <Toast toast={toast} close={() => setToast(null)} />
    </div>
  );
}

function TipForm({ title, draft, setDraft, drivers, disabled, onSave }) {
  return (
    <section style={styles.card}>
      <h2>{title}</h2>

      {[1, 2, 3].map((place) => (
        <select
          key={place}
          style={styles.input}
          disabled={disabled}
          value={draft[`p${place}_driver_id`] || ""}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, [`p${place}_driver_id`]: event.target.value }))
          }
        >
          <option value="">Pick P{place}</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} · {driver.team}
            </option>
          ))}
        </select>
      ))}

      <input
        style={styles.input}
        disabled={disabled}
        type="number"
        min="1"
        max="22"
        placeholder="Oscar finish"
        value={draft.oscar_finish ?? ""}
        onChange={(event) => setDraft((prev) => ({ ...prev, oscar_finish: event.target.value }))}
      />

      <button style={styles.primary} disabled={disabled} onClick={onSave}>
        {disabled ? "Locked" : "Save"}
      </button>
    </section>
  );
}

function ResultCard({ title, result, driverMap }) {
  return (
    <section style={styles.card}>
      <h2>{title}</h2>
      {!result ? (
        <p style={styles.muted}>No result yet.</p>
      ) : (
        <>
          <Row label="P1" value={<DriverName id={result.p1_driver_id} driverMap={driverMap} />} />
          <Row label="P2" value={<DriverName id={result.p2_driver_id} driverMap={driverMap} />} />
          <Row label="P3" value={<DriverName id={result.p3_driver_id} driverMap={driverMap} />} />
          <Row label="Oscar finish" value={result.oscar_finish ?? "-"} />
          <Row label="Source" value={result.source || "unknown"} />
        </>
      )}
    </section>
  );
}

function TipsCard({ title, tips, result, isSprint, profileMap, driverMap }) {
  return (
    <section style={styles.card}>
      <h2>{title}</h2>

      {!tips.length ? (
        <p style={styles.muted}>No picks yet.</p>
      ) : (
        tips.map((tip) => {
          const b = scoreBreakdown(tip, result, isSprint);

          return (
            <div key={`${tip.user_id}-${tip.result_type}`} style={styles.pickCard}>
              <div style={styles.pickHeader}>
                <strong>{profileMap.get(tip.user_id) || "Player"}</strong>
                {result && <strong>Total: {b.total}</strong>}
              </div>

              {[1, 2, 3].map((place, index) => (
                <div key={place} style={styles.pickRow}>
                  <span>P{place}: <DriverName id={tip[`p${place}_driver_id`]} driverMap={driverMap} /></span>
                  {result && <ScoreTag state={b.pickStates[index]} points={b.pickScores[index]} />}
                </div>
              ))}

              <div style={styles.pickRow}>
                <span>Oscar: {tip.oscar_finish ?? "-"}</span>
                {result && <ScoreTag state={b.oscarState} points={b.oscarPoints} />}
              </div>

              {result && b.bonus > 0 && <div style={styles.bonus}>Bonus: +{b.bonus}</div>}
            </div>
          );
        })
      )}
    </section>
  );
}

function AdminPanel({
  profiles,
  rounds,
  drivers,
  tips,
  activeRound,
  raceResultDraft,
  setRaceResultDraft,
  sprintResultDraft,
  setSprintResultDraft,
  saveResult,
  saveTip,
  createUser,
  busy
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("OldsF1Start!");
  const [makeAdmin, setMakeAdmin] = useState(false);

  const [editRoundId, setEditRoundId] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [editRaceDraft, setEditRaceDraft] = useState(blankTip("race"));
  const [editSprintDraft, setEditSprintDraft] = useState(blankTip("sprint"));

  const editRound = rounds.find((round) => String(round.id) === String(editRoundId));

  useEffect(() => {
    const nextEmail =
      displayName.trim()
        ? `${displayName.trim().toLowerCase().replace(/\s+/g, ".")}@oldsf1.test`
        : "";
    if (!email || email.endsWith("@oldsf1.test")) setEmail(nextEmail);
  }, [displayName]);

  useEffect(() => {
    if (!editRoundId || !editUserId) {
      setEditRaceDraft(blankTip("race"));
      setEditSprintDraft(blankTip("sprint"));
      return;
    }

    const raceTip =
      tips.find(
        (tip) =>
          String(tip.round_id) === String(editRoundId) &&
          tip.user_id === editUserId &&
          tip.result_type === "race"
      ) || blankTip("race");

    const sprintTip =
      tips.find(
        (tip) =>
          String(tip.round_id) === String(editRoundId) &&
          tip.user_id === editUserId &&
          tip.result_type === "sprint"
      ) || blankTip("sprint");

    setEditRaceDraft(raceTip);
    setEditSprintDraft(sprintTip);
  }, [editRoundId, editUserId, tips]);

  return (
    <div style={styles.stack}>
      <section style={styles.adminBanner}>
        <strong>Admin Mode</strong>
        <p>Manual override is always available. Auto sync is optional.</p>
      </section>

      <section style={styles.adminCard}>
        <h2>Create User</h2>
        <input
          style={styles.input}
          placeholder="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Temporary password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(event) => setMakeAdmin(event.target.checked)}
          />
          Make admin
        </label>
        <button
          style={styles.adminButton}
          disabled={busy || !displayName || !email || !password}
          onClick={() =>
            createUser({
              display_name: displayName,
              email,
              password,
              is_admin: makeAdmin
            })
          }
        >
          Create user
        </button>
      </section>

      <section style={styles.adminCard}>
        <h2>Edit Any User Picks</h2>

        <select style={styles.input} value={editRoundId} onChange={(event) => setEditRoundId(event.target.value)}>
          <option value="">Select round</option>
          {rounds.map((round) => (
            <option key={round.id} value={round.id}>
              R{round.round_number} · {round.grand_prix}
            </option>
          ))}
        </select>

        <select style={styles.input} value={editUserId} onChange={(event) => setEditUserId(event.target.value)}>
          <option value="">Select user</option>
          {profiles.map((user) => (
            <option key={user.id} value={user.id}>
              {user.display_name || user.id}
            </option>
          ))}
        </select>

        {editRoundId && editUserId && (
          <>
            {editRound?.is_sprint && (
              <div style={styles.innerCard}>
                <h3>Sprint Picks</h3>
                <MiniTipForm draft={editSprintDraft} setDraft={setEditSprintDraft} drivers={drivers} />
                <button style={styles.adminButton} disabled={busy} onClick={() => saveTip("sprint", editSprintDraft, editUserId)}>
                  Save sprint picks
                </button>
              </div>
            )}

            <div style={styles.innerCard}>
              <h3>Grand Prix Picks</h3>
              <MiniTipForm draft={editRaceDraft} setDraft={setEditRaceDraft} drivers={drivers} />
              <button style={styles.adminButton} disabled={busy} onClick={() => saveTip("race", editRaceDraft, editUserId)}>
                Save grand prix picks
              </button>
            </div>
          </>
        )}
      </section>

      <section style={styles.adminCard}>
        <h2>Manual Result Override</h2>

        {activeRound?.is_sprint && (
          <div style={styles.innerCard}>
            <h3>Sprint Result</h3>
            <MiniTipForm draft={sprintResultDraft} setDraft={setSprintResultDraft} drivers={drivers} />
            <button style={styles.adminButton} disabled={busy} onClick={() => saveResult("sprint", sprintResultDraft)}>
              Save sprint result
            </button>
          </div>
        )}

        <div style={styles.innerCard}>
          <h3>Grand Prix Result</h3>
          <MiniTipForm draft={raceResultDraft} setDraft={setRaceResultDraft} drivers={drivers} />
          <button style={styles.adminButton} disabled={busy} onClick={() => saveResult("race", raceResultDraft)}>
            Save grand prix result
          </button>
        </div>
      </section>
    </div>
  );
}

function MiniTipForm({ draft, setDraft, drivers }) {
  return (
    <>
      {[1, 2, 3].map((place) => (
        <select
          key={place}
          style={styles.input}
          value={draft[`p${place}_driver_id`] || ""}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, [`p${place}_driver_id`]: event.target.value }))
          }
        >
          <option value="">P{place}</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} · {driver.team}
            </option>
          ))}
        </select>
      ))}

      <input
        style={styles.input}
        type="number"
        min="1"
        max="22"
        placeholder="Oscar finish"
        value={draft.oscar_finish ?? ""}
        onChange={(event) => setDraft((prev) => ({ ...prev, oscar_finish: event.target.value }))}
      />
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f1115",
    color: "white",
    padding: 14,
    fontFamily: "Arial, sans-serif"
  },
  wrap: {
    maxWidth: 980,
    margin: "0 auto"
  },
  authCard: {
    maxWidth: 420,
    margin: "80px auto",
    background: "#171a21",
    border: "1px solid #2a2f3a",
    borderRadius: 18,
    padding: 18
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16
  },
  title: {
    margin: 0,
    fontSize: 32
  },
  subtitle: {
    color: "#9ca3af",
    marginTop: 8
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },
  card: {
    background: "#171a21",
    border: "1px solid #2a2f3a",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16
  },
  adminCard: {
    background: "#1c1608",
    border: "1px solid rgba(245,158,11,0.45)",
    borderRadius: 18,
    padding: 18
  },
  adminBanner: {
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.4)",
    borderRadius: 18,
    padding: 18,
    color: "#fde68a"
  },
  innerCard: {
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 14,
    marginTop: 14
  },
  stack: {
    display: "grid",
    gap: 16
  },
  input: {
    width: "100%",
    padding: 13,
    borderRadius: 12,
    border: "1px solid #333",
    background: "#0f1115",
    color: "white",
    marginBottom: 12,
    boxSizing: "border-box",
    fontSize: 16
  },
  primary: {
    padding: "13px 18px",
    borderRadius: 12,
    border: "none",
    background: "white",
    color: "black",
    fontWeight: 800,
    cursor: "pointer"
  },
  secondary: {
    padding: "13px 18px",
    borderRadius: 12,
    border: "1px solid #4b5563",
    background: "#11151c",
    color: "white",
    fontWeight: 800,
    cursor: "pointer"
  },
  adminButton: {
    padding: "13px 18px",
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.45)",
    background: "#f59e0b",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer"
  },
  linkButton: {
    display: "block",
    marginTop: 14,
    background: "transparent",
    color: "#93c5fd",
    border: "none",
    cursor: "pointer"
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))",
    gap: 10,
    marginBottom: 16
  },
  tab: {
    padding: "14px 10px",
    borderRadius: 14,
    border: "1px solid #333",
    background: "#11151c",
    color: "white",
    fontWeight: 800,
    cursor: "pointer"
  },
  tabActive: {
    padding: "14px 10px",
    borderRadius: 14,
    border: "1px solid white",
    background: "white",
    color: "black",
    fontWeight: 900,
    cursor: "pointer"
  },
  adminTab: {
    padding: "14px 10px",
    borderRadius: 14,
    border: "1px solid rgba(245,158,11,0.45)",
    background: "rgba(245,158,11,0.14)",
    color: "#fde68a",
    fontWeight: 900,
    cursor: "pointer"
  },
  adminTabActive: {
    padding: "14px 10px",
    borderRadius: 14,
    border: "1px solid rgba(245,158,11,0.45)",
    background: "#f59e0b",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer"
  },
  countdown: {
    background: "#0f1115",
    border: "1px solid #2a2f3a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  countdownText: {
    display: "block",
    fontSize: 34,
    marginTop: 8
  },
  info: {
    background: "#11151c",
    border: "1px solid #2a2f3a",
    borderRadius: 16,
    padding: 14
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #232833",
    alignItems: "center"
  },
  muted: {
    color: "#9ca3af"
  },
  leaderRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid #232833"
  },
  pickCard: {
    borderTop: "1px solid #232833",
    padding: "14px 0"
  },
  pickHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10
  },
  pickRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "5px 0"
  },
  bonus: {
    color: "#fde68a",
    fontWeight: 800,
    marginTop: 6
  },
  tagGood: {
    border: "1px solid rgba(34,197,94,0.4)",
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    borderRadius: 999,
    padding: "3px 8px",
    fontWeight: 800
  },
  tagWarn: {
    border: "1px solid rgba(250,204,21,0.4)",
    background: "rgba(250,204,21,0.15)",
    color: "#fde047",
    borderRadius: 999,
    padding: "3px 8px",
    fontWeight: 800
  },
  tagBad: {
    border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.15)",
    color: "#fca5a5",
    borderRadius: 999,
    padding: "3px 8px",
    fontWeight: 800
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  },
  toast: {
    position: "fixed",
    right: 16,
    bottom: 16,
    minWidth: 260,
    maxWidth: 380,
    padding: "14px 16px",
    borderRadius: 16,
    zIndex: 9999,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    boxShadow: "0 12px 30px rgba(0,0,0,0.35)"
  },
  toastSuccess: {
    background: "#102418",
    border: "1px solid rgba(34,197,94,0.45)",
    color: "#bbf7d0"
  },
  toastError: {
    background: "#2a1115",
    border: "1px solid rgba(239,68,68,0.45)",
    color: "#fecaca"
  },
  toastInfo: {
    background: "#111827",
    border: "1px solid rgba(148,163,184,0.35)",
    color: "#e5e7eb"
  },
  toastClose: {
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: 22,
    cursor: "pointer"
  }
};
