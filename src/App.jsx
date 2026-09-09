import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Paperclip,
  Mic,
  Check,
  CheckCheck,
  Camera,
  Square,
  X,
  Menu,
  Pencil,
  Trash2,
  Reply,
  Plus,
  Users,
  Link2,
  HardDrive,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/*  DATA MODEL (mirrors the rooms/room_participants migration)        */
/*                                                                     */
/*  User    { id, nickname, avatarUrl }             -> "profiles"     */
/*  Room    { id, name, isGroup, otherParticipants[] } -> "rooms" +    */
/*            "room_participants"                                     */
/*  Message { id, text, senderName, timestamp, roomId,                 */
/*            imageUrl?, videoUrl?, audioUrl?,                        */
/*            read, delivered, edited, reactions[] } -> "messages"    */
/* ------------------------------------------------------------------ */

const ROSE_GOLD = "#B76E79";
const BLUSH_BG = "#FFF0F5";
const HEADER_PINK = "#FFB6C1";
const BUBBLE_WHITE = "#FFFFFF";
const TEXT_DEEP = "#6B4A57";
const TEXT_SOFT = "#A8828F";
const READ_PINK = "#F49AC2";
const REACTIONS = ["💖", "✨", "😭"]; // quick-tap favorites, shown first
const EMOJI_GRID = [
  "💖", "✨", "😭", "😍", "🥹", "😂", "🤣", "🙈",
  "🥺", "😘", "🫶", "💅", "👑", "🎀", "🌸", "🌷",
  "🍒", "🧁", "🍓", "🦋", "⭐️", "🔥", "💯", "🙌",
  "👏", "😅", "😊", "🥰", "😌", "🤍", "💗", "💞",
];

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
};

const rowToMessage = (row) => ({
  id: row.id,
  text: row.text || "",
  senderName: row.sender_name,
  senderId: row.sender_id,
  roomId: row.room_id,
  timestamp: row.created_at,
  imageUrl: row.image_url || undefined,
  videoUrl: row.video_url || undefined,
  audioUrl: row.audio_url || undefined,
  read: row.read,
  delivered: row.delivered,
  edited: !!row.edited,
  reactions: row.reactions || [],
  replyToId: row.reply_to_id || undefined,
  replyToText: row.reply_to_text || undefined,
  replyToSender: row.reply_to_sender || undefined,
});

// Shapes a `rooms` row (fetched with a nested room_participants->profiles
// select) into { id, name, isGroup, otherParticipants[] } — "other" meaning
// everyone in the room except me, which is all the UI ever needs per-room.
const rowToRoom = (row, myId) => ({
  id: row.id,
  name: row.name,
  isGroup: row.is_group,
  createdBy: row.created_by,
  createdAt: row.created_at,
  otherParticipants: (row.room_participants || [])
    .map((rp) => rp.profiles)
    .filter((p) => p && p.id !== myId),
});

export default function App() {
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null); // null | "missing" | "error"
  const [authEmail, setAuthEmail] = useState("");
  const [authStep, setAuthStep] = useState("email"); // "email" | "code"
  const [authError, setAuthError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [capReached, setCapReached] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(""); // transient toast-ish note about invite-link join

  // auth bootstrap — wait for the initial check to actually finish before
  // deciding whether to show the login screen, so a refresh never flashes
  // to "logged out" while getSession() is still resolving from localStorage.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setProfile(data);
          return;
        }
        // PGRST116 = .single() found zero rows — a real "this account has
        // no profile" case (e.g. it was deleted), not a network hiccup.
        // Anything else is a genuine fetch failure. Either way, surface it
        // instead of leaving "Loading your profile…" spinning forever.
        setProfileError(error?.code === "PGRST116" ? "missing" : "error");
      });
  }, [session]);

  // Invite-link on-ramp: if someone arrives via a shared room link
  // (?room=<uuid>), drop them into that room the moment they're signed in.
  // Room UUIDs are unguessable, so knowing one *is* the invite — the same
  // "anyone with the link" model as a shared Google Doc.
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const inviteRoomId = params.get("room");
    if (!inviteRoomId) return;

    supabase
      .from("room_participants")
      .insert({ room_id: inviteRoomId, user_id: session.user.id })
      .then(({ error }) => {
        // 23505 = already a participant — not an error from the user's
        // point of view, just means they'd already joined before.
        if (error && error.code !== "23505") {
          setInviteStatus("That invite link didn't work — the chat may not exist anymore.");
        } else {
          setInviteStatus("Joined the chat! 💌");
        }
        // Clean the ?room= param off the URL either way, so a refresh
        // doesn't re-trigger this and the link doesn't linger visibly.
        window.history.replaceState({}, "", window.location.pathname);
        setTimeout(() => setInviteStatus(""), 3000);
      });
  }, [session]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setAuthError("");

    // Check capacity BEFORE attempting signup, for a friendlier experience
    // than "try, then fail" — get_capacity_status() is callable even by
    // signed-out visitors. This only ever blocks genuinely NEW emails;
    // existing members' rows already exist so this check doesn't affect
    // them (and the DB-level cap only fires on brand-new auth.users rows).
    const { data: capacity } = await supabase.rpc("get_capacity_status");
    if (capacity?.is_full) {
      setCapReached(true);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ email: authEmail });
    if (error) {
      // Belt-and-suspenders: if capacity filled between the check above
      // and this call, the DB trigger itself rejects the new auth.users
      // row and Supabase surfaces it as a generic "Database error" —
      // catch that specific case and show the real reason instead.
      if (/signup_cap_reached|Database error saving new user/i.test(error.message || "")) {
        setCapReached(true);
        return;
      }
      setAuthError(error.message || "Something went wrong sending the code. Try again.");
      return;
    }
    setAuthStep("code");
    setResendCooldown(30);
  };

  const verifyCode = async (code) => {
    setAuthError("");
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: authEmail,
      token: code,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setAuthError(error.message || "That code didn't work — check it and try again.");
      return false;
    }
    return true; // onAuthStateChange picks up the new session from here
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  if (!sessionChecked) return <CenteredNote text="Loading…" />;

  if (capReached) return <CapacityFullScreen />;

  if (!session) {
    return (
      <AuthScreen
        email={authEmail}
        setEmail={setAuthEmail}
        step={authStep}
        onSendCode={sendCode}
        onVerifyCode={verifyCode}
        verifying={verifying}
        error={authError}
        clearError={() => setAuthError("")}
        resendCooldown={resendCooldown}
        onEditEmail={() => {
          setAuthStep("email");
          setAuthError("");
        }}
      />
    );
  }

  if (!profile) {
    if (profileError) {
      return (
        <ProfileMissingScreen
          reason={profileError}
          onSignOut={() => supabase.auth.signOut()}
        />
      );
    }
    return <CenteredNote text="Loading your profile…" />;
  }

  return <ChatApp session={session} profile={profile} setProfile={setProfile} inviteStatus={inviteStatus} />;
}

