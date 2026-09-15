// Single source of truth for the app's visual language — "Liquid Glass,
// in pink". Change a color or the blur amount here and it propagates
// everywhere, instead of hunting through dozens of inline style objects.

// ---- Core palette ----
export const ROSE_GOLD = "#B76E79";
export const HEADER_PINK = "#FFB6C1";
export const TEXT_DEEP = "#6B4A57";
export const TEXT_SOFT = "#A8828F";
export const READ_PINK = "#F49AC2";

// ---- The canvas: rich rose-to-magenta gradient the glass floats over ----
export const APP_GRADIENT = "linear-gradient(160deg, #FFD9E6 0%, #F6B9D6 45%, #E8A7C8 100%)";

// ---- Glass surface system ----
// Applied to *chrome* only (header, sidebar, composer, modals) — never to
// individual message bubbles. Stacking a blur layer per bubble is a real
// performance cost on long histories / lower-end phones; bubbles instead
// use plain semi-transparency (see MessageBubble) for the same "glass"
// read at a fraction of the GPU cost.
export const GLASS_BG = "rgba(255,255,255,0.38)";
export const GLASS_BG_STRONG = "rgba(255,255,255,0.62)"; // modals, over busy content
export const GLASS_BORDER = "1px solid rgba(255,255,255,0.65)";
export const GLASS_BLUR = "blur(22px) saturate(160%)";

// React inline-style helper — spreads directly into a style object.
// Includes the -webkit- prefix Safari still requires.
export const glassStyle = (strong = false) => ({
  background: strong ? GLASS_BG_STRONG : GLASS_BG,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  border: GLASS_BORDER,
});

// ---- Message bubbles: semi-transparent, no blur (perf) ----
export const BUBBLE_MINE_BG = "rgba(183,110,121,0.85)"; // rose glass, sent
export const BUBBLE_MINE_TEXT = "#FFFFFF";
export const BUBBLE_THEIRS_BG = "rgba(255,255,255,0.72)"; // cool glass, received
export const BUBBLE_THEIRS_TEXT = TEXT_DEEP;

// ---- Typography ----
export const FONT_DISPLAY = "'Fraunces', Georgia, serif"; // headers, italic moments
export const FONT_BODY = "'Outfit', 'Quicksand', sans-serif"; // everything else

export const REACTIONS = ["💖", "✨", "😭"]; // quick-tap favorites, shown first
export const EMOJI_GRID = [
  "💖", "✨", "😭", "😍", "🥹", "😂", "🤣", "🙈",
  "🥺", "😘", "🫶", "💅", "👑", "🎀", "🌸", "🌷",
  "🍒", "🧁", "🍓", "🦋", "⭐️", "🔥", "💯", "🙌",
  "👏", "😅", "😊", "🥰", "😌", "🤍", "💗", "💞",
];

// Default reaction bar, as unified emoji IDs (required format for
// emoji-picker-react's `reactions` prop) — matches WhatsApp's own
// default set exactly: 👍 ❤️ 😂 😮 😢 🙏
export const WHATSAPP_REACTIONS = ["1f44d", "2764-fe0f", "1f602", "1f62e", "1f622", "1f64f"];

// ---- Shared CSS (drifting orbs, animations, responsive rules) ----
// Rendered once via a top-level <style>{GLOBAL_STYLES}</style>.
export const GLOBAL_STYLES = `
  @keyframes pcOrbDrift {
    0%   { transform: translate(0, 0) scale(1); }
    50%  { transform: translate(3%, -4%) scale(1.08); }
    100% { transform: translate(0, 0) scale(1); }
  }
  .pc-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.55;
    animation: pcOrbDrift 14s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes pcFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pcSlideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pcBlink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }

  .pc-card-in { animation: pcSlideUp .35s cubic-bezier(.22,1,.36,1); }
  .pc-bubble-in { animation: pcFadeIn .18s ease; }
  .pc-dot { animation: pcBlink 1.2s infinite; }

  .pc-icon-btn { transition: transform .15s ease, background .15s ease; }
  .pc-icon-btn:hover { transform: scale(1.08); }
  .pc-icon-btn:active { transform: scale(0.94); }

  .pc-room-btn { transition: background .15s ease; }
  .pc-room-btn:hover { background: rgba(255,255,255,0.4) !important; }
  .pc-invite-btn { transition: background .15s ease, color .15s ease; border-radius: 50%; }
  .pc-invite-btn:hover { background: rgba(183,110,121,0.15) !important; color: ${ROSE_GOLD} !important; }

  .pc-drawer-backdrop { animation: pcFadeIn .2s ease; }
  .pc-drawer { transition: transform .28s cubic-bezier(.32,.72,0,1); }
  .pc-modal-backdrop { animation: pcFadeIn .18s ease; }
  .pc-links-panel { transition: transform .28s cubic-bezier(.32,.72,0,1); }

  @keyframes pcShake { 10%,90% { transform: translateX(-1px); } 20%,80% { transform: translateX(2px); } 30%,50%,70% { transform: translateX(-4px); } 40%,60% { transform: translateX(4px); } }
  @keyframes pcPopIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  .auth-shake { animation: pcShake .45s ease; }
  .otp-box {
    width: 46px; height: 56px; text-align: center; font-size: 22px; font-weight: 700;
    border-radius: 14px; border: 1.5px solid rgba(255,255,255,0.7); outline: none; color: ${TEXT_DEEP};
    background: rgba(255,255,255,0.45);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    transition: border-color .18s ease, box-shadow .18s ease, transform .12s ease;
  }
  .otp-box:focus { border-color: ${ROSE_GOLD}; box-shadow: 0 0 0 4px rgba(183,110,121,0.15); transform: translateY(-1px); }
  .auth-btn { transition: transform .15s ease, box-shadow .15s ease; }
  .auth-btn:active { transform: scale(0.97); }
  .auth-btn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(183,110,121,0.3); }

  /* ---- emoji-picker-react re-skin ----
     Root selector and these six variable names are confirmed from the
     library's own docs — everything else here is plain CSS on that same
     confirmed root class, not invented variable names. */
  .EmojiPickerReact {
    --epr-bg-color: rgba(255,255,255,0.92);
    --epr-category-label-bg-color: rgba(255,255,255,0.92);
    --epr-text-color: ${TEXT_DEEP};
    --epr-hover-bg-color: rgba(183,110,121,0.18);
    --epr-emoji-size: 24px;
    --epr-emoji-gap: 6px;
    border-radius: 20px !important;
    border: 1px solid rgba(255,255,255,0.75) !important;
    box-shadow: 0 14px 40px rgba(140,60,90,0.25) !important;
    font-family: 'Outfit','Quicksand',sans-serif !important;
  }

  /* ---- Chromebook / desktop: dock the sidebar permanently ---- */
  @media (min-width: 860px) {
    .pc-app-shell { flex-direction: row !important; }
    .pc-drawer {
      position: static !important;
      transform: none !important;
      width: 320px !important;
      max-width: 320px !important;
      min-width: 320px !important;
      height: 100% !important;
      order: -1;
      border-right: ${GLASS_BORDER};
      border-radius: 0 !important;
    }
    .pc-drawer-backdrop { display: none !important; }
    .pc-menu-btn { display: none !important; }
    .pc-drawer-close { display: none !important; }
    .pc-main { min-width: 0; }
  }
`;
