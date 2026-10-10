import type { Keymap } from "./via";
import type { LayoutId } from "./corneLayout";

export const PROFILE_FORMAT = "corne-studio-profile";
export const ORIGINAL_BACKUP_ID = "original-backup";

export interface Profile {
  format: typeof PROFILE_FORMAT;
  version: 1;
  name: string;
  createdAt: string;
  device: { vendorId: number; productId: number; product: string };
  /** Board id from src/lib/boards.ts and the layout it was drawn with (absent in early profiles) */
  board?: string;
  layout?: LayoutId;
  viaProtocol: number;
  /** keymap[layer][row][col] as 16-bit QMK keycodes */
  keymap: Keymap;
  /** Raw VIA macro buffer bytes (null-terminated macros), exact round-trip */
  macroBytes: number[];
}

export function makeProfile(p: Omit<Profile, "format" | "version" | "createdAt">): Profile {
  return { format: PROFILE_FORMAT, version: 1, createdAt: new Date().toISOString(), ...p };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "profile"
  );
}

/** Validate untrusted JSON (imported files) and return a Profile or throw a readable error. */
export function parseProfile(json: string): Profile {
  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    throw new Error("File is not valid JSON");
  }
  const o = p as Partial<Profile>;
  if (o?.format !== PROFILE_FORMAT) throw new Error("Not a Corne Studio profile");
  const isCode = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffff;
  if (
    !Array.isArray(o.keymap) ||
    !o.keymap.every((l) => Array.isArray(l) && l.every((r) => Array.isArray(r) && r.every(isCode)))
  )
    throw new Error("Profile keymap is malformed");
  if (!Array.isArray(o.macroBytes) || !o.macroBytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255))
    throw new Error("Profile macros are malformed");
  return o as Profile;
}

/**
 * Fit a profile's keymap onto the connected board's current keymap. Corne revisions share
 * matrix positions (row r, col c is the same key on v3 and v4), so positions are copied
 * one-to-one; positions the profile doesn't have (e.g. the v4 inner keys when applying a
 * v3 profile) keep their current assignment, and extra layers/positions are dropped.
 */
export function fitKeymap(km: Keymap, current: Keymap): Keymap {
  return current.map((layer, l) => layer.map((row, r) => row.map((code, c) => km[l]?.[r]?.[c] ?? code)));
}
