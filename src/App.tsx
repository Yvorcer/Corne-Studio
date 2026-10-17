import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore, type View } from "./state/store";
import { KeyboardView, layerColor } from "./components/KeyboardView";
import { KeyPicker } from "./components/KeyPicker";
import { MacroEditor } from "./components/MacroEditor";
import { KeyTester } from "./components/KeyTester";
import { Profiles } from "./components/Profiles";
import { decode } from "./lib/keycodes";
import { BOARDS, deviceKey, displayName, rankDevices } from "./lib/boards";
import { LAYOUTS } from "./lib/corneLayout";
import { isMac, primaryMod } from "./lib/platform";
import { defaultLayerName } from "./lib/settings";
import { OverlaySettingsView } from "./components/OverlaySettings";
import appIcon from "./assets/app-icon.svg";
import "./App.css";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "keymap", label: "Keymap", icon: "⌨" },
  { id: "macros", label: "Macros", icon: "⚡" },
  { id: "tester", label: "Key tester", icon: "◉" },
  { id: "profiles", label: "Profiles", icon: "⧉" },
  { id: "overlay", label: "Layer overlay", icon: "◫" },
];


export default function App() {
  const s = useStore();

  useEffect(() => {
    s.connect();
    const unlisten = [
      listen("device-attached", () => useStore.getState().connect()),
      listen("device-detached", () => useStore.getState().markDisconnected()),
    ];
    return () => unlisten.forEach((p) => p.then((f) => f()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Shift+Z elsewhere) for undo/redo of key changes, Esc to deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.view !== "keymap" || (e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (e.key === "Escape") {
        st.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="drag" data-tauri-drag-region />
        <div className="brand">
          <img className="brand-mark" src={appIcon} alt="" />
          <div>
            <strong>Corne Studio</strong>
            <span className="muted small">
              {s.detection ? `${displayName(s.detection)} · ${s.keys.length} keys` : "for the Corne family"}
            </span>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav ${s.view === n.id ? "active" : ""}`} onClick={() => s.setView(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <span className="grow" />
        <DeviceStatus />
      </aside>

      <main className="main">
        <div className="drag top" data-tauri-drag-region />
        {s.status === "ready" && !s.detection ? (
          <BoardPicker />
        ) : s.status === "ready" ? (
          <>
            {s.view === "keymap" && <KeymapView />}
            {s.view === "macros" && <MacroEditor />}
            {s.view === "tester" && <KeyTester />}
            {s.view === "profiles" && <Profiles />}
            {s.view === "overlay" && <OverlaySettingsView />}
          </>
        ) : (
          <ConnectScreen />
        )}
      </main>

      <div className="toasts">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceStatus() {
  const { status, device, devices, detection, layoutId, protocol, busy, connect, setLayout } = useStore();
  const ready = status === "ready";
  const title = ready ? displayName(detection, device?.product || "Keyboard") : status === "connecting" ? "Connecting…" : "Not connected";
  const sub = ready
    ? detection
      ? `${detection.source === "usb" ? "Auto-detected" : "Chosen manually"} · VIA ${protocol}${busy ? " · syncing…" : ""}`
      : "Unrecognised keyboard"
    : "Plug in your Corne";
  return (
    <div className={`device ${status}`}>
      <div className="device-row">
        <span className="dot" />
        <div className="device-text">
          <strong>{title}</strong>
          <span className="muted small">{sub}</span>
        </div>
        {!ready && status !== "connecting" && (
          <button className="small" onClick={() => connect()}>
            Retry
          </button>
        )}
      </div>
      {ready && detection && detection.board.layouts.length > 1 && (
        <label className="device-field" title="Same PCB and firmware can be built with 6 or 5 columns">
          <span className="muted small">Layout</span>
          <select value={layoutId} onChange={(e) => setLayout(e.target.value as typeof layoutId)}>
            {detection.board.layouts.map((l) => (
              <option key={l} value={l}>
                {LAYOUTS[l].name}
              </option>
            ))}
          </select>
        </label>
      )}
      {devices.length > 1 && (
        <label className="device-field">
          <span className="muted small">Keyboard</span>
          <select value={device?.path} onChange={(e) => connect(e.target.value)}>
            {rankDevices(devices).map((d) => (
              <option key={d.path} value={d.path}>
                {d.product || deviceKey(d)} ({deviceKey(d)})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Shown when a VIA keyboard is connected that we don't recognise by its USB IDs. */
function BoardPicker() {
  const { device, chooseBoard } = useStore();
  return (
    <div className="board-picker">
      <h2>Which Corne is this?</h2>
      <p className="muted">
        <strong>{device?.product || "This keyboard"}</strong> {device?.manufacturer ? `by ${device.manufacturer} ` : ""}(USB{" "}
        {device ? deviceKey(device) : "?"}) speaks VIA, but its USB IDs aren't in Corne Studio's list. If it's a Corne or a
        Corne clone, pick the board it's based on. Corne Studio remembers your choice for this keyboard.
      </p>
      <div className="board-grid">
        {BOARDS.map((b) => (
          <button key={b.id} className="board-card" onClick={() => chooseBoard(b.id)}>
            <KeyboardView keys={LAYOUTS[b.layouts[0]].keys} layer={0} />
            <strong>{b.maker === "foostan" ? b.name : `${b.maker} ${b.name}`}</strong>
            <span className="muted small">
              {LAYOUTS[b.layouts[0]].keys.length} keys · {b.rows}×{b.cols} matrix
            </span>
          </button>
        ))}
      </div>
      <p className="muted small">
        Not a Corne? Corne Studio only draws Corne layouts. For other VIA keyboards, use VIA or Remap.
      </p>
    </div>
  );
}

function ConnectScreen() {
  const { status, error, connect } = useStore();
  return (
    <div className="empty">
      <div className="empty-art">
        <KeyboardView layer={0} />
      </div>
      <h2>{status === "connecting" ? "Connecting to your Corne…" : "Plug in your Corne"}</h2>
      <p className="muted">
        Connect the left half (or either half) by USB-C. Corne Studio talks to the keyboard directly, so changes apply
        instantly and are saved on the keyboard. No flashing needed.
      </p>
      {error && <p className="error">{error}</p>}
      {status !== "connecting" && (
        <button className="primary" onClick={() => connect()}>
          Connect
        </button>
      )}
    </div>
  );
}

function KeymapView() {
  const {
    keymap,
    keys,
    layer,
    layerCount,
    selected,
    setLayer,
    select,
    undo,
    redo,
    undoStack,
    redoStack,
    reload,
    busy,
    layerNames: names,
    renameLayer,
    capturing,
    setCapturing,
  } = useStore();
  const [editing, setEditing] = useState<number | null>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);



  const hoverCode = hover ? keymap[layer]?.[hover.row]?.[hover.col] : undefined;

  return (
    <div className="keymap">
      <header className="layer-bar">
        <div className="layers">
          {Array.from({ length: layerCount }, (_, l) => (
            <button
              key={l}
              className={`layer ${layer === l ? "active" : ""}`}
              style={{ "--accent": layerColor(l) } as React.CSSProperties}
              onClick={() => setLayer(l)}
              onDoubleClick={() => setEditing(l)}
              title="Double-click to rename"
            >
              <span className="layer-num">{l}</span>
              {editing === l ? (
                <input
                  autoFocus
                  defaultValue={names[l] ?? ""}
                  onBlur={(e) => {
                    renameLayer(l, e.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span>{names[l] || defaultLayerName(l)}</span>
              )}
            </button>
          ))}
        </div>
        <span className="grow" />
        <button className="icon" disabled={!undoStack.length} onClick={undo} title={`Undo (${primaryMod}Z)`}>↶</button>
        <button className="icon" disabled={!redoStack.length} onClick={redo} title={`Redo (${isMac ? "⇧⌘Z" : "Ctrl+Shift+Z"})`}>↷</button>
        <button className="icon" disabled={busy} onClick={reload} title="Re-read keymap from keyboard">⟳</button>
      </header>

      <div className="board-wrap" onClick={(e) => e.target === e.currentTarget && select(null)}>
        <KeyboardView
          keys={keys}
          codes={keymap[layer]}
          layer={layer}
          selected={selected}
          onSelect={select}
          onActivate={(k) => {
            select(k);
            setCapturing(true);
          }}
          capturing={capturing}
          onHover={setHover}
        />
        <div className="hover-info">
          {capturing && selected ? (
            <span className="capture-hint">
              Type the key you want on key {selected.row},{selected.col}… <span className="muted">(click anywhere to cancel)</span>
            </span>
          ) : hoverCode !== undefined ? (
            <>
              <code>{decode(hoverCode).name}</code> <span className="muted">· matrix {hover!.row},{hover!.col}</span>
            </>
          ) : (
            <span className="muted">Changes are written to the keyboard instantly. Double-click a key, then type, to change it fast.</span>
          )}
        </div>
      </div>

      <KeyPicker />
    </div>
  );
}

