// Known Corne-family keyboards that speak VIA, and how to recognise them.
// USB IDs and matrix sizes come from QMK `keyboards/crkbd/**` and the VIA keyboard definitions.

import type { LayoutId } from "./corneLayout";

export interface BoardDef {
  id: string;
  name: string;
  maker: string;
  /** USB vendor/product IDs this board enumerates with */
  usb: { vid: number; pid: number }[];
  /** VIA matrix size (both halves) */
  rows: number;
  cols: number;
  /** Physical layouts this PCB can be built as; the first is the default */
  layouts: LayoutId[];
  /** Human revision from the USB device release number (bcdDevice), if it distinguishes PCB revisions */
  revision?: (release: number) => string | undefined;
  notes?: string;
}

export const BOARDS: BoardDef[] = [
  {
    id: "corne-v4",
    name: "Corne v4",
    maker: "foostan",
    usb: [{ vid: 0x4653, pid: 0x0004 }],
    rows: 8,
    cols: 7,
    layouts: ["split_3x6_3_ex2"],
    // QMK sets device_version 4.0.0 / 4.1.0 → bcdDevice 0x0400 / 0x0410
    revision: (rel) => (rel >> 8 === 4 ? `v4.${(rel >> 4) & 0xf}` : undefined),
    notes: "RP2040, hot-swap, 46 keys including the two inner keys.",
  },
  {
    id: "corne-v4-mini",
    name: "Corne v4 mini",
    maker: "foostan",
    usb: [{ vid: 0x4653, pid: 0x0104 }],
    rows: 8,
    cols: 7,
    layouts: ["split_3x5_3_ex2"],
    revision: (rel) => (rel >> 8 === 4 ? `v4.${(rel >> 4) & 0xf}` : undefined),
    notes: "5-column v4 with the two inner keys, 40 keys.",
  },
  {
    id: "corne-classic",
    name: "Corne (v1–v3)",
    maker: "foostan",
    usb: [{ vid: 0x4653, pid: 0x0001 }],
    rows: 8,
    cols: 6,
    layouts: ["split_3x6_3", "split_3x5_3"],
    notes: "Pro Micro–based Corne Cherry / Chocolate / LP (rev1, r2g). Built with 6 or 5 columns.",
  },
  {
    id: "mechboards-crkbd-pro",
    name: "CRKBD Pro",
    maker: "Mechboards",
    usb: [{ vid: 0x7171, pid: 0x0003 }],
    rows: 8,
    cols: 6,
    layouts: ["split_3x6_3", "split_3x5_3"],
  },
  {
    id: "boardsource-unicorne",
    name: "Unicorne",
    maker: "Boardsource",
    usb: [{ vid: 0x4273, pid: 0x7563 }],
    rows: 8,
    cols: 6,
    layouts: ["split_3x6_3", "split_3x5_3"],
  },
];

export const boardById = (id: string | undefined) => BOARDS.find((b) => b.id === id);

export interface DeviceIds {
  vendorId: number;
  productId: number;
  release?: number;
}

export interface Detection {
  board: BoardDef;
  revision?: string;
  /** "usb" = recognised by its USB IDs, "manual" = the user told us */
  source: "usb" | "manual";
}

/** Recognise a board by its USB IDs. */
export function detectBoard(dev: DeviceIds): Detection | undefined {
  const board = BOARDS.find((b) => b.usb.some((u) => u.vid === dev.vendorId && u.pid === dev.productId));
  if (!board) return undefined;
  return { board, revision: dev.release !== undefined ? board.revision?.(dev.release) : undefined, source: "usb" };
}

/** Sort candidate devices so recognised Cornes come first (newest boards first). */
export function rankDevices<T extends DeviceIds>(devices: T[]): T[] {
  const score = (d: T) => {
    const i = BOARDS.findIndex((b) => b.usb.some((u) => u.vid === d.vendorId && u.pid === d.productId));
    return i === -1 ? BOARDS.length : i;
  };
  return [...devices].sort((a, b) => score(a) - score(b));
}

export const deviceKey = (dev: DeviceIds) =>
  `${dev.vendorId.toString(16).padStart(4, "0")}:${dev.productId.toString(16).padStart(4, "0")}`;

export function displayName(d: Detection | undefined, fallback = "Keyboard"): string {
  if (!d) return fallback;
  if (d.revision && d.board.id.startsWith("corne-v4")) return d.board.name.replace("v4", d.revision);
  return d.board.maker === "foostan" ? d.board.name : `${d.board.maker} ${d.board.name}`;
}
