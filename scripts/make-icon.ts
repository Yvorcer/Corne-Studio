// Generates the Corne Studio app icon from the real Corne v4 geometry.
import { CORNE_KEYS, keyCorners } from "../src/lib/corneLayout.ts";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");

const SIZE = 1024;
// macOS icon grid: 824px body, centred, ~22.5% corner radius.
const BODY = 824, OFF = (SIZE - BODY) / 2, RADIUS = 185;

// Splay each half outward like a real split setup, rotating around its thumb cluster.
const SPLAY = 10;
const pivot = (side: string) => (side === "left" ? { x: 6.6, y: 4.2 } : { x: 10.3, y: 4.2 });
const rot = (x: number, y: number, deg: number, p: { x: number; y: number }) => {
  const a = (deg * Math.PI) / 180;
  const dx = x - p.x, dy = y - p.y;
  return { x: p.x + dx * Math.cos(a) - dy * Math.sin(a), y: p.y + dx * Math.sin(a) + dy * Math.cos(a) };
};
const placed = CORNE_KEYS.map((k) => {
  const deg = k.side === "left" ? SPLAY : -SPLAY;
  const p = pivot(k.side);
  const c = rot(k.x + k.w / 2, k.y + k.h / 2, deg, p);
  return { ...k, cx: c.x, cy: c.y, r: k.r + deg };
});

// Fit to the body with padding.
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const k of placed) {
  for (const [x, y] of keyCorners({ ...k, x: k.cx - k.w / 2, y: k.cy - k.h / 2 })) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}
const PAD = 64;
const U = (BODY - PAD * 2) / (maxX - minX);
const ox = OFF + PAD - minX * U;
const oy = SIZE / 2 - ((minY + maxY) / 2) * U + 10;

// RGB-matrix style gradient across the board (matches the app's layer palette).
const stops = ["#7aa2ff", "#4fd1c5", "#68d391", "#f6ad55", "#f687b3", "#b794f4"];
const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (t: number) => {
  const f = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(f), u = f - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * u)).join(",")})`;
};

const gap = 0.09 * U;
let caps = "";
for (const k of placed) {
  const w = k.w * U - gap, h = k.h * U - gap;
  const cx = ox + k.cx * U, cy = oy + k.cy * U;
  const t = (k.cx - minX) / (maxX - minX);
  const glow = lerp(t);
  caps += `<g transform="rotate(${k.r.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})">
    <rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(0.2 * U).toFixed(1)}" fill="${glow}" opacity="0.55" filter="url(#glow)"/>
    <rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(0.2 * U).toFixed(1)}" fill="#151925" stroke="${glow}" stroke-width="${(0.055 * U).toFixed(1)}"/>
    <rect x="${(cx - w / 2 + 0.13 * U).toFixed(1)}" y="${(cy - h / 2 + 0.08 * U).toFixed(1)}" width="${(w - 0.26 * U).toFixed(1)}" height="${(h - 0.26 * U).toFixed(1)}" rx="${(0.14 * U).toFixed(1)}" fill="url(#cap)"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#252b3d"/>
      <stop offset="1" stop-color="#0c0f16"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.55" r="0.55">
      <stop offset="0" stop-color="#7aa2ff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#7aa2ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a4154"/>
      <stop offset="1" stop-color="#262b39"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(0.16 * U).toFixed(1)}"/></filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="12"/></filter>
    <clipPath id="body"><rect x="${OFF}" y="${OFF}" width="${BODY}" height="${BODY}" rx="${RADIUS}"/></clipPath>
  </defs>
  <rect x="${OFF}" y="${OFF + 14}" width="${BODY}" height="${BODY}" rx="${RADIUS}" fill="#000" opacity="0.35" filter="url(#shadow)"/>
  <rect x="${OFF}" y="${OFF}" width="${BODY}" height="${BODY}" rx="${RADIUS}" fill="url(#bg)"/>
  <g clip-path="url(#body)">
    <rect x="${OFF}" y="${OFF}" width="${BODY}" height="${BODY}" fill="url(#halo)"/>
    ${caps}
    <rect x="${OFF}" y="${OFF}" width="${BODY}" height="${BODY / 2}" fill="url(#sheen)"/>
  </g>
  <rect x="${OFF + 1}" y="${OFF + 1}" width="${BODY - 2}" height="${BODY - 2}" rx="${RADIUS - 1}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
</svg>`;

const [svgOut, pngOut] = process.argv.slice(2);
writeFileSync(svgOut, svg);
writeFileSync(pngOut, new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng());
console.log("written", svgOut, pngOut, "U=", U.toFixed(1));
