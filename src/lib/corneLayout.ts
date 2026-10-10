// Physical geometry of the Corne family (crkbd), drawn per layout.
//
// Finger keys and matrix positions come from QMK `keyboards/crkbd/**/info.json`.
// QMK flattens the thumb cluster into a straight row; here the thumbs get their real
// arc (0°, 15°, 30°, the inner one 1.5u tall) and the halves get a real gap.
// Units are "u" (one key pitch, 19.05 mm). Tweak THUMBS / HALF_GAP to taste.

export interface KeyGeom {
  row: number;
  col: number;
  /** top-left before rotation */
  x: number;
  y: number;
  w: number;
  h: number;
  /** rotation in degrees about the key's own centre (clockwise) */
  r: number;
  side: "left" | "right";
}

/** QMK layout names used by Corne boards. */
export type LayoutId = "split_3x6_3_ex2" | "split_3x5_3_ex2" | "split_3x6_3" | "split_3x5_3";

type LeftKey = Omit<KeyGeom, "side" | "w" | "h" | "r"> & Partial<Pick<KeyGeom, "w" | "h" | "r">>;

// Column stagger from QMK (y offset of each column's top key).
const COLUMN_Y = [0.3, 0.3, 0.1, 0, 0.1, 0.2];

// Thumb cluster: matrix row 3, cols 3..5 (outer → inner).
const THUMBS: LeftKey[] = [
  { row: 3, col: 3, x: 3.95, y: 3.4, r: 0 },
  { row: 3, col: 4, x: 5.1, y: 3.5, r: 15 },
  { row: 3, col: 5, x: 6.42, y: 3.35, h: 1.5, r: 30 },
];

/** Mirror axis between the halves (left half spans x≈0..7.7, set by the thumbs). */
const HALF_GAP = 1.3;
const LEFT_EXTENT = 7.75;
const AXIS = LEFT_EXTENT + HALF_GAP / 2;

function buildKeys(opts: { outerColumn: boolean; innerExtras: boolean }): KeyGeom[] {
  const left: LeftKey[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = opts.outerColumn ? 0 : 1; col < 6; col++) left.push({ row, col, x: col, y: COLUMN_Y[col] + row });
  }
  // The two v4 "ex2" keys on the inner column (matrix col 6).
  if (opts.innerExtras) {
    left.push({ row: 0, col: 6, x: 6, y: 0.7 });
    left.push({ row: 1, col: 6, x: 6, y: 1.7 });
  }
  left.push(...THUMBS);

  // Right-half matrix rows are offset by 4 (rows 4..7) with the same column numbering.
  return [
    ...left.map((k) => ({ w: 1, h: 1, r: 0, ...k, side: "left" as const })),
    ...left.map((k) => {
      const w = k.w ?? 1;
      return { row: k.row + 4, col: k.col, x: 2 * AXIS - k.x - w, y: k.y, w, h: k.h ?? 1, r: -(k.r ?? 0), side: "right" as const };
    }),
  ];
}

export interface LayoutDef {
  id: LayoutId;
  name: string;
  keys: KeyGeom[];
}

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  split_3x6_3_ex2: { id: "split_3x6_3_ex2", name: "46 keys (3×6+3, v4 inner keys)", keys: buildKeys({ outerColumn: true, innerExtras: true }) },
  split_3x5_3_ex2: { id: "split_3x5_3_ex2", name: "40 keys (3×5+3, v4 inner keys)", keys: buildKeys({ outerColumn: false, innerExtras: true }) },
  split_3x6_3: { id: "split_3x6_3", name: "42 keys (3×6+3)", keys: buildKeys({ outerColumn: true, innerExtras: false }) },
  split_3x5_3: { id: "split_3x5_3", name: "36 keys (3×5+3)", keys: buildKeys({ outerColumn: false, innerExtras: false }) },
};

/** The Corne v4 layout; used when nothing is connected yet (and by the icon generator). */
export const CORNE_KEYS: KeyGeom[] = LAYOUTS.split_3x6_3_ex2.keys;

export const keyId = (row: number, col: number) => `${row},${col}`;

/** Bounding box of the whole board including rotated keys, in u. */
export function boardBounds(keys: KeyGeom[] = CORNE_KEYS) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of keys) {
    for (const [px, py] of keyCorners(k)) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function keyCorners(k: KeyGeom): [number, number][] {
  const cx = k.x + k.w / 2;
  const cy = k.y + k.h / 2;
  const a = (k.r * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-k.w / 2, -k.h / 2],
    [k.w / 2, -k.h / 2],
    [k.w / 2, k.h / 2],
    [-k.w / 2, k.h / 2],
  ].map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
}
