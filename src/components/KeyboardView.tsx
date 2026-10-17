import { memo, useMemo } from "react";
import { CORNE_KEYS, boardBounds, keyId, type KeyGeom } from "../lib/corneLayout";
import { decode, KC_NO, KC_TRNS, type Decoded } from "../lib/keycodes";

export const LAYER_COLORS = ["#7aa2ff", "#4fd1c5", "#f6ad55", "#f687b3", "#b794f4", "#68d391", "#fc8181", "#90cdf4"];
export const layerColor = (l: number) => LAYER_COLORS[l % LAYER_COLORS.length];

const U = 64; // px per key unit at viewBox scale
const GAP = 4;
const PAD = 0.35;

interface Props {
  /** Physical keys to draw (defaults to the Corne v4) */
  keys?: KeyGeom[];
  /** codes[row][col] for the layer being shown */
  codes?: number[][];
  layer: number;
  selected?: { row: number; col: number } | null;
  pressed?: Set<string>;
  tested?: Set<string>;
  /** Keys drawn dimmed (e.g. transparent keys showing what they fall through to) */
  dimmed?: Set<string>;
  onSelect?: (k: { row: number; col: number }) => void;
  /** Double-click on a key */
  onActivate?: (k: { row: number; col: number }) => void;
  /** The selected key is waiting for a key press to be assigned */
  capturing?: boolean;
  onHover?: (k: { row: number; col: number } | null) => void;
  /** Dim everything except tested/pressed (tester mode) */
  testerMode?: boolean;
}

export const KeyboardView = memo(function KeyboardView({
  keys = CORNE_KEYS,
  codes,
  layer,
  selected,
  pressed,
  tested,
  dimmed,
  onSelect,
  onActivate,
  capturing,
  onHover,
  testerMode,
}: Props) {
  const vb = useMemo(() => {
    const b = boardBounds(keys);
    return [(b.minX - PAD) * U, (b.minY - PAD) * U, (b.width + PAD * 2) * U, (b.height + PAD * 2) * U].join(" ");
  }, [keys]);
  return (
    <svg className="board" viewBox={vb} role="group" aria-label="Corne keyboard">
      <defs>
        <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cap-top)" />
          <stop offset="1" stopColor="var(--cap-bottom)" />
        </linearGradient>
      </defs>
      {keys.map((k) => {
        const id = keyId(k.row, k.col);
        const code = codes?.[k.row]?.[k.col];
        return (
          <Keycap
            key={id}
            k={k}
            d={code === undefined ? undefined : decode(code)}
            layer={layer}
            isSelected={selected?.row === k.row && selected?.col === k.col}
            isPressed={pressed?.has(id) ?? false}
            isTested={tested?.has(id) ?? false}
            isDimmed={dimmed?.has(id) ?? false}
            testerMode={testerMode}
            onSelect={onSelect}
            onActivate={onActivate}
            isCapturing={!!capturing && selected?.row === k.row && selected?.col === k.col}
            onHover={onHover}
          />
        );
      })}
    </svg>
  );
});

interface CapProps {
  k: KeyGeom;
  d?: Decoded;
  layer: number;
  isSelected: boolean;
  isPressed: boolean;
  isTested: boolean;
  isDimmed: boolean;
  testerMode?: boolean;
  onSelect?: Props["onSelect"];
  onActivate?: Props["onActivate"];
  isCapturing?: boolean;
  onHover?: Props["onHover"];
}

function legendSize(label: string, w: number): number {
  const len = [...label].length;
  const base = len <= 1 ? 22 : len <= 2 ? 18 : len <= 4 ? 14 : len <= 6 ? 12 : 10;
  return base * Math.min(1, w);
}

function Keycap({ k, d, layer, isSelected, isPressed, isTested, isDimmed, isCapturing, testerMode, onSelect, onActivate, onHover }: CapProps) {
  const x = k.x * U + GAP / 2;
  const y = k.y * U + GAP / 2;
  const w = k.w * U - GAP;
  const h = k.h * U - GAP;
  const cx = (k.x + k.w / 2) * U;
  const cy = (k.y + k.h / 2) * U;

  const isTrns = d?.code === KC_TRNS;
  const isNone = d?.code === KC_NO;
  const accent = d?.layer !== undefined ? layerColor(d.layer) : undefined;
  const classes = [
    "cap",
    isSelected && "selected",
    isCapturing && "capturing",
    isPressed && "pressed",
    testerMode && isTested && "tested",
    isTrns && "trns",
    isNone && "none",
    isDimmed && "dim",
    d?.kind === "macro" && "macro",
  ]
    .filter(Boolean)
    .join(" ");

  const label = d?.label ?? "";
  const hold = d?.hold;
  const fs = legendSize(label, k.w);
  return (
    <g
      className={classes}
      onClick={() => onSelect?.({ row: k.row, col: k.col })}
      onDoubleClick={() => onActivate?.({ row: k.row, col: k.col })}
      onMouseEnter={() => onHover?.({ row: k.row, col: k.col })}
      onMouseLeave={() => onHover?.(null)}
      style={{ "--layer": layerColor(layer), "--accent": accent ?? "transparent" } as React.CSSProperties}
    >
      <title>{d ? `${d.name}  (${hexStr(d.code)})  · matrix ${k.row},${k.col}` : `matrix ${k.row},${k.col}`}</title>
      {/* The cap is rotated on angled thumb keys; legends stay upright so they're readable. */}
      <g transform={k.r ? `rotate(${k.r} ${cx} ${cy})` : undefined}>
        <rect className="cap-base" x={x} y={y} width={w} height={h} rx={9} />
        <rect className="cap-top" x={x + 5} y={y + 3} width={w - 10} height={h - 11} rx={7} />
        {accent && <rect className="cap-accent" x={x + 10} y={y + h - 9} width={w - 20} height={3} rx={1.5} fill={accent} />}
      </g>
      {label && (
        <text
          className="legend"
          x={cx}
          y={hold ? cy - 4 : cy + 1}
          fontSize={fs}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      )}
      {hold && (
        <text className="legend-hold" x={cx} y={cy + Math.min(h / 2 - 16, 14)} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill={accent}>
          {hold}
        </text>
      )}
    </g>
  );
}

const hexStr = (n: number) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
