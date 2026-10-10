export type Platform = "mac" | "windows" | "linux";

export function detectPlatform(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): Platform {
  if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "linux";
}

export const PLATFORM: Platform = detectPlatform();
export const isMac = PLATFORM === "mac";
/** Label for the primary shortcut modifier, e.g. "⌘" or "Ctrl+" */
export const primaryMod = isMac ? "⌘" : "Ctrl+";
