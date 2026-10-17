// Generates the menu-bar icon: a monochrome "template" glyph of a split Corne that macOS
// tints for light/dark menu bars. Drawn from the real layout like the app icon.
import { CORNE_KEYS, keyCorners } from "../src/lib/corneLayout.ts";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");

const HEIGHT = 64; // macOS scales tray icons to ~18 pt tall; render large for crispness
const SPLAY = 8;
// Pull the halves closer than on the real board so the glyph stays compact.
const pivot = (side: string) => (side === "left" ? { x: 6.6, y: 4.2 } : { x: 10.3, y: 4.2 });
const SQUEEZE = 1.6;
const rot = (x: number, y: number, deg: number, p: { x: number; y: number }) => {
  const a = (deg * Math.PI) / 180, dx = x - p.x, dy = y - p.y;
  return { x: p.x + dx * Math.cos(a) - dy * Math.sin(a), y: p.y + dx * Math.sin(a) + dy * Math.cos(a) };
};
// Only the inner four columns and the thumbs: at 18 pt, fewer and bigger keys read as a keyboard.
const keys = CORNE_KEYS.filter((k) => k.col >= 2 && k.col <= 5).map((k) => {
  const deg = k.side === "left" ? SPLAY : -SPLAY;
  const c0 = rot(k.x + k.w / 2, k.y + k.h / 2, deg, pivot(k.side));
  const c = { x: c0.x + (k.side === "left" ? SQUEEZE / 2 : -SQUEEZE / 2), y: c0.y };
  return { ...k, cx: c.x, cy: c.y, r: k.r + deg };
});
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const k of keys)
  for (const [x, y] of keyCorners({ ...k, x: k.cx - k.w / 2, y: k.cy - k.h / 2 })) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
const pad = 0.15;
const U = HEIGHT / (maxY - minY + 2 * pad);
const width = Math.ceil((maxX - minX + 2 * pad) * U);
const caps = keys
  .map((k) => {
    const w = k.w * U * 0.86, h = k.h * U * 0.86, cx = (k.cx - minX + pad) * U, cy = (k.cy - minY + pad) * U;
    return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${U * 0.18}" transform="rotate(${k.r} ${cx} ${cy})"/>`;
  })
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}"><g fill="#000">${caps}</g></svg>`;
writeFileSync(process.argv[2], new Resvg(svg, { fitTo: { mode: "height", value: HEIGHT } }).render().asPng());
console.log(`tray icon ${width}×${HEIGHT} → ${process.argv[2]}`);
