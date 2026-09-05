import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Register the service worker so push notifications work once permission
// is granted. Safe to call unconditionally — it's a no-op on browsers
// that don't support it (or on iOS until the app is added to Home Screen).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Non-fatal — the app works fine without push, this just means
      // notifications won't be available on this browser/context.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