// Shown when the 100-account circle is full — a deliberate, friendly wall
// rather than a confusing error, with a direct way to reach the creator.
function CapacityFullScreen() {
  return (
    <div
      style={{
        minHeight: 520,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${BLUSH_BG} 0%, #FFE4EC 100%)`,
        fontFamily: "'Quicksand','Poppins',sans-serif",
        borderRadius: 20,
        border: `1px solid ${HEADER_PINK}`,
        overflow: "hidden",
        padding: 24,
      }}
    >
      <style>{authStyles}</style>
      <div className="auth-blob" style={{ width: 180, height: 180, background: "#FFC1CC", top: -50, left: -40 }} />
      <div
        className="auth-blob"
        style={{ width: 220, height: 220, background: "#E8B4BE", bottom: -70, right: -60, animationDelay: "1.5s" }}
      />
      <div
        className="auth-card"
        style={{
          position: "relative",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
          padding: 34,
          borderRadius: 20,
          boxShadow: "0 14px 40px rgba(183,110,121,0.2)",
          width: 320,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34, marginBottom: 10 }}>💌</div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: "italic",
            fontSize: 23,
            color: ROSE_GOLD,
            marginBottom: 10,
          }}
        >
          our little chat is full for now
        </div>
        <p style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.6, marginBottom: 22 }}>
          This is a small, closed circle and we've reached our limit of members. Nothing's
          wrong — we just want to keep this space cozy for the people already here.
        </p>
        <a
          href="mailto:yourgaljojo@gmail.com?subject=Pastel%20Chat%20-%20request%20to%20join"
          className="auth-btn"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            borderRadius: 999,
            border: "none",
            background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
            letterSpacing: 0.3,
          }}
        >
          Email the creator ✨
        </a>
      </div>
    </div>
  );
}

// Shown when someone is authenticated (a valid session exists) but no
// matching profiles row can be found — e.g. the account was removed, or
// something genuinely went wrong fetching it. Either way, this is the
// deliberate "here's what happened, here's your way out" state, instead
// of hanging on "Loading your profile…" forever with no explanation.
function ProfileMissingScreen({ reason, onSignOut }) {
  const isMissing = reason === "missing";
  return (
    <div
      style={{
        minHeight: 520,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${BLUSH_BG} 0%, #FFE4EC 100%)`,
        fontFamily: "'Quicksand','Poppins',sans-serif",
        borderRadius: 20,
        border: `1px solid ${HEADER_PINK}`,
        overflow: "hidden",
        padding: 24,
      }}
    >
      <style>{authStyles}</style>
      <div className="auth-blob" style={{ width: 180, height: 180, background: "#FFC1CC", top: -50, left: -40 }} />
      <div
        className="auth-blob"
        style={{ width: 220, height: 220, background: "#E8B4BE", bottom: -70, right: -60, animationDelay: "1.5s" }}
      />
      <div
        className="auth-card"
        style={{
          position: "relative",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
          padding: 34,
          borderRadius: 20,
          boxShadow: "0 14px 40px rgba(183,110,121,0.2)",
          width: 320,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34, marginBottom: 10 }}>{isMissing ? "🌙" : "💗"}</div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: "italic",
            fontSize: 21,
            color: ROSE_GOLD,
            marginBottom: 10,
          }}
        >
          {isMissing ? "this account no longer exists" : "something went wrong"}
        </div>
        <p style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.6, marginBottom: 22 }}>
          {isMissing
            ? "This login was removed. If that's unexpected, reach out to the creator — otherwise you can sign in with a different email."
            : "We couldn't load your profile just now. Signing out and back in usually fixes this."}
        </p>
        <button
          onClick={onSignOut}
          className="auth-btn"
          style={{
            padding: "12px 24px",
            borderRadius: 999,
            border: "none",
            background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 0.3,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

const authStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');
  @keyframes floatBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-18px) scale(1.06); } }
  @keyframes cardIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes shakeX { 10%,90% { transform: translateX(-1px); } 20%,80% { transform: translateX(2px); } 30%,50%,70% { transform: translateX(-4px); } 40%,60% { transform: translateX(4px); } }
  @keyframes popIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  .auth-card { animation: cardIn .4s ease; }
  .auth-shake { animation: shakeX .45s ease; }
  .auth-blob { position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.55; animation: floatBlob 7s ease-in-out infinite; }
  .otp-box {
    width: 46px; height: 56px; text-align: center; font-size: 22px; font-weight: 700;
    border-radius: 14px; border: 1.5px solid #FFB6C1; outline: none; color: #6B4A57;
    background: #fff; transition: border-color .18s ease, box-shadow .18s ease, transform .12s ease;
  }
  .otp-box:focus { border-color: #B76E79; box-shadow: 0 0 0 4px rgba(183,110,121,0.15); transform: translateY(-1px); }
  .auth-btn { transition: transform .15s ease, box-shadow .15s ease; }
  .auth-btn:active { transform: scale(0.97); }
  .auth-btn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(183,110,121,0.3); }
`;

function AuthScreen({
  email,
  setEmail,
  step,
  onSendCode,
  onVerifyCode,
  verifying,
  error,
  clearError,
  resendCooldown,
  onEditEmail,
}) {
  return (
    <div
      style={{
        minHeight: 520,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${BLUSH_BG} 0%, #FFE4EC 100%)`,
        fontFamily: "'Quicksand','Poppins',sans-serif",
        borderRadius: 20,
        border: `1px solid ${HEADER_PINK}`,
        overflow: "hidden",
      }}
    >
      <style>{authStyles}</style>

      {/* soft floating background blobs for depth */}
      <div className="auth-blob" style={{ width: 180, height: 180, background: "#FFC1CC", top: -50, left: -40 }} />
      <div className="auth-blob" style={{ width: 220, height: 220, background: "#E8B4BE", bottom: -70, right: -60, animationDelay: "1.5s" }} />
      <div className="auth-blob" style={{ width: 120, height: 120, background: "#FFD9E4", top: "40%", right: 10, animationDelay: "3s" }} />

      <div
        className="auth-card"
        style={{
          position: "relative",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
          padding: 34,
          borderRadius: 20,
          boxShadow: "0 14px 40px rgba(183,110,121,0.2)",
          width: 320,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: "italic",
            fontSize: 25,
            color: ROSE_GOLD,
            marginBottom: 6,
          }}
        >
          our little chat
        </div>
        <div style={{ fontSize: 12, color: TEXT_SOFT, marginBottom: 22 }}>
          {step === "email" ? "Sign in to keep chatting 💌" : "Enter the code we just sent you"}
        </div>

        {step === "email" ? (
          <EmailStep email={email} setEmail={setEmail} onSubmit={onSendCode} error={error} />
        ) : (
          <CodeStep
            email={email}
            onVerify={onVerifyCode}
            onResend={onSendCode}
            verifying={verifying}
            error={error}
            clearError={clearError}
            resendCooldown={resendCooldown}
            onEditEmail={onEditEmail}
          />
        )}
      </div>
    </div>
  );
}

