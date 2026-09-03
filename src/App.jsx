import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Video, Mic, Check, CheckCheck, Camera, Square, X } from "lucide-react";
import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/*  DATA MODEL (mirrors supabase/schema.sql)                          */
/*                                                                     */
/*  User    { id, nickname, avatarUrl }             -> "profiles"     */
/*  Message { id, text, senderName, timestamp,                        */
/*            videoUrl?, audioUrl?, read, reactions[] } -> "messages" */
/* ------------------------------------------------------------------ */

const ROSE_GOLD = "#B76E79";
const BLUSH_BG = "#FFF0F5";
const HEADER_PINK = "#FFB6C1";
const BUBBLE_WHITE = "#FFFFFF";
const TEXT_DEEP = "#6B4A57";
const TEXT_SOFT = "#A8828F";
const READ_PINK = "#F49AC2";
const REACTIONS = ["💖", "✨", "😭"];

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const rowToMessage = (row) => ({
  id: row.id,
  text: row.text || "",
  senderName: row.sender_name,
  senderId: row.sender_id,
  timestamp: row.created_at,
  videoUrl: row.video_url || undefined,
  audioUrl: row.audio_url || undefined,
  read: row.read,
  reactions: row.reactions || [],
});

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);

  // auth bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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

  const sendMagicLink = async (e) => {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email: authEmail });
    setAuthSent(true);
  };

  if (!session) {
    return (
      <AuthScreen
        email={authEmail}
        setEmail={setAuthEmail}
        onSubmit={sendMagicLink}
        sent={authSent}
      />
    );
  }

  if (!profile) return <CenteredNote text="Loading your profile…" />;

  return <ChatApp session={session} profile={profile} setProfile={setProfile} />;
}

