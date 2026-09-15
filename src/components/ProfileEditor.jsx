import React from "react";
import { Camera } from "lucide-react";
import { ROSE_GOLD, HEADER_PINK, TEXT_SOFT, TEXT_DEEP } from "../theme/tokens";
import Avatar from "./ui/Avatar";

export default function ProfileEditor({ label, nickname, avatarUrl, onNicknameChange, onAvatarClick }) {
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
            border: "2px solid rgba(255,255,255,0.8)",
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
