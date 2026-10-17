import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { KeyboardView, layerColor } from "../components/KeyboardView";
import { CORNE_KEYS, LAYOUTS, keyId } from "../lib/corneLayout";
import { KC_TRNS } from "../lib/keycodes";
import type { OverlayConfig } from "../lib/overlaySync";
import "../App.css";
import "./overlay.css";

interface LayerEvent {
  layer: number;
  /** bitmask of active layers */
  mask: number;
  pressed: [number, number][];
}

/** Codes to draw for `layer`; transparent keys show what they fall through to (dimmed). */
function effectiveCodes(keymap: number[][][], layer: number, mask: number) {
  const fallthrough = new Set<string>();
  const codes = (keymap[layer] ?? []).map((row, r) =>
    row.map((code, c) => {
      if (code !== KC_TRNS) return code;
      for (let l = layer - 1; l >= 0; l--) {
        if (!(mask & (1 << l)) && l !== 0) continue;
        const below = keymap[l]?.[r]?.[c] ?? 0;
        if (below !== KC_TRNS) {
          fallthrough.add(keyId(r, c));
          return below;
        }
      }
      return code;
    }),
  );
  return { codes, fallthrough };
}

export function OverlayApp() {
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [ev, setEv] = useState<LayerEvent | null>(null);
  const [showId, setShowId] = useState(0);

  useEffect(() => {
    invoke<OverlayConfig>("overlay_get_config").then(setConfig).catch(() => {});
    // flushSync: the window may still be hidden, so render now rather than on the next frame.
    const unlisten = [
      listen<OverlayConfig>("overlay-config", (e) => flushSync(() => setConfig(e.payload))),
      listen<LayerEvent>("overlay-show", (e) =>
        flushSync(() => {
          setEv(e.payload);
          setShowId((n) => n + 1);
        }),
      ),
      listen<LayerEvent>("overlay-update", (e) => flushSync(() => setEv(e.payload))),
      listen("overlay-hide", () => setEv(null)),
    ];
    return () => unlisten.forEach((p) => p.then((f) => f()));
  }, []);

  const drawn = useMemo(() => {
    if (!config || !ev || !config.keymap.length) return null;
    return effectiveCodes(config.keymap, ev.layer, ev.mask);
  }, [config, ev]);

  if (!config || !ev || !drawn) return null;
  const keys = LAYOUTS[config.view.layoutId]?.keys ?? CORNE_KEYS;
  const pressed = new Set(ev.pressed.map(([r, c]) => keyId(r, c)));
  const name = config.view.layerNames[ev.layer] ?? `Layer ${ev.layer}`;

  return (
    <div className="ov-root">
      <div
        className="ov-card"
        key={showId}
        style={{ "--accent": layerColor(ev.layer), "--ov-opacity": config.view.opacity ?? 0.35 } as React.CSSProperties}
      >
        <div className="ov-head">
          <span className="ov-num">{ev.layer}</span>
          <span className="ov-name">{name}</span>
          <span className="ov-board">{config.view.boardName}</span>
        </div>
        <KeyboardView keys={keys} codes={drawn.codes} layer={ev.layer} pressed={pressed} dimmed={drawn.fallthrough} />
      </div>
    </div>
  );
}
