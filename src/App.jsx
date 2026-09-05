import React, { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/*  DATA MODEL (mirrors supabase/schema.sql + migration-2)            */
/*                                                                     */
/*  User    { id, nickname, avatarUrl }             -> "profiles"     */
/*  Message { id, text, senderName, timestamp,                        */
/*            imageUrl?, videoUrl?, audioUrl?,                        */
/*            read, edited, reactions[] } -> "messages"               */
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
  timestamp: row.created_at,
  imageUrl: row.image_url || undefined,
  videoUrl: row.video_url || undefined,
  audioUrl: row.audio_url || undefined,
  read: row.read,
  edited: !!row.edited,
  reactions: row.reactions || [],
  replyToId: row.reply_to_id || undefined,
  replyToText: row.reply_to_text || undefined,
  replyToSender: row.reply_to_sender || undefined,
});

export default function App() {
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStep, setAuthStep] = useState("email"); // "email" | "code"
  const [authError, setAuthError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);

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
      .then(({ data }) => data && setProfile(data));
  }, [session]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail });
    if (error) {
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

  if (!profile) return <CenteredNote text="Loading your profile…" />;

  return <ChatApp session={session} profile={profile} setProfile={setProfile} />;
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
      <button
        type="submit"
        className="auth-btn"
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 999,
          border: "none",
          background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
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
`;

function ChatApp({ session, profile, setProfile }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [friendTyping, setFriendTyping] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState("");
  const [friendProfile, setFriendProfile] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null); // { id, text } | null
  const [friendOnline, setFriendOnline] = useState(false);
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

  // initial message load
  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) return showToast("Couldn't load messages");
        setMessages((data || []).map(rowToMessage));
      });
  }, []);

  // Identify the friend as "whoever actually sent me a message" instead
  // of an arbitrary other row in profiles — leftover test accounts from
  // earlier debugging (miss.cherryie, lamanna, testbot, etc.) made "any
  // other row" ambiguous and occasionally picked the wrong one.
  useEffect(() => {
    const lastOtherSenderId = [...messages].reverse().find((m) => m.senderId !== myId)?.senderId;
    if (!lastOtherSenderId) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", lastOtherSenderId)
      .single()
      .then(({ data }) => data && setFriendProfile(data));
  }, [messages, myId]);

  // realtime: messages INSERT / UPDATE / DELETE
  useEffect(() => {
    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => [...prev, rowToMessage(payload.new)]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? rowToMessage(payload.new) : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          // Stealth unsend: the row is gone from the DB, so it just
          // vanishes from the UI — no "this message was deleted" trace.
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // realtime: typing broadcast (ephemeral, not stored in the DB)
  useEffect(() => {
    const channel = supabase.channel("typing-presence", {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === myId) return;
        setFriendTyping(true);
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = setTimeout(() => setFriendTyping(false), 2000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [myId]);

  const broadcastTyping = useCallback(() => {
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: myId },
    });
  }, [myId]);

  // real online/offline presence — replaces the old hardcoded "online" label
  useEffect(() => {
    const channel = supabase.channel("presence-room", {
      config: { presence: { key: myId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const someoneElseOnline = Object.keys(state).some((key) => key !== myId);
      setFriendOnline(someoneElseOnline);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });
    return () => supabase.removeChannel(channel);
  }, [myId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, friendTyping]);

  // mark incoming unread messages as read once they're on screen
  useEffect(() => {
    const unread = messages.filter((m) => m.senderId !== myId && !m.read);
    if (unread.length === 0) return;
    const t = setTimeout(() => {
      unread.forEach((m) => supabase.from("messages").update({ read: true }).eq("id", m.id));
    }, 1000);
    return () => clearTimeout(t);
  }, [messages, myId]);

  const insertMessage = async (fields = {}) => {
    const textToSend = draft.trim();
    const { error } = await supabase.from("messages").insert({
      text: textToSend,
      sender_id: myId,
      sender_name: profile.nickname,
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
    setReplyingTo({
      id: message.id,
      text: message.imageUrl ? "📷 Photo" : message.videoUrl ? "🎬 Video" : message.audioUrl ? "🎤 Voice note" : message.text,
      senderName: message.senderId === myId ? profile.nickname : friendProfile?.nickname || message.senderName,
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

  return (
    <div
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
          aria-label="Open profile menu"
          className="pc-icon-btn"
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

        <Avatar url={friendProfile?.avatar_url} name={friendProfile?.nickname || "?"} size={38} ring />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#6B2F44", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {friendProfile?.nickname || "Waiting for your friend…"}
          </div>
          <div style={{ fontSize: 11, color: "#8A4A5D" }}>
            {friendTyping ? "typing…" : friendOnline ? "online" : "offline"}
          </div>
        </div>
      </div>

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
              displayName={item.message.senderId === myId ? profile.nickname : friendProfile?.nickname || item.message.senderName}
              avatarUrl={item.message.senderId === myId ? profile.avatar_url : friendProfile?.avatar_url}
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

        {friendTyping && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <Avatar url={friendProfile?.avatar_url} name={friendProfile?.nickname || "?"} size={24} />
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

      {/* ---------------- PROFILE DRAWER ---------------- */}
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
          width: "78%",
          maxWidth: 300,
          background: "linear-gradient(180deg, #FFE4EC 0%, #FFF0F5 100%)",
          zIndex: 21,
          transform: drawerOpen ? "translateX(0)" : "translateX(-105%)",
          boxShadow: drawerOpen ? "8px 0 30px rgba(183,110,121,0.25)" : "none",
          padding: "24px 18px",
          paddingTop: "calc(24px + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "calc(18px + env(safe-area-inset-left, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 26,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontStyle: "italic",
              fontSize: 22,
              fontWeight: 600,
              color: ROSE_GOLD,
            }}
          >
            our little chat
          </div>
          <button
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

        <div style={{ height: 1, background: HEADER_PINK, opacity: 0.6 }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, color: TEXT_SOFT }}>Friend</div>
          <Avatar url={friendProfile?.avatar_url} name={friendProfile?.nickname || "?"} size={64} ring />
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_DEEP }}>
            {friendProfile?.nickname || "waiting to join…"}
          </div>
        </div>

        <div style={{ marginTop: "auto", textAlign: "center" }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ border: "none", background: "none", color: TEXT_SOFT, cursor: "pointer", fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
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
            {mine && (message.read ? <CheckCheck size={13} color={READ_PINK} /> : <Check size={13} color="#C9B7BD" />)}
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