function EmailStep({ email, setEmail, onSubmit, error }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <form onSubmit={onSubmit}>
      <input
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 999,
          border: `1.5px solid ${error ? "#E24B7A" : HEADER_PINK}`,
          marginBottom: error ? 8 : 16,
          outline: "none",
          fontSize: 14,
          boxSizing: "border-box",
          fontFamily: "inherit",
          transition: "border-color .18s ease, box-shadow .18s ease",
        }}
        onFocus={(e) => (e.target.style.boxShadow = "0 0 0 4px rgba(183,110,121,0.15)")}
        onBlur={(e) => (e.target.style.boxShadow = "none")}
      />
      {error && (
        <p style={{ color: "#E24B7A", fontSize: 12, marginBottom: 12, textAlign: "left" }}>{error}</p>
      )}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 16,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 2, accentColor: ROSE_GOLD, cursor: "pointer", flexShrink: 0 }}
        />
        <span style={{ fontSize: 11.5, color: TEXT_SOFT, lineHeight: 1.5 }}>
          By signing in, you agree to our storage allocation rules and privacy terms.{" "}
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ROSE_GOLD, textDecoration: "underline" }}
          >
            Read our Full Terms &amp; Conditions.
          </a>
        </span>
      </label>
      <button
        type="submit"
        className="auth-btn"
        disabled={!agreed}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 999,
          border: "none",
          background: agreed ? `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)` : "#F0DCE2",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          cursor: agreed ? "pointer" : "not-allowed",
          letterSpacing: 0.3,
        }}
      >
        Send my code ✨
      </button>
    </form>
  );
}

function CodeStep({ email, onVerify, onResend, verifying, error, clearError, resendCooldown, onEditEmail }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const attemptVerify = async (fullCode) => {
    const ok = await onVerify(fullCode);
    if (!ok) {
      triggerShake();
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  const handleChange = (i, val) => {
    if (error) clearError();
    const v = val.replace(/[^0-9]/g, "");
    if (!v) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    next[i] = v[v.length - 1];
    setDigits(next);
    if (i < 5) inputRefs.current[i + 1]?.focus();
    if (next.every((d) => d !== "")) attemptVerify(next.join(""));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const lastFilled = Math.min(text.length, 6) - 1;
    inputRefs.current[Math.min(lastFilled + 1, 5)]?.focus();
    if (text.length === 6) attemptVerify(text);
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: TEXT_SOFT, marginBottom: 4 }}>Code sent to</p>
      <p style={{ fontSize: 13, color: ROSE_GOLD, fontWeight: 700, marginBottom: 18 }}>{email}</p>

      <div
        className={shake ? "auth-shake" : ""}
        style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}
        onPaste={handlePaste}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            className="otp-box"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            disabled={verifying}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
          />
        ))}
      </div>

      {verifying && <p style={{ fontSize: 12, color: TEXT_SOFT, marginBottom: 10 }}>Verifying…</p>}
      {error && (
        <p style={{ color: "#E24B7A", fontSize: 12, marginBottom: 10, animation: "popIn .2s ease" }}>
          {error}
        </p>
      )}

      <button
        onClick={onResend}
        disabled={resendCooldown > 0}
        className="auth-btn"
        style={{
          width: "100%",
          padding: "9px 0",
          borderRadius: 999,
          border: `1px solid ${HEADER_PINK}`,
          background: resendCooldown > 0 ? "#FDF1F5" : "#fff",
          color: resendCooldown > 0 ? TEXT_SOFT : ROSE_GOLD,
          fontWeight: 600,
          fontSize: 13,
          cursor: resendCooldown > 0 ? "default" : "pointer",
          marginBottom: 8,
        }}
      >
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
      </button>
      <button
        onClick={onEditEmail}
        style={{
          width: "100%",
          padding: "6px 0",
          border: "none",
          background: "transparent",
          color: TEXT_SOFT,
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Wrong email? Go back
      </button>
    </div>
  );
}

function CenteredNote({ text }) {
  return (
    <div
      style={{
        minHeight: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUSH_BG,
        color: TEXT_SOFT,
        fontFamily: "'Quicksand',sans-serif",
      }}
    >
      {text}
    </div>
  );
}


const chatStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');
  .pc-scroll::-webkit-scrollbar { width: 6px; }
  .pc-scroll::-webkit-scrollbar-thumb { background: ${HEADER_PINK}; border-radius: 8px; }
  .pc-bubble-in { animation: pcFadeUp .25s ease; }
  @keyframes pcFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pcBlink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }
  .pc-dot { animation: pcBlink 1.2s infinite; }
  .pc-icon-btn { transition: transform .15s ease, background .15s ease; }
  .pc-icon-btn:hover { transform: scale(1.08); }
  .pc-icon-btn:active { transform: scale(0.94); }
  .pc-drawer-backdrop { animation: pcFadeIn .2s ease; }
  @keyframes pcFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .pc-drawer { transition: transform .28s cubic-bezier(.32,.72,0,1); }
  .pc-room-btn { transition: background .15s ease; }
  .pc-room-btn:hover { background: rgba(255,255,255,0.55) !important; }
  .pc-invite-btn { transition: background .15s ease, color .15s ease; border-radius: 50%; }
  .pc-invite-btn:hover { background: rgba(183,110,121,0.12) !important; color: ${ROSE_GOLD} !important; }
  .pc-modal-backdrop { animation: pcFadeIn .18s ease; }

  /* ---- Chromebook / desktop browser: dock the sidebar permanently ---- */
  @media (min-width: 860px) {
    .pc-app-shell { flex-direction: row !important; }
    .pc-drawer {
      position: static !important;
      transform: none !important;
      box-shadow: none !important;
      width: 320px !important;
      max-width: 320px !important;
      min-width: 320px !important;
      height: 100% !important;
      order: -1;
      border-right: 1px solid ${HEADER_PINK};
    }
    .pc-drawer-backdrop { display: none !important; }
    .pc-menu-btn { display: none !important; }
    .pc-drawer-close { display: none !important; }
    .pc-main { min-width: 0; }
  }
