import { useEffect, useMemo, useState } from "react";
import {
  ALL_KEYS,
  decode,
  encode,
  hex,
  keycodeFromDomCode,
  MOD,
  modNames,
  modsLabel,
  search,
  type Category,
  type KeyDef,
} from "../lib/keycodes";
import { useStore } from "../state/store";
import { layerColor } from "./KeyboardView";
import { isMac } from "../lib/platform";

type Tab = Category | "advanced";

const TABS: { id: Tab; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "symbols", label: "Symbols" },
  { id: "modifiers", label: "Modifiers" },
  { id: "navigation", label: "Navigation" },
  { id: "function", label: "F-keys" },
  { id: "media", label: "Media" },
  { id: "layers", label: "Layers" },
  { id: "macro", label: "Macros" },
  { id: "mouse", label: "Mouse" },
  { id: "numpad", label: "Numpad" },
  { id: "lighting", label: "Lighting" },
  { id: "special", label: "Special" },
  { id: "international", label: "Intl" },
  { id: "advanced", label: "Mod-tap · Combos" },
];

/** Basic keys usable as the tap half of MT/LT or wrapped by modifiers. */
export const BASIC_KEYS = ALL_KEYS.filter((k) => k.code >= 0x04 && k.code <= 0xff);

export function KeyPicker() {
  const { selected, layer, keymap, layerCount, macroCount, assign, capturing: capture, setCapturing: setCapture, swapping, setSwapping } =
    useStore();
  const [tab, setTab] = useState<Tab>("basic");
  const [query, setQuery] = useState("");

  const current = selected ? keymap[layer]?.[selected.row]?.[selected.col] : undefined;
  const currentDecoded = current !== undefined ? decode(current) : undefined;

  // "Press a key" mode (the button, or double-clicking a key): the next key typed is assigned.
  // Clicking anywhere else cancels it.
  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = keycodeFromDomCode(e.code);
      if (code !== undefined) assign(code);
      setCapture(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.(".chip-capture")) setCapture(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer, true);

    // Corne keys the Mac never hears about (layer keys like Lower/Upper, macros, mod-taps) are
    // read from the switch matrix: pressing one copies its function from the base layer.
    // Plain keys (letters, numbers, …) still arrive as normal key presses above.
    let alive = true;
    let timer: number | undefined;
    let held: Set<string> | null = null;
    const poll = async () => {
      try {
        const matrix = await useStore.getState().via.matrixState();
        if (!alive) return;
        const now = new Set<string>();
        matrix.forEach((row, r) => row.forEach((on, c) => on && now.add(`${r},${c}`)));
        const fresh = held ? [...now].filter((k) => !held!.has(k)) : [];
        held = now;
        for (const key of fresh) {
          const [r, c] = key.split(",").map(Number);
          const code = useStore.getState().keymap[0]?.[r]?.[c];
          if (code !== undefined && code > 0xff) {
            assign(code);
            setCapture(false);
            return;
          }
        }
      } catch {
        return; // firmware without matrix access: typing still works
      }
      if (alive) timer = window.setTimeout(poll, 30);
    };
    poll();

    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer, true);
    };
  }, [capture, assign, setCapture]);

  const layerKeys = useMemo(() => {
    const fns: [string, (l: number) => number, string][] = [
      ["MO", encode.mo, "Hold for layer"],
      ["TG", encode.tg, "Toggle layer on/off"],
      ["TO", encode.to, "Switch to layer"],
      ["OSL", encode.osl, "One-shot layer (next key only)"],
      ["TT", encode.tt, "Hold = momentary, tap 5× = toggle"],
      ["DF", encode.df, "Set default (base) layer"],
    ];
    const keys: KeyDef[] = [];
    for (const [fn, enc, desc] of fns)
      for (let l = 0; l < layerCount; l++)
        keys.push({ code: enc(l), name: `${fn}(${l})`, label: `${fn} ${l}`, desc: `${desc} ${l}`, category: "layers" });
    return [...keys, ...ALL_KEYS.filter((k) => k.category === "layers")];
  }, [layerCount]);

  const macroKeys = useMemo(
    () =>
      Array.from({ length: macroCount }, (_, i) => ({
        code: encode.macro(i),
        name: `QK_MACRO_${i}`,
        label: `M${i}`,
        desc: `Play macro ${i}`,
        category: "macro" as const,
      })),
    [macroCount],
  );

  const pool = useMemo(() => [...ALL_KEYS.filter((k) => k.category !== "layers"), ...layerKeys, ...macroKeys], [layerKeys, macroKeys]);

  const shown = query
    ? search(query, pool)
    : tab === "layers"
      ? layerKeys
      : tab === "macro"
        ? macroKeys
        : tab === "advanced"
          ? []
          : pool.filter((k) => k.category === tab && !(tab === "special" && k.code <= 1));

  const disabled = !selected;

  return (
    <section className="picker">
      <header className="picker-head">
        <div className="current">
          {selected && currentDecoded ? (
            <>
              <span className="current-label">Layer {layer} · key {selected.row},{selected.col}</span>
              <code className="current-code">{currentDecoded.name}</code>
              <span className="muted">{hex(currentDecoded.code)}</span>
            </>
          ) : (
            <span className="muted">Click a key on the keyboard to change it</span>
          )}
        </div>
        <div className="picker-actions">
          <button className="chip" disabled={disabled} onClick={() => assign(0x0001)} title="Fall through to the layer below">
            ▽ Transparent
          </button>
          <button className="chip" disabled={disabled} onClick={() => assign(0x0000)} title="Disable this key">
            ∅ None
          </button>
          <button
            className={`chip chip-capture ${capture ? "chip-active" : ""}`}
            disabled={disabled}
            onClick={() => setCapture(!capture)}
            title="Press any key on a keyboard to assign it (or double-click a key)"
          >
            {capture ? "Press a key…" : "⌨ Press to assign"}
          </button>
          <button
            className={`chip ${swapping ? "chip-active" : ""}`}
            disabled={disabled}
            onClick={() => setSwapping(!swapping)}
            title="Swap this key with another one (or drag one key onto another)"
          >
            {swapping ? "Click a key to swap with…" : "⇄ Swap"}
          </button>
          <input
            className="search"
            placeholder="Search keys (e.g. volume, shift, enter, F13)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      {!query && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {tab === "advanced" && !query ? (
        <AdvancedBuilder
          key={selected ? `${layer}:${selected.row},${selected.col}` : "none"}
          disabled={disabled}
          initial={current} layerCount={layerCount} onAssign={assign} />
      ) : (
        <div className="key-grid">
          {shown.map((k) => {
            const d = decode(k.code);
            return (
              <button
                key={`${k.code}-${k.name}`}
                className={`pick ${current === k.code ? "current" : ""}`}
                disabled={disabled}
                title={`${k.name}${k.desc ? " — " + k.desc : ""}`}
                onClick={() => assign(k.code)}
                style={d.layer !== undefined ? ({ "--accent": layerColor(d.layer) } as React.CSSProperties) : undefined}
              >
                <span className="pick-label">{k.label || "∅"}</span>
                <span className="pick-name">{k.desc ?? k.name}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="muted pad">No keys match “{query}”.</p>}
        </div>
      )}
    </section>
  );
}

