import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ======================
// SCORING
// ======================

function scoreTip(tip, result, isSprint) {
  if (!tip || !result) return 0;

  const picks = [tip.p1_driver_id, tip.p2_driver_id, tip.p3_driver_id];
  const actual = [result.p1_driver_id, result.p2_driver_id, result.p3_driver_id];

  let points = 0;

  for (let i = 0; i < 3; i++) {
    if (picks[i] === actual[i]) {
      points += 2;
    } else if (actual.includes(picks[i])) {
      points += 1;
    }
  }

  const pickedAll = actual.every((d) => picks.includes(d));
  const exact = picks.every((d, i) => d === actual[i]);

  if (pickedAll) points += exact ? 3 : 1;

  return isSprint ? points / 2 : points;
}

// ======================
// AUTH
// ======================

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
    }
  }

  async function submit(e) {
    e.preventDefault();
    setMsg("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName }
        }
      });

      if (error) setMsg(error.message);
      else setMsg("Account created. Check email.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) setMsg(error.message);
    else onReady();
  }

  return (
    <div style={{ padding: 30, maxWidth: 400, margin: "auto" }}>
      <h1>🏁 F1 Tipping</h1>

      {!recoveryMode && (
        <>
          <button onClick={() => setMode("signin")}>Sign In</button>
          <button onClick={() => setMode("signup")}>Sign Up</button>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <input
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            )}

            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button type="submit">
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button onClick={forgotPassword}>Forgot password?</button>
        </>
      )}

      {recoveryMode && (
        <form onSubmit={updatePassword}>
          <input
            placeholder="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="submit">Update password</button>
        </form>
      )}

      <p>{msg}</p>
    </div>
  );
}

// ======================
// MAIN APP
// ======================

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) return <Auth onReady={() => window.location.reload()} />;

  return (
    <div style={{ padding: 30 }}>
      <h1>🏁 F1 Tipping</h1>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.reload();
        }}
      >
        Sign out
      </button>

      <p>Leaderboard / tips UI continues here.</p>
    </div>
  );
}