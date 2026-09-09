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
        gap: 8,
        position: "relative",
        borderRadius: 14,
      }}
    >
      {!mine && <Avatar url={avatarUrl} name={displayName} size={28} />}
      <div style={{ maxWidth: "78%", position: "relative" }}>
        <div
          className={`pc-bubble-in ${mine ? "pc-bubble-tail-mine" : "pc-bubble-tail-theirs"}`}
          onClick={onToggleMenu}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          style={{
            background: mine ? "linear-gradient(135deg, #B76E79, #E8B4BE)" : "linear-gradient(135deg, #FFFFFF 0%, #FFF5F8 100%)",
            borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: message.imageUrl || message.videoUrl ? 6 : "12px 16px",
            boxShadow: mine ? "0 4px 15px rgba(183,110,121,0.3)" : "0 4px 15px rgba(183,110,121,0.1)",
            border: mine ? "none" : "1px solid #F5F5F5",
            cursor: "pointer",
            userSelect: "none",
            position: "relative",
          }}
        >
          {!mine && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: ROSE_GOLD,
                marginBottom: 3,
                marginLeft: message.imageUrl || message.videoUrl ? 9 : 0,
                marginTop: message.imageUrl || message.videoUrl ? 6 : 0,
                fontFamily: "'Cormorant Garamond',serif",
                fontStyle: "italic",
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
                background: mine ? "rgba(255,255,255,0.2)" : "#FFF5F8",
                borderLeft: `3px solid ${mine ? "#FFD9E4" : ROSE_GOLD}`,
                borderRadius: 8,
                padding: "6px 10px",
                marginBottom: 6,
                marginLeft: message.imageUrl || message.videoUrl ? 9 : 0,
                marginRight: message.imageUrl || message.videoUrl ? 9 : 0,
                marginTop: message.imageUrl || message.videoUrl ? 6 : 0,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: mine ? "#FFD9E4" : ROSE_GOLD }}>
                {message.replyToSender}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: mine ? "#FFE4EC" : TEXT_SOFT,
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
                fontSize: 15,
                color: mine ? "#FFFFFF" : TEXT_DEEP,
                lineHeight: 1.5,
                wordBreak: "break-word",
                padding: message.imageUrl || message.videoUrl ? "8px 9px 0" : 0,
                fontWeight: mine ? 500 : 400,
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
              gap: 5,
              marginTop: 5,
              padding: message.imageUrl || message.videoUrl ? "0 9px 6px" : 0,
            }}
          >
            {message.edited && (
              <span style={{ fontSize: 10, color: mine ? "#FFD9E4" : TEXT_SOFT, fontStyle: "italic" }}>edited</span>
            )}
            <span style={{ fontSize: 11, color: mine ? "#FFE4EC" : TEXT_SOFT }}>{fmtTime(message.timestamp)}</span>
            {mine && (message.read ? <CheckCheck size={14} color="#FFFFFF" /> : <Check size={14} color="#FFD9E4" />)}
          </div>
        </div>

        {message.reactions.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: -14,
              [mine ? "right" : "left"]: 10,
              background: "#fff",
              borderRadius: 999,
              padding: "3px 8px",
              fontSize: 13,
              boxShadow: "0 4px 12px rgba(183,110,121,0.2)",
              border: "1px solid #FFD9E4",
            }}
          >
            {message.reactions.join(" ")}
          </div>
        )}

        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: -50,
              [mine ? "right" : "left"]: 0,
              zIndex: 5,
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(4px)",
                borderRadius: 999,
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 8px 30px rgba(183,110,121,0.25)",
                border: "1px solid #FFD9E4",
              }}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
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
                  fontSize: 16,
                  fontWeight: 700,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
              <div style={{ width: 1, height: 20, background: "#F0DCE2" }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply();
                }}
                aria-label="Reply"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: ROSE_GOLD, display: "flex" }}
              >
                <Reply size={16} />
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
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnsend();
                    }}
                    aria-label="Unsend message"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#E24B7A", display: "flex" }}
                  >
                    <Trash2 size={16} />
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
                <X size={14} />
              </button>
            </div>

            {showFullPicker && (
              <div
                className="pc-bubble-in"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 46,
                  [mine ? "right" : "left"]: 0,
                  background: "#fff",
                  borderRadius: 16,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 3,
                  width: 260,
                  boxShadow: "0 8px 30px rgba(183,110,121,0.25)",
                  border: "1px solid #FFD9E4",
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
                      fontSize: 20,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 5,
                      borderRadius: 10,
                      transition: "background 0.15s",
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