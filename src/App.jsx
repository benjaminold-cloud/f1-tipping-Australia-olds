import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const TEAM_META = {
  McLaren: {
    color: "#ff8000",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/mclaren-logo.png"
  },
  Ferrari: {
    color: "#dc0000",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/ferrari-logo.png"
  },
  Mercedes: {
    color: "#00d2be",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/mercedes-logo.png"
  },
  "Red Bull": {
    color: "#1e41ff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/red-bull-racing-logo.png"
  },
  "Red Bull Racing": {
    color: "#1e41ff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/red-bull-racing-logo.png"
  },
  "Aston Martin": {
    color: "#006f62",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/aston-martin-logo.png"
  },
  Alpine: {
    color: "#0090ff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/alpine-logo.png"
  },
  Williams: {
    color: "#005aff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/williams-logo.png"
  },
  Haas: {
    color: "#b6babd",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/haas-f1-team-logo.png"
  },
  RB: {
    color: "#6692ff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/rb-logo.png"
  },
  "Racing Bulls": {
    color: "#6692ff",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/rb-logo.png"
  },
  Sauber: {
    color: "#52e252",
    logo: "https://media.formula1.com/content/dam/fom-website/teams/2024/kick-sauber-logo.png"
  }
};

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

function scoreBreakdown(tip, result, isSprint) {
  if (!tip || !result) {
    return {
      pickScores: [0, 0, 0],
      pickStates: ["pending", "pending", "pending"],
      bonus: 0,
      total: 0
    };
  }

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

  const pickedAllTop3 =
    actual.length === 3 &&
    actual.every((driverId) => picks.includes(driverId));

  const exactOrder =
    picks.length === 3 &&
    picks.every((driverId, idx) => driverId === actual[idx]);

  const rawBonus = pickedAllTop3 ? (exactOrder ? 3 : 1) : 0;
  const multiplier = isSprint ? 0.5 : 1;

  const pickScores = rawPickScores.map((p) => p * multiplier);
  const bonus = rawBonus * multiplier;
  const total = pickScores.reduce((sum, p) => sum + p, 0) + bonus;

  return {
    pickScores,
    pickStates,
    bonus,
    total
  };
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

function blankResult(resultType) {
  return {
    result_type: resultType,
    p1_driver_id: "",
    p2_driver_id: "",
    p3_driver_id: "",
    oscar_finish: ""
  };
}

function getResultStatus(result) {
  if (!result) return { label: "Pending", tone: "pending" };
  if ((result.source || "").toLowerCase() === "manual") {
    return { label: "Manual", tone: "manual" };
  }
  return { label: "Synced", tone: "synced" };
}

function TeamLogo({ team, size = 18 }) {
  const meta = TEAM_META[team];
  if (!meta?.logo) return null;

  return (
    <img
      src={meta.logo}
      alt={team}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: 4,
        background: "white",
        padding: 2
      }}
    />
  );
}

function DriverLabel({ driverId, driverMap, size = 18 }) {
  const driver = driverMap.get(driverId);
  if (!driver) return <span>{driverId || "-"}</span>;

  return (
    <span style={styles.inlineFlex}>
      <TeamLogo team={driver.team} size={size} />
      <span>{driver.name}</span>
    </span>
  );
}

function ResultBadge({ result }) {
  const status = getResultStatus(result);

  const style =
    status.tone === "synced"
      ? styles.badgeSynced
      : status.tone === "manual"
      ? styles.badgeManual
      : styles.badgePending;

  return <span style={style}>{status.label}</span>;
}

function PickScoreTag({ state, points }) {
  if (state === "pending") return null;

  const style =
    state === "exact"
      ? styles.pickExact
      : state === "partial"
      ? styles.pickPartial
      : styles.pickMiss;

  const icon = state === "exact" ? "✓" : state === "partial" ? "•" : "✕";
  const label = Number.isInteger(points) ? points : points.toFixed(1);

  return (
    <span style={style}>
      {icon} +{label}
    </span>
  );
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

function ResultEntryForm({
  title,
  draft,
  setDraft,
  drivers,
  onSave,
  saveLabel,
  adminMode = false
}) {
  return (
    <div style={adminMode ? styles.adminCard : styles.subCard}>
      <h3 style={styles.sectionTitle}>{title}</h3>

      {[1, 2, 3].map((n) => (
        <select
          key={n}
          style={styles.input}
          value={draft[`p${n}_driver_id`] || ""}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              [`p${n}_driver_id`]: e.target.value
            }))
          }
        >
          <option value="">Set P{n}</option>
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
        placeholder="Oscar finish"
        value={draft.oscar_finish ?? ""}
        onChange={(e) =>
          setDraft((prev) => ({
            ...prev,
            oscar_finish: e.target.value
          }))
        }
      />

      <button style={styles.adminButton} onClick={onSave}>
        {saveLabel}
      </button>
    </div>
  );
}