function AuthScreen({ email, setEmail, onSubmit, sent }) {
  return (
    <div
      style={{
        minHeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUSH_BG,
        fontFamily: "'Quicksand','Poppins',sans-serif",
        borderRadius: 20,
        border: `1px solid ${HEADER_PINK}`,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 18,
          boxShadow: "0 10px 30px rgba(183,110,121,0.18)",
          width: 300,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: "italic",
            fontSize: 24,
            color: ROSE_GOLD,
            marginBottom: 18,
          }}
        >
          our little chat
        </div>
        {sent ? (
          <p style={{ color: TEXT_DEEP, fontSize: 14 }}>
            Check your inbox — we sent {email} a magic sign-in link 💌
          </p>
        ) : (
          <>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${HEADER_PINK}`,
                marginBottom: 14,
                outline: "none",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 999,
                border: "none",
                background: `linear-gradient(135deg, ${ROSE_GOLD}, #E8B4BE)`,
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Send magic link
            </button>
          </>
        )}
      </form>
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

function ChatApp({ session, profile, setProfile }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [friendTyping, setFriendTyping] = useState(false);
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState("");
  const [friendProfile, setFriendProfile] = useState(null);

  const scrollRef = useRef(null);
  const videoInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingStopTimer = useRef(null);

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

  // load the other person's profile (first profile that isn't mine)
  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .neq("id", myId)
      .limit(1)
      .then(({ data }) => data && data[0] && setFriendProfile(data[0]));
  }, [myId]);

  // realtime: messages INSERT / UPDATE
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
    const { error } = await supabase.from("messages").insert({
      text: draft.trim(),
      sender_id: myId,
      sender_name: profile.nickname,
      read: false,
      reactions: [],
      ...fields,
    });
    if (error) showToast("Message failed to send");
    setDraft("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      insertMessage();
    }
  };

  const handleVideoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      showToast("Please choose an MP4 video file");
      return;
    }
    const path = `${myId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file);
    if (upErr) return showToast("Video upload failed");
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    await insertMessage({ video_url: data.publicUrl });
    e.target.value = "";
  };

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);

  const toggleRecording = async () => {
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
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
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const path = `${myId}/${Date.now()}-voice.webm`;
        const { error: upErr } = await supabase.storage.from("chat-media").upload(path, blob);
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
    setOpenReactionFor(null);
  };

  return (
    <div
      style={{
        fontFamily: "'Quicksand','Poppins',sans-serif",
        background: BLUSH_BG,
        minHeight: "600px",
        display: "flex",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(183,110,121,0.18)",
        maxWidth: 920,
        margin: "0 auto",
        border: `1px solid ${HEADER_PINK}`,
        position: "relative",
      }}
    >
      <style>{`
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
      `}</style>

      <aside
        style={{
          width: 220,
          background: "linear-gradient(180deg, #FFE4EC 0%, #FFF0F5 100%)",
          borderRight: `1px solid ${HEADER_PINK}`,
          padding: "28px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontStyle: "italic",
            fontSize: 24,
            fontWeight: 600,
            color: ROSE_GOLD,
            textAlign: "center",
          }}
        >
          our little chat
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
          <Avatar
            url={friendProfile?.avatar_url}
            name={friendProfile?.nickname || "?"}
            size={64}
            ring
          />
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_DEEP }}>
            {friendProfile?.nickname || "waiting to join…"}
          </div>
        </div>

        <div style={{ marginTop: "auto", textAlign: "center", fontSize: 12, color: TEXT_SOFT }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ border: "none", background: "none", color: TEXT_SOFT, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            background: HEADER_PINK,
            padding: "16px 22px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: `1px solid ${ROSE_GOLD}33`,
          }}
        >
          <Avatar url={friendProfile?.avatar_url} name={friendProfile?.nickname || "?"} size={40} ring />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#6B2F44", fontSize: 16 }}>
              {friendProfile?.nickname || "Waiting for your friend…"}
            </div>
            <div style={{ fontSize: 12, color: "#8A4A5D" }}>
              {friendTyping ? "typing…" : "online"}
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="pc-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: BLUSH_BG,
          }}
        >
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              mine={m.senderId === myId}
              isOpen={openReactionFor === m.id}
              onToggleReactions={() => setOpenReactionFor(openReactionFor === m.id ? null : m.id)}
              onReact={(emoji) => addReaction(m, emoji)}
            />
          ))}

          {friendTyping && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <Avatar url={friendProfile?.avatar_url} name={friendProfile?.nickname || "?"} size={26} />
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

        <div
          style={{
            padding: "14px 18px",
            background: "#FFE9F0",
            borderTop: `1px solid ${HEADER_PINK}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/*"
            style={{ display: "none" }}
            onChange={handleVideoPick}
          />
          <IconButton label="Upload video" onClick={() => videoInputRef.current?.click()}>
            <Video size={19} color={ROSE_GOLD} />
          </IconButton>
          <IconButton
            label={recording ? "Stop recording" : "Record voice note"}
            onClick={toggleRecording}
            active={recording}
          >
            {recording ? <Square size={17} color="#fff" fill="#fff" /> : <Mic size={19} color={ROSE_GOLD} />}
          </IconButton>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              broadcastTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Say something sweet…"
            style={{
              flex: 1,
              border: `1px solid ${HEADER_PINK}`,
              borderRadius: 999,
              padding: "11px 18px",
              fontSize: 14,
              outline: "none",
              background: "#fff",
              color: TEXT_DEEP,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => insertMessage()}
            className="pc-icon-btn"
            aria-label="Send message"
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
            <Send size={17} color="#fff" />
          </button>
        </div>
      </main>

      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            color: TEXT_DEEP,
            padding: "9px 18px",
            borderRadius: 999,
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(183,110,121,0.25)",
            border: `1px solid ${HEADER_PINK}`,
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

function MessageBubble({ message, mine, isOpen, onToggleReactions, onReact }) {
  const [pressTimer, setPressTimer] = useState(null);
  const startPress = () => setPressTimer(setTimeout(() => onToggleReactions(), 450));
  const cancelPress = () => pressTimer && clearTimeout(pressTimer);

  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", position: "relative" }}>
      <div style={{ maxWidth: "70%", position: "relative" }}>
        <div
          className="pc-bubble-in"
          onClick={onToggleReactions}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          style={{
            background: BUBBLE_WHITE,
            borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: "11px 15px",
            boxShadow: "0 2px 10px rgba(183,110,121,0.12)",
            border: mine ? "1px solid #FBE1E8" : "1px solid #F5F5F5",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          {!mine && (
            <div style={{ fontSize: 11, fontWeight: 700, color: ROSE_GOLD, marginBottom: 3 }}>
              {message.senderName}
            </div>
          )}
          {message.text && (
            <div style={{ fontSize: 14.5, color: TEXT_DEEP, lineHeight: 1.45, wordBreak: "break-word" }}>
              {message.text}
            </div>
          )}
          {message.videoUrl && (
            <video src={message.videoUrl} controls style={{ marginTop: 8, borderRadius: 12, maxWidth: "100%", display: "block" }} />
          )}
          {message.audioUrl && (
            <audio src={message.audioUrl} controls style={{ marginTop: 8, width: 220 }} />
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 5 }}>
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
              background: "#fff",
              borderRadius: 999,
              padding: "6px 8px",
              display: "flex",
              gap: 6,
              boxShadow: "0 4px 16px rgba(183,110,121,0.25)",
              border: `1px solid ${HEADER_PINK}`,
              zIndex: 5,
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
                onToggleReactions();
              }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_SOFT }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
