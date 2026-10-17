import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import { setModStyle } from "./lib/keycodes";
import { PLATFORM } from "./lib/platform";
import { startOverlaySync } from "./lib/overlaySync";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./state/store";

setModStyle(PLATFORM);

// The same bundle serves the main window and the floating layer overlay (index.html?overlay=1).
const isOverlay = new URLSearchParams(location.search).has("overlay");
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (isOverlay) {
  root.render(<OverlayApp />);
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  startOverlaySync();
  // "Layer overlay" toggled from the menu-bar icon: keep the setting in sync.
  listen<boolean>("overlay-toggled", (e) => useStore.getState().setOverlay({ enabled: e.payload }));
}