const MOD_BITS = [MOD.CTL, MOD.ALT, MOD.SFT, MOD.GUI];

function ModToggles({ mods, onChange }: { mods: number; onChange: (m: number) => void }) {
  const names = modNames();
  return (
    <div className="mods">
      {MOD_BITS.map((bit) => [bit, names[bit].sym, names[bit].name] as const).map(([bit, sym, name]) => (
        <button key={bit} className={`mod ${mods & bit ? "on" : ""}`} onClick={() => onChange(mods ^ bit)} title={name}>
          {sym} <small>{name}</small>
        </button>
      ))}
      <button className={`mod ${mods & MOD.RIGHT ? "on" : ""}`} onClick={() => onChange(mods ^ MOD.RIGHT)} title="Use right-hand modifiers">
        R <small>Right side</small>
      </button>
    </div>
  );
}

export function BasicKeySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {BASIC_KEYS.map((k) => (
        <option key={k.code} value={k.code}>
          {k.label} — {k.desc ?? k.name}
        </option>
      ))}
    </select>
  );
}

function AdvancedBuilder({
  disabled,
  initial,
  layerCount,
  onAssign,
}: {
  disabled: boolean;
  initial?: number;
  layerCount: number;
  onAssign: (code: number) => void;
}) {
  const init = initial !== undefined ? decode(initial) : undefined;
  const initKey = initial !== undefined && init && ["modTap", "layerTap", "mods", "basic"].includes(init.kind) ? initial & 0xff : 0x04;
  const initMods = initial !== undefined && init && (init.kind === "modTap" || init.kind === "mods") ? (initial >> 8) & 0x1f : MOD.CTL;

  const [mtKey, setMtKey] = useState(initKey);
  const [mtMods, setMtMods] = useState(initMods);
  const [ltKey, setLtKey] = useState(init?.kind === "layerTap" ? initKey : 0x2c);
  const [ltLayer, setLtLayer] = useState(init?.layer ?? 1);
  const [comboKey, setComboKey] = useState(init?.kind === "mods" ? initKey : 0x06);
  const [comboMods, setComboMods] = useState(init?.kind === "mods" ? initMods : isMac ? MOD.GUI : MOD.CTL);
  const [osmMods, setOsmMods] = useState<number>(MOD.SFT);
  const [raw, setRaw] = useState(initial !== undefined ? hex(initial) : "");

  useEffect(() => setRaw(initial !== undefined ? hex(initial) : ""), [initial]);

  const rawValue = Number.parseInt(raw.replace(/^0x/i, ""), 16);
  const rawOk = Number.isFinite(rawValue) && rawValue >= 0 && rawValue <= 0xffff;

  return (
    <div className="builders">
      <div className="builder">
        <h4>Mod-Tap</h4>
        <p className="muted">Tap for a key, hold for a modifier (home-row mods).</p>
        <BasicKeySelect value={mtKey} onChange={setMtKey} />
        <ModToggles mods={mtMods} onChange={setMtMods} />
        <button className="primary" disabled={disabled || !(mtMods & 0x0f)} onClick={() => onAssign(encode.modTap(mtMods, mtKey))}>
          Assign {decode(encode.modTap(mtMods, mtKey)).label} / {modsLabel(mtMods)}
        </button>
      </div>

      <div className="builder">
        <h4>Layer-Tap</h4>
        <p className="muted">Tap for a key, hold to activate a layer.</p>
        <BasicKeySelect value={ltKey} onChange={setLtKey} />
        <div className="layer-pick">
          {Array.from({ length: Math.min(layerCount, 16) }, (_, l) => (
            <button
              key={l}
              className={`mod ${ltLayer === l ? "on" : ""}`}
              style={{ "--accent": layerColor(l) } as React.CSSProperties}
              onClick={() => setLtLayer(l)}
            >
              L{l}
            </button>
          ))}
        </div>
        <button className="primary" disabled={disabled} onClick={() => onAssign(encode.layerTap(ltLayer, ltKey))}>
          Assign LT({ltLayer}, {decode(ltKey).label})
        </button>
      </div>

      <div className="builder">
        <h4>Shortcut</h4>
        <p className="muted">One key that sends a combination, e.g. {decode(encode.mods(isMac ? MOD.GUI : MOD.CTL, 0x06)).label}.</p>
        <BasicKeySelect value={comboKey} onChange={setComboKey} />
        <ModToggles mods={comboMods} onChange={setComboMods} />
        <button className="primary" disabled={disabled || !(comboMods & 0x0f)} onClick={() => onAssign(encode.mods(comboMods, comboKey))}>
          Assign {decode(encode.mods(comboMods, comboKey)).label}
        </button>
      </div>

      <div className="builder">
        <h4>One-shot modifier</h4>
        <p className="muted">Tap, then the next key gets the modifier.</p>
        <ModToggles mods={osmMods} onChange={setOsmMods} />
        <button className="primary" disabled={disabled || !(osmMods & 0x0f)} onClick={() => onAssign(encode.osm(osmMods))}>
          Assign OSM {modsLabel(osmMods)}
        </button>
      </div>

      <div className="builder">
        <h4>Raw keycode</h4>
        <p className="muted">Any 16-bit QMK keycode in hex.</p>
        <input className="mono" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="0x0004" />
        <p className="muted">{rawOk ? decode(rawValue).name : "Enter a value between 0x0000 and 0xFFFF"}</p>
        <button className="primary" disabled={disabled || !rawOk} onClick={() => onAssign(rawValue)}>
          Assign
        </button>
      </div>
    </div>
  );
}