`;

function ChatApp({ session, profile, setProfile, inviteStatus }) {
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [othersTyping, setOthersTyping] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null); // { id, text } | null
  const [othersOnline, setOthersOnline] = useState(false);
  const [notifStatus, setNotifStatus] = useState("checking"); // checking | unsupported | needs-install | default | granted | subscribed
  const [replyingTo, setReplyingTo] = useState(null); // { id, text, senderName } | null

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingStopTimer = useRef(null);
  const composerRef = useRef(null);

  const myId = session.user.id;

  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2200);
  };

  // Show the "joined the chat via invite link" note once, on arrival.
  useEffect(() => {
    if (inviteStatus) showToast(inviteStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteStatus]);

  // ---- Storage vault: project-wide 1GB Supabase free-tier ceiling ----
  // total_bytes is a single running total kept accurate by DB triggers on
  // storage.objects (increments on upload, decrements on delete), so this
  // is one cheap read rather than listing every file to sum sizes.
  const STORAGE_CAP_BYTES = 1024 * 1024 * 1024; // 1GB — Supabase free tier
  const STORAGE_WARN_BYTES = 900 * 1024 * 1024; // 900MB — headroom buffer

  useEffect(() => {
    supabase
      .from("storage_stats")
      .select("total_bytes")
      .single()
      .then(({ data }) => data && setStorageBytes(data.total_bytes));

    const channel = supabase
      .channel("storage-stats-watch")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "storage_stats" },
        (payload) => setStorageBytes(payload.new.total_bytes)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Soft client-side gate — not a hard security boundary, just a friendly
  // "you're out of room" before wasting an upload attempt. Uses the most
  // recently known total, so it can be a little stale under heavy
  // concurrent use, but that's fine for a warning, not a lock.
  const wouldExceedStorageCap = (fileSize) => storageBytes + fileSize > STORAGE_CAP_BYTES;

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  // Quick id -> profile lookup for whoever's in the current room (me +
  // everyone else), so message bubbles and the header can resolve a
  // sender's name/avatar without any "guess who the friend is" logic.
  const participantsById = useMemo(() => {
    const map = { [myId]: profile };
    (activeRoom?.otherParticipants || []).forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [activeRoom, profile, myId]);

  // Check where things stand for push notifications, without prompting —
  // the actual permission request only happens on an explicit tap (both
  // iOS's rules and good practice require a user gesture for this).
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifStatus("unsupported");
    } else if (isIOS && !isStandalone) {
      // iOS Safari flatly refuses push unless the site was added to the
      // Home Screen first — no permission prompt will work otherwise.
      setNotifStatus("needs-install");
    } else if (Notification.permission === "granted") {
      setNotifStatus("granted");
    } else {
      setNotifStatus("default");
    }
  }, []);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  };

  const enableNotifications = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifStatus("default");
        showToast("Notifications weren't allowed");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = subscription.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: myId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
      setNotifStatus("subscribed");
      showToast("Notifications turned on 🔔");
    } catch (err) {
      showToast("Couldn't turn on notifications");
    }
  };

  // ---- Rooms: load every room I belong to, with the other participants'
  // profiles nested in, via room_participants. ----
  const loadRooms = useCallback(async () => {
    const { data: participantRows, error: partErr } = await supabase
      .from("room_participants")
      .select("room_id")
      .eq("user_id", myId);
    if (partErr) return showToast("Couldn't load your chats");

    const roomIds = (participantRows || []).map((r) => r.room_id);
    if (roomIds.length === 0) {
      setRooms([]);
      return;
    }

    const { data: roomRows, error: roomErr } = await supabase
      .from("rooms")
      .select("*, room_participants(user_id, profiles(id, nickname, avatar_url))")
      .in("id", roomIds)
      .order("created_at", { ascending: false });
    if (roomErr) return showToast("Couldn't load your chats");

    const shaped = (roomRows || []).map((r) => rowToRoom(r, myId));
    setRooms(shaped);
    setActiveRoomId((prev) => prev || shaped[0]?.id || null);
  }, [myId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // If someone adds me to a new room while I'm connected, pick it up live.
  useEffect(() => {
    const channel = supabase
      .channel(`my-rooms-${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_participants", filter: `user_id=eq.${myId}` },
        () => loadRooms()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [myId, loadRooms]);

  // ---- Messages: scoped to whichever room is active ----
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", activeRoomId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) return showToast("Couldn't load messages");
        setMessages((data || []).map(rowToMessage));
      });
  }, [activeRoomId]);

  // realtime: messages INSERT / UPDATE / DELETE, scoped to the active room
  useEffect(() => {
    if (!activeRoomId) return;
    const channel = supabase
      .channel(`messages-room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          setMessages((prev) => [...prev, rowToMessage(payload.new)]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? rowToMessage(payload.new) : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          // Stealth unsend: the row is gone from the DB, so it just
          // vanishes from the UI — no "this message was deleted" trace.
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeRoomId]);

  // realtime: typing broadcast (ephemeral, not stored in the DB), per room
  useEffect(() => {
    if (!activeRoomId) return;
    const channel = supabase.channel(`typing-presence-${activeRoomId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === myId) return;
        setOthersTyping(true);
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = setTimeout(() => setOthersTyping(false), 2000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [myId, activeRoomId]);

  const broadcastTyping = useCallback(() => {
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: myId },
    });
  }, [myId]);

  // real online/offline presence, per room — replaces the old hardcoded
  // "online" label. For groups this just means "at least one other
  // member is here right now", same simple signal as the 1:1 case.
  useEffect(() => {
    if (!activeRoomId) return;
    const channel = supabase.channel(`presence-room-${activeRoomId}`, {
      config: { presence: { key: myId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const someoneElseOnline = Object.keys(state).some((key) => key !== myId);
      setOthersOnline(someoneElseOnline);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });
    return () => supabase.removeChannel(channel);
  }, [myId, activeRoomId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, othersTyping]);

  // mark incoming messages as delivered as soon as my client has them —
  // this fires immediately (no delay), independent of "read", so the
  // sender's ticks can progress sent -> delivered even before I've
  // actually looked at the message.
  useEffect(() => {
    const undelivered = messages.filter((m) => m.senderId !== myId && !m.delivered);
    if (undelivered.length === 0) return;
    undelivered.forEach((m) => supabase.from("messages").update({ delivered: true }).eq("id", m.id));
  }, [messages, myId]);

  // mark incoming unread messages as read once they're on screen
  useEffect(() => {
    const unread = messages.filter((m) => m.senderId !== myId && !m.read);
    if (unread.length === 0) return;
    const t = setTimeout(() => {
      unread.forEach((m) => supabase.from("messages").update({ read: true, delivered: true }).eq("id", m.id));
    }, 1000);
    return () => clearTimeout(t);
  }, [messages, myId]);

  const insertMessage = async (fields = {}) => {
    if (!activeRoomId) return;
    const textToSend = draft.trim();
    const { error } = await supabase.from("messages").insert({
      text: textToSend,
      sender_id: myId,
      sender_name: profile.nickname,
      room_id: activeRoomId,
      read: false,
      reactions: [],
      ...(replyingTo
        ? {
            reply_to_id: replyingTo.id,
            reply_to_text: replyingTo.text,
            reply_to_sender: replyingTo.senderName,
          }
        : {}),
      ...fields,
    });
    if (error) {
      // Real fix: keep the typed text in the composer on failure instead
      // of silently clearing it — nothing gets lost on a flaky connection.
      showToast("Message failed to send — try again");
      return;
    }
    setDraft("");
    setReplyingTo(null);
  };

  const startReply = (message) => {
    const senderProfile = participantsById[message.senderId];
    setReplyingTo({
      id: message.id,
      text: message.imageUrl ? "📷 Photo" : message.videoUrl ? "🎬 Video" : message.audioUrl ? "🎤 Voice note" : message.text,
      senderName: message.senderId === myId ? profile.nickname : senderProfile?.nickname || message.senderName,
    });
    setEditingMessage(null);
    setOpenMenuFor(null);
    composerRef.current?.focus();
  };

  const cancelReply = () => setReplyingTo(null);

  const jumpToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      showToast("That message isn't loaded here");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background-color 0.3s ease";
    el.style.backgroundColor = "#FFE4EC";
    setTimeout(() => (el.style.backgroundColor = "transparent"), 900);
  };

  const saveEdit = async () => {
    const newText = draft.trim();
    if (!newText || !editingMessage) return;
    const { error } = await supabase
      .from("messages")
      .update({ text: newText, edited: true })
      .eq("id", editingMessage.id);
    if (error) {
      showToast("Couldn't save your edit — try again");
      return;
    }
    setDraft("");
    setEditingMessage(null);
  };

  const handleComposerSubmit = () => {
    if (!draft.trim()) return;
    if (editingMessage) saveEdit();
    else insertMessage();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleComposerSubmit();
    }
    if (e.key === "Escape" && editingMessage) cancelEdit();
  };

  const startEdit = (message) => {
    setEditingMessage({ id: message.id, text: message.text });
    setReplyingTo(null);
    setDraft(message.text);
    setOpenMenuFor(null);
    composerRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setDraft("");
  };

  const unsendMessage = async (message) => {
    setOpenMenuFor(null);
    // Optimistic local removal — realtime DELETE will confirm it, but this
    // makes it feel instant on the sender's own screen.
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    const { error } = await supabase.from("messages").delete().eq("id", message.id);
    if (error) showToast("Couldn't unsend — try again");
  };

  // Generic attachment picker — routes to the right column by MIME type,
  // so one button covers photos, videos, and pre-recorded audio files.
  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let column = null;
    if (file.type.startsWith("image/")) column = "image_url";
    else if (file.type.startsWith("video/")) column = "video_url";
    else if (file.type.startsWith("audio/")) column = "audio_url";
    else {
      showToast("That file type isn't supported yet");
      e.target.value = "";
      return;
    }
    if (wouldExceedStorageCap(file.size)) {
      showToast("Your media vault is full. Please delete old files to free up space.");
      e.target.value = "";
      return;
    }
    const path = `${myId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
      contentType: file.type,
    });
    if (upErr) {
      showToast("Upload failed");
      e.target.value = "";
      return;
    }
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    await insertMessage({ [column]: data.publicUrl });
    e.target.value = "";
  };

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const recordingMimeRef = useRef("audio/webm");

  const pickSupportedAudioMime = () => {
    const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
    for (const type of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
    }
    return "";
  };

  const extensionFor = (mime) => {
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("ogg")) return "ogg";
    return "audio";
  };

  const toggleRecording = async () => {
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickSupportedAudioMime();
        recordingMimeRef.current = mime || "audio/webm";
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recordingMimeRef.current = recorder.mimeType || recordingMimeRef.current;
        audioChunks.current = [];
        recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        showToast("Recording voice note…");
      } catch {
        showToast("Microphone access denied");
      }
    } else {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = async () => {
        const mime = recordingMimeRef.current;
        const blob = new Blob(audioChunks.current, { type: mime });
        if (wouldExceedStorageCap(blob.size)) {
          showToast("Your media vault is full. Please delete old files to free up space.");
          return;
        }
        const path = `${myId}/${Date.now()}-voice.${extensionFor(mime)}`;
        const { error: upErr } = await supabase.storage
          .from("chat-media")
          .upload(path, blob, { contentType: mime });
        if (upErr) return showToast("Voice note upload failed");
        const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
        await insertMessage({ audio_url: data.publicUrl });
        showToast("Voice note sent");
      };
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (wouldExceedStorageCap(file.size)) {
      showToast("Your media vault is full. Please delete old files to free up space.");
      e.target.value = "";
      return;
    }
    const path = `${myId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file);
    if (upErr) return showToast("Avatar upload failed");
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", myId);
    setProfile((p) => ({ ...p, avatar_url: data.publicUrl }));
    e.target.value = "";
  };

  const updateNickname = async (value) => {
    setProfile((p) => ({ ...p, nickname: value }));
    await supabase.from("profiles").update({ nickname: value }).eq("id", myId);
  };

  const addReaction = async (message, emoji) => {
    const next = message.reactions.includes(emoji)
      ? message.reactions.filter((r) => r !== emoji)
      : [...message.reactions, emoji];
    await supabase.from("messages").update({ reactions: next }).eq("id", message.id);
    setOpenMenuFor(null);
  };

  // ---- Room creation ----
  const createRoom = async (participantIds, name) => {
    const isGroupChat = participantIds.length > 1;

    // For 1:1s, reuse an existing room with that exact person instead of
    // spawning a duplicate every time someone taps "new chat".
    if (!isGroupChat) {
      const existing = rooms.find(
        (r) => !r.isGroup && r.otherParticipants.length === 1 && r.otherParticipants[0].id === participantIds[0]
      );
      if (existing) {
        setActiveRoomId(existing.id);
        setNewChatOpen(false);
        return;
      }
    }

    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ name: isGroupChat ? name || null : null, is_group: isGroupChat, created_by: myId })
      .select()
      .single();
    if (error || !room) {
      showToast("Couldn't create chat");
      return;
    }

    const rows = [myId, ...participantIds].map((uid) => ({ room_id: room.id, user_id: uid }));
    const { error: partErr } = await supabase.from("room_participants").insert(rows);
    if (partErr) {
      showToast("Couldn't add everyone to the chat");
      return;
    }

    await loadRooms();
    setActiveRoomId(room.id);
    setNewChatOpen(false);
  };

  // Copies a shareable link to this specific room. The room's UUID *is*
  // the invite token — unguessable, no separate token table needed. The
  // RLS self-join policy already lets any signed-in user add themselves
  // to a room_particiants row for a room_id they know, so this needs no
  // extra backend work beyond what already exists.
  const copyInviteLink = async (roomId) => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied 💌");
    } catch {
      showToast("Couldn't copy — long-press the link to copy manually");
    }
  };

  // Group messages under day separators ("Today", "Yesterday", ...)
  const groupedMessages = [];
  let lastDay = null;
  for (const m of messages) {
    const label = dayLabel(m.timestamp);
    if (label !== lastDay) {
      groupedMessages.push({ type: "separator", label, key: `sep-${m.id}` });
      lastDay = label;
    }
    groupedMessages.push({ type: "message", message: m, key: m.id });
  }

  // ---- Header display info: 1:1 shows the friend; a group shows its
  // name (or the member list) and a generic avatar. ----
  const headerName = !activeRoom
    ? "our little chat"
    : activeRoom.isGroup
    ? activeRoom.name || activeRoom.otherParticipants.map((p) => p.nickname).join(", ") || "Group chat"
    : activeRoom.otherParticipants[0]?.nickname || "Waiting for your friend…";
  const headerSubtitle = !activeRoom
    ? ""
    : othersTyping
    ? "typing…"
    : activeRoom.isGroup
    ? `${activeRoom.otherParticipants.length + 1} members`
    : othersOnline
    ? "online"
    : "offline";
  const headerAvatarUrl = activeRoom && !activeRoom.isGroup ? activeRoom.otherParticipants[0]?.avatar_url : undefined;

  return (
    <div
      className="pc-app-shell"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: BLUSH_BG,
        fontFamily: "'Quicksand','Poppins',sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{chatStyles}</style>

      {/* ---------------- LEFT PANEL: rooms + profile ---------------- */}
      {drawerOpen && (
        <div
          className="pc-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(107,74,87,0.35)",
            zIndex: 20,
          }}
        />
      )}
      <div
        className="pc-drawer"
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          width: "82%",
          maxWidth: 320,
          background: "linear-gradient(180deg, #FFE4EC 0%, #FFF0F5 100%)",
          zIndex: 21,
          transform: drawerOpen ? "translateX(0)" : "translateX(-105%)",
          boxShadow: drawerOpen ? "8px 0 30px rgba(183,110,121,0.25)" : "none",
          padding: "20px 16px",
          paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontStyle: "italic",
              fontSize: 21,
              fontWeight: 600,
              color: ROSE_GOLD,
            }}
          >
            our little chat
          </div>
          <button
            className="pc-drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_SOFT }}
          >
            <X size={18} />
          </button>
        </div>

        <ProfileEditor
          label="Me"
          nickname={profile.nickname}
          avatarUrl={profile.avatar_url}
          onNicknameChange={updateNickname}
          onAvatarClick={() => avatarInputRef.current?.click()}
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleAvatarUpload}
        />

        <div style={{ height: 1, background: HEADER_PINK, opacity: 0.6, flexShrink: 0 }} />

        <button
          onClick={() => setNewChatOpen(true)}
          className="pc-icon-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: "none",
            borderRadius: 999,
            padding: "10px 0",
            background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Plus size={16} /> New chat
        </button>

        {/* storage vault: project-wide usage against the Supabase free-tier 1GB cap */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <HardDrive size={12} color={TEXT_SOFT} />
            <span style={{ fontSize: 10.5, color: TEXT_SOFT, fontWeight: 600 }}>
              Storage used: {(storageBytes / (1024 * 1024)).toFixed(0)}MB / 1GB
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: "rgba(107,74,87,0.12)",
              overflow: "hidden",
            }}
          >
            <div
              className={storageBytes >= STORAGE_WARN_BYTES ? "pc-dot" : undefined}
              style={{
                height: "100%",
                width: `${Math.min(100, (storageBytes / STORAGE_CAP_BYTES) * 100)}%`,
                borderRadius: 999,
                background:
                  storageBytes >= STORAGE_CAP_BYTES
                    ? "#E24B7A"
                    : storageBytes >= STORAGE_WARN_BYTES
                    ? "linear-gradient(90deg, #E8B4BE, #E24B7A)"
                    : `linear-gradient(90deg, ${ROSE_GOLD}, #E8B4BE)`,
                transition: "width .4s ease",
              }}
            />
          </div>
        </div>

        {/* scrollable room list */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {rooms.length === 0 ? (
            <div style={{ fontSize: 12.5, color: TEXT_SOFT, textAlign: "center", padding: "18px 8px" }}>
              No chats yet — start one above 💌
            </div>
          ) : (
            rooms.map((room) => {
              const title = room.isGroup
                ? room.name || room.otherParticipants.map((p) => p.nickname).join(", ") || "Group chat"
                : room.otherParticipants[0]?.nickname || "Unnamed";
              const avatarName = room.isGroup
                ? room.name || room.otherParticipants.map((p) => p.nickname).join(" ") || "Group"
                : room.otherParticipants[0]?.nickname || "?";
              const avatarUrl = room.isGroup ? undefined : room.otherParticipants[0]?.avatar_url;
              const active = room.id === activeRoomId;
              return (
                <div
                  key={room.id}
                  style={{ display: "flex", alignItems: "center", gap: 2 }}
                >
                  <button
                    className="pc-room-btn"
                    onClick={() => {
                      setActiveRoomId(room.id);
                      setDrawerOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 8px",
                      borderRadius: 14,
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      flex: 1,
                      minWidth: 0,
                      background: active ? "rgba(255,255,255,0.75)" : "transparent",
                    }}
                  >
                    {room.isGroup ? (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(135deg, #FFC1CC, #E8B4BE)",
                          border: active ? `2px solid ${ROSE_GOLD}` : "none",
                        }}
                      >
                        <Users size={17} color="#fff" />
                      </div>
                    ) : (
                      <Avatar url={avatarUrl} name={avatarName} size={40} ring={active} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: TEXT_DEEP,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {title}
                      </div>
                      {room.isGroup && (
                        <div style={{ fontSize: 11, color: TEXT_SOFT }}>{room.otherParticipants.length + 1} members</div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => copyInviteLink(room.id)}
                    aria-label="Copy invite link for this chat"
                    title="Copy invite link"
                    className="pc-invite-btn"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: TEXT_SOFT,
                      cursor: "pointer",
                      padding: 8,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Link2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ height: 1, background: HEADER_PINK, opacity: 0.6, flexShrink: 0 }} />

        <div style={{ textAlign: "center", flexShrink: 0 }}>
          {notifStatus === "subscribed" ? (
            <div style={{ fontSize: 12, color: TEXT_SOFT }}>🔔 Notifications are on</div>
          ) : notifStatus === "needs-install" ? (
            <div style={{ fontSize: 11.5, color: TEXT_SOFT, lineHeight: 1.5 }}>
              To get notifications on iPhone: tap the Share icon in Safari, then
              <strong style={{ color: ROSE_GOLD }}> "Add to Home Screen"</strong> — open it from
              there instead of Safari to turn them on.
            </div>
          ) : notifStatus === "unsupported" ? (
            <div style={{ fontSize: 11.5, color: TEXT_SOFT }}>
              This browser doesn't support notifications
            </div>
          ) : notifStatus === "default" || notifStatus === "granted" ? (
            <button
              onClick={enableNotifications}
              className="pc-icon-btn"
              style={{
                border: "none",
                borderRadius: 999,
                padding: "9px 18px",
                background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              🔔 Turn on notifications
            </button>
          ) : null}
        </div>

        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ border: "none", background: "none", color: TEXT_SOFT, cursor: "pointer", fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </div>

      {newChatOpen && (
        <NewChatModal myId={myId} onClose={() => setNewChatOpen(false)} onCreate={createRoom} />
      )}

      {/* ---------------- MAIN: header + messages + composer ---------------- */}
      <div className="pc-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* ---------------- HEADER (safe-area aware) ---------------- */}
        <div
          style={{
            background: HEADER_PINK,
            padding: "12px 16px",
            paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
            paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
            paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: `1px solid ${ROSE_GOLD}33`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="pc-icon-btn pc-menu-btn"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Menu size={19} color="#6B2F44" />
          </button>

          {activeRoom?.isGroup ? (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #FFC1CC, #E8B4BE)",
              }}
            >
              <Users size={16} color="#fff" />
            </div>
          ) : (
            <Avatar url={headerAvatarUrl} name={headerName} size={38} ring />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#6B2F44", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {headerName}
            </div>
            <div style={{ fontSize: 11, color: "#8A4A5D" }}>{headerSubtitle}</div>
          </div>
        </div>

        {!activeRoom ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: 24,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: 22, color: ROSE_GOLD }}>
              no chats yet
            </div>
            <div style={{ fontSize: 13, color: TEXT_SOFT, maxWidth: 240 }}>
              Start a new chat with a friend to get things going 💌
            </div>
            <button
              onClick={() => setNewChatOpen(true)}
              className="pc-icon-btn"
              style={{
                border: "none",
                borderRadius: 999,
                padding: "10px 20px",
                background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> New chat
            </button>
          </div>
        ) : (
          <>
            {/* ---------------- MESSAGES ---------------- */}
            <div
              ref={scrollRef}
              className="pc-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
                paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
                paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {groupedMessages.map((item) =>
                item.type === "separator" ? (
                  <div
                    key={item.key}
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      color: TEXT_SOFT,
                      margin: "10px 0 4px",
                      fontWeight: 600,
                      letterSpacing: 0.3,
                    }}
                  >
                    {item.label}
                  </div>
                ) : (
                  <MessageBubble
                    key={item.key}
                    message={item.message}
                    mine={item.message.senderId === myId}
                    displayName={
                      item.message.senderId === myId
                        ? profile.nickname
                        : participantsById[item.message.senderId]?.nickname || item.message.senderName
                    }
                    avatarUrl={
                      item.message.senderId === myId
                        ? profile.avatar_url
                        : participantsById[item.message.senderId]?.avatar_url
                    }
                    isOpen={openMenuFor === item.message.id}
                    onToggleMenu={() =>
                      setOpenMenuFor(openMenuFor === item.message.id ? null : item.message.id)
                    }
                    onReact={(emoji) => addReaction(item.message, emoji)}
                    onEdit={() => startEdit(item.message)}
                    onUnsend={() => unsendMessage(item.message)}
                    onReply={() => startReply(item.message)}
                    onJumpToQuoted={() => item.message.replyToId && jumpToMessage(item.message.replyToId)}
                  />
                )
              )}

              {othersTyping && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <Avatar
                    url={activeRoom.isGroup ? undefined : activeRoom.otherParticipants[0]?.avatar_url}
                    name={headerName}
                    size={24}
                  />
                  <div
                    className="pc-bubble-in"
                    style={{
                      background: BUBBLE_WHITE,
                      borderRadius: "18px 18px 18px 4px",
                      padding: "12px 16px",
                      display: "flex",
                      gap: 4,
                      boxShadow: "0 2px 10px rgba(183,110,121,0.12)",
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="pc-dot"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: ROSE_GOLD,
                          display: "inline-block",
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ---------------- COMPOSER (safe-area aware) ---------------- */}
            <div
              style={{
                background: "#FFE9F0",
                borderTop: `1px solid ${HEADER_PINK}`,
                flexShrink: 0,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
            >
              {editingMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px 0",
                    fontSize: 12,
                    color: ROSE_GOLD,
                  }}
                >
                  <Pencil size={12} />
                  <span style={{ flex: 1 }}>Editing message</span>
                  <button
                    onClick={cancelEdit}
                    style={{ border: "none", background: "transparent", color: TEXT_SOFT, cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {replyingTo && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px 0",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      background: "#fff",
                      borderLeft: `3px solid ${ROSE_GOLD}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: ROSE_GOLD }}>
                      Replying to {replyingTo.senderName}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: TEXT_SOFT,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {replyingTo.text}
                    </div>
                  </div>
                  <button
                    onClick={cancelReply}
                    style={{ border: "none", background: "transparent", color: TEXT_SOFT, cursor: "pointer" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div
                style={{
                  padding: "10px 16px",
                  paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
                  paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  style={{ display: "none" }}
                  onChange={handleFilePick}
                />
                <IconButton label="Attach photo, video, or audio" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip size={19} color={ROSE_GOLD} />
                </IconButton>
                <IconButton
                  label={recording ? "Stop recording" : "Record voice note"}
                  onClick={toggleRecording}
                  active={recording}
                >
                  {recording ? <Square size={17} color="#fff" fill="#fff" /> : <Mic size={19} color={ROSE_GOLD} />}
                </IconButton>
                <input
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    broadcastTyping();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={editingMessage ? "Edit your message…" : "Say something sweet…"}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: `1px solid ${HEADER_PINK}`,
                    borderRadius: 999,
                    padding: "11px 18px",
                    fontSize: 16,
                    outline: "none",
                    background: "#fff",
                    color: TEXT_DEEP,
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={handleComposerSubmit}
                  className="pc-icon-btn"
                  aria-label={editingMessage ? "Save edit" : "Send message"}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "none",
                    background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {editingMessage ? <Check size={17} color="#fff" /> : <Send size={17} color="#fff" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            color: TEXT_DEEP,
            padding: "9px 18px",
            borderRadius: 999,
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(183,110,121,0.25)",
            border: `1px solid ${HEADER_PINK}`,
            zIndex: 30,
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// Picker for starting a 1:1 or group chat — lists everyone else with a
// profile, lets you multi-select, and names the room if 3+ are picked.
function NewChatModal({ myId, onClose, onCreate }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Deliberately NOT "select all profiles" — that used to work only
    // because the RLS policy silently truncated it to roommates, which is
    // fragile and easy to misread as an open directory. This is the
    // actual intended query: everyone I currently share at least one
    // room with, explicitly, via room_participants.
    (async () => {
      const { data: myRoomRows, error: roomErr } = await supabase
        .from("room_participants")
        .select("room_id")
        .eq("user_id", myId);
      if (roomErr || !myRoomRows || myRoomRows.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }
      const roomIds = myRoomRows.map((r) => r.room_id);

      const { data: coParticipantRows } = await supabase
        .from("room_participants")
        .select("profiles(id, nickname, avatar_url)")
        .in("room_id", roomIds)
        .neq("user_id", myId);

      // dedupe — the same person can share more than one room with me
      const seen = new Map();
      (coParticipantRows || []).forEach((row) => {
        if (row.profiles) seen.set(row.profiles.id, row.profiles);
      });
      setProfiles([...seen.values()]);
      setLoading(false);
    })();
  }, [myId]);

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const isGroup = selected.length > 1;

  const submit = async () => {
    if (selected.length === 0 || creating) return;
    setCreating(true);
    await onCreate(selected, isGroup ? groupName.trim() : "");
    setCreating(false);
  };

  return (
    <div
      className="pc-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(107,74,87,0.4)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pc-bubble-in"
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: 22,
          width: "100%",
          maxWidth: 360,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 14px 40px rgba(183,110,121,0.25)",
          fontFamily: "'Quicksand','Poppins',sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: 20, color: ROSE_GOLD }}>
            New chat
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_SOFT }}>
            <X size={18} />
          </button>
        </div>

        {isGroup && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Name this group (optional)"
            style={{
              border: `1.5px solid ${HEADER_PINK}`,
              borderRadius: 999,
              padding: "9px 14px",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              color: TEXT_DEEP,
            }}
          />
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: TEXT_SOFT, textAlign: "center", padding: 20 }}>Loading friends…</div>
          ) : profiles.length === 0 ? (
            <div style={{ fontSize: 13, color: TEXT_SOFT, textAlign: "center", padding: "24px 12px", lineHeight: 1.6 }}>
              You'll see people here once you're both in a chat together.
              <br />
              Use the link icon next to a chat to invite someone new 💌
            </div>
          ) : (
            profiles.map((p) => {
              const isSelected = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 8px",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    background: isSelected ? "#FFE4EC" : "transparent",
                  }}
                >
                  <Avatar url={p.avatar_url} name={p.nickname} size={38} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: TEXT_DEEP }}>{p.nickname}</span>
                  {isSelected && <Check size={16} color={ROSE_GOLD} />}
                </button>
              );
            })
          )}
        </div>

        <button
          onClick={submit}
          disabled={selected.length === 0 || creating}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "11px 0",
            background: selected.length === 0 ? "#F0DCE2" : `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: selected.length === 0 ? "default" : "pointer",
          }}
        >
          {creating ? "Creating…" : isGroup ? `Start group (${selected.length})` : "Start chat"}
        </button>
      </div>
    </div>
  );
}

function ProfileEditor({ label, nickname, avatarUrl, onNicknameChange, onAvatarClick }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 11, color: TEXT_SOFT, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <Avatar url={avatarUrl} name={nickname} size={64} ring />
        <button
          onClick={onAvatarClick}
          className="pc-icon-btn"
          aria-label={`Change ${label} profile picture`}
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: ROSE_GOLD,
            border: "2px solid #FFF0F5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Camera size={13} color="#fff" />
        </button>
      </div>
      <input
        value={nickname}
        onChange={(e) => onNicknameChange(e.target.value)}
        style={{
          width: "100%",
          textAlign: "center",
          border: "none",
          borderBottom: `1.5px solid ${HEADER_PINK}`,
          background: "transparent",
          padding: "4px 2px",
          fontSize: 14,
          fontWeight: 600,
          color: TEXT_DEEP,
          outline: "none",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function Avatar({ url, name, size = 40, ring }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: url ? "transparent" : "linear-gradient(135deg, #FFC1CC, #E8B4BE)",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.4,
        border: ring ? `2px solid ${ROSE_GOLD}` : "none",
      }}
    >
      {url ? (
        <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initial
      )}
    </div>
  );
}

function IconButton({ children, onClick, label, active }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pc-icon-btn"
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        border: `1px solid ${active ? "#E24B7A" : HEADER_PINK}`,
        background: active ? "#E24B7A" : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function MessageBubble({
  message,
  mine,
  displayName,
  avatarUrl,
  isOpen,
  onToggleMenu,
  onReact,
  onEdit,
  onUnsend,
  onReply,
  onJumpToQuoted,
}) {
  const [pressTimer, setPressTimer] = useState(null);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const startPress = () => setPressTimer(setTimeout(() => onToggleMenu(), 450));
  const cancelPress = () => pressTimer && clearTimeout(pressTimer);

  return (
    <div
      id={`msg-${message.id}`}
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 6,
        position: "relative",
        borderRadius: 14,
      }}
    >
      {!mine && <Avatar url={avatarUrl} name={displayName} size={24} />}
      <div style={{ maxWidth: "78%", position: "relative" }}>
        <div
          className="pc-bubble-in"
          onClick={onToggleMenu}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          style={{
            background: BUBBLE_WHITE,
            borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: message.imageUrl || message.videoUrl ? 6 : "11px 15px",
            boxShadow: "0 2px 10px rgba(183,110,121,0.12)",
            border: mine ? "1px solid #FBE1E8" : "1px solid #F5F5F5",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          {!mine && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: ROSE_GOLD,
                marginBottom: 3,
                marginLeft: message.imageUrl || message.videoUrl ? 9 : 0,
                marginTop: message.imageUrl || message.videoUrl ? 6 : 0,
              }}
            >
              {displayName}
            </div>
          )}

          {message.replyToText && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onJumpToQuoted();
              }}
              style={{
                background: "#FFF5F8",
                borderLeft: `3px solid ${ROSE_GOLD}`,
                borderRadius: 6,
                padding: "5px 8px",
                marginBottom: 6,
                marginLeft: message.imageUrl || message.videoUrl ? 9 : 0,
                marginRight: message.imageUrl || message.videoUrl ? 9 : 0,
                marginTop: message.imageUrl || message.videoUrl ? 6 : 0,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, color: ROSE_GOLD }}>
                {message.replyToSender}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: TEXT_SOFT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {message.replyToText}
              </div>
            </div>
          )}

          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt=""
              style={{ borderRadius: 12, maxWidth: "100%", display: "block", maxHeight: 320, objectFit: "cover" }}
            />
          )}
          {message.videoUrl && (
            <video src={message.videoUrl} controls style={{ borderRadius: 12, maxWidth: "100%", display: "block" }} />
          )}
          {message.audioUrl && (
            <audio src={message.audioUrl} controls style={{ marginTop: 4, width: 220, display: "block" }} />
          )}
          {message.text && (
            <div
              style={{
                fontSize: 14.5,
                color: TEXT_DEEP,
                lineHeight: 1.45,
                wordBreak: "break-word",
                padding: message.imageUrl || message.videoUrl ? "8px 9px 0" : 0,
              }}
            >
              {message.text}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 4,
              marginTop: 5,
              padding: message.imageUrl || message.videoUrl ? "0 9px 6px" : 0,
            }}
          >
            {message.edited && (
              <span style={{ fontSize: 10, color: TEXT_SOFT, fontStyle: "italic" }}>edited</span>
            )}
            <span style={{ fontSize: 10.5, color: TEXT_SOFT }}>{fmtTime(message.timestamp)}</span>
            {mine &&
              (message.read ? (
                <CheckCheck size={13} color={READ_PINK} />
              ) : message.delivered ? (
                <CheckCheck size={13} color="#C9B7BD" />
              ) : (
                <Check size={13} color="#C9B7BD" />
              ))}
          </div>
        </div>

        {message.reactions.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: -12,
              [mine ? "right" : "left"]: 10,
              background: "#fff",
              borderRadius: 999,
              padding: "2px 7px",
              fontSize: 12,
              boxShadow: "0 2px 6px rgba(183,110,121,0.2)",
              border: `1px solid ${HEADER_PINK}`,
            }}
          >
            {message.reactions.join(" ")}
          </div>
        )}

        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: -46,
              [mine ? "right" : "left"]: 0,
              zIndex: 5,
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 999,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 4px 16px rgba(183,110,121,0.25)",
                border: `1px solid ${HEADER_PINK}`,
              }}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  style={{ border: "none", background: "transparent", fontSize: 17, cursor: "pointer", lineHeight: 1 }}
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullPicker((s) => !s);
                }}
                aria-label="More emoji"
                style={{
                  border: "none",
                  background: showFullPicker ? "#FFE4EC" : "transparent",
                  cursor: "pointer",
                  color: ROSE_GOLD,
                  fontSize: 15,
                  fontWeight: 700,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
              <div style={{ width: 1, height: 18, background: "#F0DCE2" }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply();
                }}
                aria-label="Reply"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: ROSE_GOLD, display: "flex" }}
              >
                <Reply size={15} />
              </button>
              {mine && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    aria-label="Edit message"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: ROSE_GOLD, display: "flex" }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnsend();
                    }}
                    aria-label="Unsend message"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#E24B7A", display: "flex" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMenu();
                }}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_SOFT, display: "flex" }}
              >
                <X size={13} />
              </button>
            </div>

            {showFullPicker && (
              <div
                className="pc-bubble-in"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 42,
                  [mine ? "right" : "left"]: 0,
                  background: "#fff",
                  borderRadius: 16,
                  padding: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 2,
                  width: 240,
                  boxShadow: "0 4px 16px rgba(183,110,121,0.25)",
                  border: `1px solid ${HEADER_PINK}`,
                }}
              >
                {EMOJI_GRID.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact(emoji);
                      setShowFullPicker(false);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      fontSize: 18,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 4,
                      borderRadius: 8,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
