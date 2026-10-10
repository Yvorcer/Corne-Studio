import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setModStyle } from "./lib/keycodes";
import { PLATFORM } from "./lib/platform";

setModStyle(PLATFORM);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