function ResultCard({ title, result, driverMap }) {
  return (
    <div style={styles.subCard}>
      <div style={styles.cardHeaderRow}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <ResultBadge result={result} />
      </div>

      {!result ? (
        <p style={styles.mutedText}>No result loaded yet.</p>
      ) : (
        <>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>P1</span>
            <DriverLabel driverId={result.p1_driver_id} driverMap={driverMap} />
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>P2</span>
            <DriverLabel driverId={result.p2_driver_id} driverMap={driverMap} />
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>P3</span>
            <DriverLabel driverId={result.p3_driver_id} driverMap={driverMap} />
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Oscar finish</span>
            <span>{result.oscar_finish ?? "DNF / N/A"}</span>
          </div>
          {"source" in result ? (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Source</span>
              <span>{result.source || "unknown"}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function TipsCard({ title, tips, profilesById, driverMap, result, isSprint }) {
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

      {tips.map((tip) => {
        const breakdown = scoreBreakdown(tip, result, isSprint);

        return (
          <div key={`${tip.user_id}-${tip.result_type}`} style={styles.tipEntry}>
            <div style={styles.tipHeaderRow}>
              <div style={styles.tipName}>{profilesById.get(tip.user_id) || "Player"}</div>
              {result ? <div style={styles.tipTotal}>Total: {breakdown.total}</div> : null}
            </div>

            <div style={styles.tipLineRow}>
              <div style={styles.tipLine}>
                <span style={styles.tipKey}>P1:</span>{" "}
                <DriverLabel driverId={tip.p1_driver_id} driverMap={driverMap} size={16} />
              </div>
              {result ? (
                <PickScoreTag
                  state={breakdown.pickStates[0]}
                  points={breakdown.pickScores[0]}
                />
              ) : null}
            </div>

            <div style={styles.tipLineRow}>
              <div style={styles.tipLine}>
                <span style={styles.tipKey}>P2:</span>{" "}
                <DriverLabel driverId={tip.p2_driver_id} driverMap={driverMap} size={16} />
              </div>
              {result ? (
                <PickScoreTag
                  state={breakdown.pickStates[1]}
                  points={breakdown.pickScores[1]}
                />
              ) : null}
            </div>

            <div style={styles.tipLineRow}>
              <div style={styles.tipLine}>
                <span style={styles.tipKey}>P3:</span>{" "}
                <DriverLabel driverId={tip.p3_driver_id} driverMap={driverMap} size={16} />
              </div>
              {result ? (
                <PickScoreTag
                  state={breakdown.pickStates[2]}
                  points={breakdown.pickScores[2]}
                />
              ) : null}
            </div>

            <div style={styles.tipLine}>
              <span style={styles.tipKey}>Oscar:</span> {tip.oscar_finish ?? "-"}
            </div>

            {result && breakdown.bonus > 0 ? (
              <div style={styles.bonusLine}>Bonus: +{breakdown.bonus}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ProfilePanel({ session, profile, setMsg, reloadData }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(session?.user?.email || "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setDisplayName(profile?.display_name || "");
  }, [profile]);

  useEffect(() => {
    setEmail(session?.user?.email || "");
  }, [session]);

  async function saveProfile() {
    try {
      const updates = [];
      let authChanged = false;

      if (displayName !== (profile?.display_name || "")) {
        const { error } = await supabase
          .from("profiles")
          .update({ display_name: displayName })
          .eq("id", session.user.id);

        if (error) throw error;
        updates.push("name");
      }

      if (email && email !== (session?.user?.email || "")) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        updates.push("email");
        authChanged = true;
      }

      if (password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        updates.push("password");
        authChanged = true;
        setPassword("");
      }

      setMsg(
        updates.length
          ? `Updated ${updates.join(", ")}`
          : "No profile changes made"
      );

      await reloadData();

      if (authChanged) {
        setMsg("Profile updated. If you changed email, check your inbox for confirmation.");
      }
    } catch (err) {
      setMsg(err?.message || "Failed to update profile");
    }
  }

  return (
    <div style={styles.subCard}>
      <h3 style={styles.sectionTitle}>Profile</h3>

      <input
        style={styles.input}
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <input
        style={styles.input}
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        style={styles.input}
        placeholder="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button style={styles.primary} onClick={saveProfile}>
        Save profile
      </button>
    </div>
  );
}

function AdminCreateUserPanel({ setMsg, reloadData }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("OldsF1Start!");
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const generatedEmail =
      displayName.trim().length > 0
        ? `${displayName.trim().toLowerCase().replace(/\s+/g, ".")}@oldsf1.test`
        : "";

    if (!email || email.endsWith("@oldsf1.test")) {
      setEmail(generatedEmail);
    }
  }, [displayName]);

  async function createUser() {
    try {
      setSaving(true);

      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          display_name: displayName,
          email,
          password,
          is_admin: isAdmin
        }
      });

      if (error) {
        throw new Error(error.message || "Failed to create user");
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Failed to create user");
      }

      setMsg(`Created user: ${data.display_name} (${data.email})`);
      setDisplayName("");
      setEmail("");
      setPassword("OldsF1Start!");
      setIsAdmin(false);
      await reloadData();
    } catch (err) {
      setMsg(err?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.adminCard}>
      <h3 style={styles.sectionTitle}>Create User</h3>

      <input
        style={styles.input}
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <input
        style={styles.input}
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        style={styles.input}
        placeholder="Temporary password"
        type="text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
        />
        <span>Make admin</span>
      </label>

      <button style={styles.adminButton} onClick={createUser} disabled={saving}>
        {saving ? "Creating..." : "Create user"}
      </button>
    </div>
  );
}

function AdminUserTipPanel({
  rounds,
  profiles,
  drivers,
  setMsg,
  reloadData
}) {
  const [roundId, setRoundId] = useState("");
  const [userId, setUserId] = useState("");
  const [resultType, setResultType] = useState("race");
  const [draft, setDraft] = useState(blankTip("race"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(blankTip(resultType));
  }, [resultType]);

  async function saveTipForUser() {
    try {
      setSaving(true);

      if (!roundId || !userId) {
        throw new Error("Select a round and player");
      }

      const payload = {
        round_id: Number(roundId),
        user_id: userId,
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

      if (error) throw error;

      setMsg("Admin tip saved");
      await reloadData();
    } catch (err) {
      setMsg(err?.message || "Failed to save tip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.adminCard}>
      <h3 style={styles.sectionTitle}>Enter Picks For Any User</h3>

      <select
        style={styles.input}
        value={roundId}
        onChange={(e) => setRoundId(e.target.value)}
      >
        <option value="">Select round</option>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            R{r.round_number} · {r.grand_prix} {r.is_sprint ? "· Sprint" : ""}
          </option>
        ))}
      </select>

      <select
        style={styles.input}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      >
        <option value="">Select player</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name || "Player"}
          </option>
        ))}
      </select>

      <select
        style={styles.input}
        value={resultType}
        onChange={(e) => setResultType(e.target.value)}
      >
        <option value="race">Grand Prix</option>
        <option value="sprint">Sprint</option>
      </select>

      {[1, 2, 3].map((n) => (
        <select
          key={n}
          style={styles.input}
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
        placeholder="Oscar finish"
        value={draft.oscar_finish ?? ""}
        onChange={(e) =>
          setDraft((prev) => ({
            ...prev,
            oscar_finish: e.target.value
          }))
        }
      />

      <button style={styles.adminButton} onClick={saveTipForUser} disabled={saving}>
        {saving ? "Saving..." : "Save user tip"}
      </button>
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
  const [sprintResultDraft, setSprintResultDraft] = useState(blankResult("sprint"));
  const [raceResultDraft, setRaceResultDraft] = useState(blankResult("race"));
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState("tips");
  const [syncing, setSyncing] = useState(false);

  async function loadAll(userIdOverride) {
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

    const userId = userIdOverride || session?.user?.id;
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
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

    const sprintResult = results.find(
      (r) => r.round_id === activeRound.id && r.result_type === "sprint"
    );
    const raceResult = results.find(
      (r) => r.round_id === activeRound.id && r.result_type === "race"
    );

    setSprintDraft(mySprintTip || blankTip("sprint"));
    setRaceDraft(myRaceTip || blankTip("race"));
    setSprintResultDraft(sprintResult || blankResult("sprint"));
    setRaceResultDraft(raceResult || blankResult("race"));
  }, [activeRound, tips, results, session]);

  const roundStatus = useMemo(
    () => getRoundStatus(activeRound, now),
    [activeRound, now]
  );

  const driverMap = useMemo(() => {
    return new Map((drivers || []).map((d) => [d.id, d]));
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
          total: 0,
          favoriteTeam: null
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

      if (!row.favoriteTeam && tip.p1_driver_id) {
        row.favoriteTeam = driverMap.get(tip.p1_driver_id)?.team || null;
      }
    });

    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }, [tips, results, profilesById, driverMap]);

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

  async function saveResult(resultType, draft) {
    if (!profile?.is_admin || !activeRound) return;

    const payload = {
      round_id: activeRound.id,
      result_type: resultType,
      p1_driver_id: draft.p1_driver_id || null,
      p2_driver_id: draft.p2_driver_id || null,
      p3_driver_id: draft.p3_driver_id || null,
      oscar_finish: draft.oscar_finish ? Number(draft.oscar_finish) : null,
      source: "manual"
    };

    const { error } = await supabase
      .from("results")
      .upsert(payload, { onConflict: "round_id,result_type" });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg(`${resultType === "sprint" ? "Sprint" : "Grand Prix"} result saved`);

    if (session?.user?.id) {
      await loadAll(session.user.id);
    }
  }

  async function syncResultsNow() {
    if (!profile?.is_admin) return;

    try {
      setSyncing(true);
      setMsg("Syncing results...");

      const { data, error } = await supabase.functions.invoke("sync-results", {
        body: {}
      });

      if (error) {
        throw new Error(error.message || "Sync failed");
      }

      setMsg(
        data?.actions?.length
          ? `Sync complete: ${data.actions.join(", ")}`
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

        <div style={styles.tabRowSix}>
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
          <button
            type="button"
            style={activeTab === "profile" ? styles.activeTabButton : styles.tabButton}
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
          {profile?.is_admin ? (
            <button
              type="button"
              style={activeTab === "admin" ? styles.adminTabActive : styles.adminTabButton}
              onClick={() => setActiveTab("admin")}
            >
              Admin
            </button>
          ) : null}
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
              leaderboard.map((row, i) => {
                const accent = TEAM_META[row.favoriteTeam]?.color || "#2a2f3a";
                return (
                  <div
                    key={row.user_id}
                    style={{
                      ...styles.leaderRow,
                      borderLeft: `4px solid ${accent}`,
                      paddingLeft: 12
                    }}
                  >
                    <span style={styles.inlineFlex}>
                      <span>#{i + 1} {row.name}</span>
                      {row.favoriteTeam ? <TeamLogo team={row.favoriteTeam} size={18} /> : null}
                    </span>
                    <strong>{row.total}</strong>
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {activeTab === "results" ? (
          <div style={styles.stack}>
            {activeRound?.is_sprint ? (
              <ResultCard
                title="Sprint Result"
                result={selectedSprintResult}
                driverMap={driverMap}
              />
            ) : null}

            <ResultCard
              title="Grand Prix Result"
              result={selectedRaceResult}
              driverMap={driverMap}
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
                driverMap={driverMap}
                result={selectedSprintResult}
                isSprint={true}
              />
            ) : null}

            <TipsCard
              title="Grand Prix Tips"
              tips={selectedRaceTips}
              profilesById={profilesById}
              driverMap={driverMap}
              result={selectedRaceResult}
              isSprint={false}
            />
          </div>
        ) : null}

        {activeTab === "profile" ? (
          <ProfilePanel
            session={session}
            profile={profile}
            setMsg={setMsg}
            reloadData={() => loadAll(session.user.id)}
          />
        ) : null}

        {activeTab === "admin" && profile?.is_admin ? (
          <div style={styles.stack}>
            <div style={styles.adminBanner}>
              <div style={styles.adminBadge}>Admin Mode</div>
              <div style={styles.adminBannerText}>
                Admin tools are visible only to admins. Regular users won’t see this section.
              </div>
            </div>

            <AdminCreateUserPanel
              setMsg={setMsg}
              reloadData={() => loadAll(session.user.id)}
            />

            <AdminUserTipPanel
              rounds={rounds}
              profiles={profiles}
              drivers={drivers}
              setMsg={setMsg}
              reloadData={() => loadAll(session.user.id)}
            />

            {activeRound?.is_sprint ? (
              <ResultEntryForm
                title="Manual Sprint Result"
                draft={sprintResultDraft}
                setDraft={setSprintResultDraft}
                drivers={drivers}
                onSave={() => saveResult("sprint", sprintResultDraft)}
                saveLabel="Save sprint result"
                adminMode={true}
              />
            ) : null}

            <ResultEntryForm
              title="Manual Grand Prix Result"
              draft={raceResultDraft}
              setDraft={setRaceResultDraft}
              drivers={drivers}
              onSave={() => saveResult("race", raceResultDraft)}
              saveLabel="Save grand prix result"
              adminMode={true}
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
  adminCard: {
    background: "#18130a",
    border: "1px solid rgba(245, 158, 11, 0.45)",
    borderRadius: 14,
    padding: 16,
    boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.08)"
  },
  adminBanner: {
    background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(217,119,6,0.12))",
    border: "1px solid rgba(245,158,11,0.35)",
    borderRadius: 16,
    padding: 16
  },
  adminBadge: {
    display: "inline-block",
    background: "rgba(245,158,11,0.18)",
    color: "#fcd34d",
    border: "1px solid rgba(245,158,11,0.35)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 10
  },
  adminBannerText: {
    color: "#f3f4f6",
    fontSize: 14
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12
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
  adminButton: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(245,158,11,0.35)",
    background: "#f59e0b",
    color: "#111827",
    fontWeight: 800,
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
  tabRowTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 16
  },
  tabRowSix: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
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
  adminTabButton: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(245,158,11,0.35)",
    background: "rgba(245,158,11,0.12)",
    color: "#fcd34d",
    cursor: "pointer",
    fontWeight: 700
  },
  adminTabActive: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(245,158,11,0.45)",
    background: "#f59e0b",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 800
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
    alignItems: "center",
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
    alignItems: "center",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #232833"
  },
  infoLabel: {
    color: "#9ca3af"
  },
  tipEntry: {
    padding: "12px 0",
    borderBottom: "1px solid #232833"
  },
  tipHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    flexWrap: "wrap"
  },
  tipName: {
    fontWeight: 700
  },
  tipTotal: {
    fontWeight: 700,
    color: "#f3f4f6"
  },
  tipLineRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
    flexWrap: "wrap"
  },
  tipLine: {
    color: "#d1d5db",
    fontSize: 14,
    marginBottom: 4
  },
  tipKey: {
    color: "#9ca3af"
  },
  bonusLine: {
    marginTop: 6,
    fontSize: 13,
    color: "#fcd34d",
    fontWeight: 700
  },
  mutedText: {
    color: "#9ca3af",
    margin: 0
  },
  inlineFlex: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  badgeSynced: {
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.35)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700
  },
  badgeManual: {
    background: "rgba(245,158,11,0.15)",
    color: "#fcd34d",
    border: "1px solid rgba(245,158,11,0.35)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700
  },
  badgePending: {
    background: "rgba(148,163,184,0.12)",
    color: "#cbd5e1",
    border: "1px solid rgba(148,163,184,0.3)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700
  },
  pickExact: {
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    border: "1px solid rgba(34,197,94,0.35)",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700
  },
  pickPartial: {
    background: "rgba(250,204,21,0.15)",
    color: "#fde047",
    border: "1px solid rgba(250,204,21,0.35)",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700
  },
  pickMiss: {
    background: "rgba(239,68,68,0.15)",
    color: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  }
};