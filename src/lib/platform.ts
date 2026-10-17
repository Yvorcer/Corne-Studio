export type Platform = "mac" | "linux";

export function detectPlatform(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): Platform {
  return /Mac|iPhone|iPad/i.test(ua) ? "mac" : "linux";
}

export const PLATFORM: Platform = detectPlatform();
export const isMac = PLATFORM === "mac";
/** Label for the primary shortcut modifier, e.g. "⌘" or "Ctrl+" */
export const primaryMod = isMac ? "⌘" : "Ctrl+";
