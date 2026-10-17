// Small persisted UI preferences (per machine). Reads/writes never throw.

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`corne-studio.${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(`corne-studio.${key}`, JSON.stringify(value));
  } catch {
    /* non-essential */
  }
}

const DEFAULT_LAYER_NAMES = ["Base", "Lower", "Raise", "Adjust"];
export const defaultLayerName = (l: number) => DEFAULT_LAYER_NAMES[l] ?? `Layer ${l}`;

export function loadLayerNames(): string[] {
  try {
    return JSON.parse(localStorage.getItem("corne-studio.layer-names") ?? "[]");
  } catch {
    return [];
  }
}

export function saveLayerNames(names: string[]) {
  try {
    localStorage.setItem("corne-studio.layer-names", JSON.stringify(names));
  } catch {
    /* non-essential */
  }
}

export interface OverlaySettings {
  enabled: boolean;
  /** Hold a layer this long before the overlay appears */
  delayMs: number;
  position: "bottom" | "center" | "top";
  size: "s" | "m" | "l";
  /** 0.3–1: how solid the overlay's background is (legends always stay fully readable) */
  opacity: number;
}

export const OVERLAY_DEFAULTS: OverlaySettings = { enabled: true, delayMs: 2000, position: "bottom", size: "m", opacity: 0.55 };

/**
 * Overlay settings with migrations: v1 defaulted to a 300 ms delay, which popped the overlay up
 * while typing on a layer; v2 waits for a deliberate 2 s hold.
 */
export function loadOverlaySettings(): OverlaySettings {
  const saved = loadJson<OverlaySettings & { version?: number }>("overlay", { ...OVERLAY_DEFAULTS, version: 2 });
  if ((saved.version ?? 1) < 2 && saved.delayMs === 300) saved.delayMs = OVERLAY_DEFAULTS.delayMs;
  const { version: _version, ...settings } = saved;
  return settings;
}

export function saveOverlaySettings(settings: OverlaySettings) {
  saveJson("overlay", { ...settings, version: 2 });
}
