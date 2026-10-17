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
  /** 0.1–1: strength of the dark tint over the blurred background */
  opacity: number;
}

export const OVERLAY_DEFAULTS: OverlaySettings = { enabled: true, delayMs: 1000, position: "bottom", size: "m", opacity: 0.35 };

const SETTINGS_VERSION = 3;

/**
 * Overlay settings, migrating earlier defaults the user never changed:
 * v1 → 300 ms delay (popped up while typing), v2 → 2 s (too slow), v3 → 1 s.
 * v3 also blurs the desktop natively, so the tint (opacity) can be lighter than v2's 55%.
 */
export function loadOverlaySettings(): OverlaySettings {
  const saved = loadJson<OverlaySettings & { version?: number }>("overlay", { ...OVERLAY_DEFAULTS, version: SETTINGS_VERSION });
  const version = saved.version ?? 1;
  if (version < SETTINGS_VERSION && (saved.delayMs === 300 || saved.delayMs === 2000)) saved.delayMs = OVERLAY_DEFAULTS.delayMs;
  if (version < SETTINGS_VERSION && saved.opacity === 0.55) saved.opacity = OVERLAY_DEFAULTS.opacity;
  const { version: _version, ...settings } = saved;
  return settings;
}

export function saveOverlaySettings(settings: OverlaySettings) {
  saveJson("overlay", { ...settings, version: SETTINGS_VERSION });
}
