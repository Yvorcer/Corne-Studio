// Keeps the Rust overlay poller (src-tauri/src/overlay.rs) in sync with the connected
// keyboard's keymap, layout and the user's overlay settings.
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../state/store";
import { boardBounds, type KeyGeom, type LayoutId } from "./corneLayout";
import { displayName } from "./boards";
import { defaultLayerName, type OverlaySettings } from "./settings";

/** Data the overlay webview needs to draw a layer; passed through Rust untouched. */
export interface OverlayView {
  layoutId: LayoutId;
  layerNames: string[];
  boardName: string;
  /** background opacity, 0.3–1 */
  opacity: number;
}

export interface OverlayConfig {
  enabled: boolean;
  delayMs: number;
  position: OverlaySettings["position"];
  width: number;
  height: number;
  rows: number;
  cols: number;
  keymap: number[][][];
  view: OverlayView;
}

// Must match src/overlay/overlay.css (window margin, card padding, header).
const WIDTH = { s: 640, m: 860, l: 1100 } as const;
const MARGIN = 24;
const CARD_PAD = 18;
const HEADER = 42;
const KEYBOARD_PAD = 0.35; // same as KeyboardView

export function overlaySize(keys: KeyGeom[], size: OverlaySettings["size"]) {
  const b = boardBounds(keys);
  const aspect = (b.height + 2 * KEYBOARD_PAD) / (b.width + 2 * KEYBOARD_PAD);
  const width = WIDTH[size];
  const boardWidth = width - 2 * MARGIN - 2 * CARD_PAD;
  return { width, height: Math.round(2 * MARGIN + 2 * CARD_PAD + HEADER + boardWidth * aspect) };
}

function buildConfig(): OverlayConfig {
  const s = useStore.getState();
  const ready = s.status === "ready" && !!s.detection && s.keymap.length > 0;
  const { width, height } = overlaySize(s.keys, s.overlay.size);
  return {
    enabled: s.overlay.enabled,
    delayMs: s.overlay.delayMs,
    position: s.overlay.position,
    width,
    height,
    rows: s.detection?.board.rows ?? 0,
    cols: s.detection?.board.cols ?? 0,
    keymap: ready ? s.keymap : [],
    view: {
      layoutId: s.layoutId,
      layerNames: Array.from({ length: Math.max(s.layerCount, 1) }, (_, l) => s.layerNames[l] || defaultLayerName(l)),
      boardName: displayName(s.detection, "Corne"),
      opacity: s.overlay.opacity,
    },
  };
}

export function startOverlaySync() {
  let timer: number | undefined;
  let last = "";
  const push = () => {
    const config = buildConfig();
    const json = JSON.stringify(config);
    if (json === last) return;
    last = json;
    invoke("overlay_configure", { config }).catch(() => {});
  };
  push();
  useStore.subscribe((s, prev) => {
    if (
      s.keymap !== prev.keymap ||
      s.keys !== prev.keys ||
      s.status !== prev.status ||
      s.detection !== prev.detection ||
      s.overlay !== prev.overlay ||
      s.layerNames !== prev.layerNames ||
      s.layerCount !== prev.layerCount
    ) {
      clearTimeout(timer);
      timer = window.setTimeout(push, 120);
    }
  });
}

export const previewOverlay = (layer: number) => invoke("overlay_preview", { layer }).catch(() => {});
