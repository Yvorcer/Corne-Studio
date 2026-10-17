import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import { setModStyle } from "./lib/keycodes";
import { PLATFORM } from "./lib/platform";
import { startOverlaySync } from "./lib/overlaySync";

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
}
