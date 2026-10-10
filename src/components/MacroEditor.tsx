import { useState } from "react";
import { useStore } from "../state/store";
import { serializeMacros, isTypeable, type Macro, type MacroStep } from "../lib/macros";
import { decode, encode } from "../lib/keycodes";
import { BasicKeySelect } from "./KeyPicker";

function summarize(m: Macro): string {
  if (m.length === 0) return "Empty";
  return m
    .map((s) => {
      switch (s.type) {
        case "text":
          return `“${s.text.replace(/\n/g, "⏎")}”`;
        case "tap":
          return decode(s.keycode).label;
        case "down":
          return `${decode(s.keycode).label}↓`;
        case "up":
          return `${decode(s.keycode).label}↑`;
        case "delay":
          return `${s.ms}ms`;
      }
    })
    .join(" ");
}

const NEW_STEP: Record<MacroStep["type"], MacroStep> = {
  text: { type: "text", text: "" },
  tap: { type: "tap", keycode: 0x28 },
  down: { type: "down", keycode: 0xe3 },
  up: { type: "up", keycode: 0xe3 },
  delay: { type: "delay", ms: 100 },
};

export function MacroEditor() {
  const { macros, macroCount, macroBufferSize, macrosDirty, updateMacros, saveMacros, revertMacros, busy, keymap } = useStore();
  const [sel, setSel] = useState(0);
  const macro = macros[sel] ?? [];
  const used = serializeMacros(macros, macroCount).length;
  const over = used > macroBufferSize - 1;

  // Where is each macro bound? Helps users find "M3 is on layer 1".
  const bindings = (i: number) => {
    const code = encode.macro(i);
    const out: string[] = [];
    keymap.forEach((l, li) => l.forEach((r, ri) => r.forEach((c, ci) => c === code && out.push(`L${li} ${ri},${ci}`))));
    return out;
  };

  const setMacro = (m: Macro) => updateMacros(macros.map((x, i) => (i === sel ? m : x)));
  const setStep = (i: number, s: MacroStep) => setMacro(macro.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= macro.length) return;
    const m = [...macro];
    [m[i], m[j]] = [m[j], m[i]];
    setMacro(m);
  };

  return (
    <div className="macros">
      <aside className="macro-list">
        {Array.from({ length: macroCount }, (_, i) => {
          const b = bindings(i);
          return (
            <button key={i} className={`macro-item ${sel === i ? "active" : ""}`} onClick={() => setSel(i)}>
              <span className="macro-id">M{i}</span>
              <span className="macro-sum">{summarize(macros[i] ?? [])}</span>
              {b.length > 0 && <span className="macro-bound" title={b.join(", ")}>on key</span>}
            </button>
          );
        })}
      </aside>

      <section className="macro-detail">
        <header className="macro-head">
          <div>
            <h2>Macro M{sel}</h2>
            <p className="muted">
              {bindings(sel).length
                ? `Assigned to ${bindings(sel).join(", ")}`
                : "Not on any key yet. In Keymap → Macros, assign M" + sel + " to a key."}
            </p>
          </div>
          <div className="row gap">
            <div className={`meter ${over ? "over" : ""}`} title="Macro memory used on the keyboard">
              <div style={{ width: `${Math.min(100, (used / macroBufferSize) * 100)}%` }} />
              <span>
                {used} / {macroBufferSize} bytes
              </span>
            </div>
            <button disabled={!macrosDirty || busy} onClick={revertMacros}>
              Revert
            </button>
            <button className="primary" disabled={!macrosDirty || busy || over} onClick={saveMacros}>
              Save to keyboard
            </button>
          </div>
        </header>

        <ol className="steps">
          {macro.map((s, i) => (
            <li key={i} className="step">
              <select value={s.type} onChange={(e) => setStep(i, { ...NEW_STEP[e.target.value as MacroStep["type"]] })}>
                <option value="text">Type text</option>
                <option value="tap">Tap key</option>
                <option value="down">Hold key down</option>
                <option value="up">Release key</option>
                <option value="delay">Wait</option>
              </select>
              {s.type === "text" && (
                <input
                  className="grow"
                  value={s.text}
                  placeholder="Text to type (ASCII only)"
                  onChange={(e) => setStep(i, { type: "text", text: [...e.target.value].filter(isTypeable).join("") })}
                />
              )}
              {(s.type === "tap" || s.type === "down" || s.type === "up") && (
                <BasicKeySelect value={s.keycode} onChange={(keycode) => setStep(i, { type: s.type, keycode })} />
              )}
              {s.type === "delay" && (
                <label className="row gap">
                  <input
                    type="number"
                    min={0}
                    max={99999}
                    value={s.ms}
                    onChange={(e) => setStep(i, { type: "delay", ms: Number(e.target.value) })}
                  />
                  ms
                </label>
              )}
              <span className="step-tools">
                <button className="icon" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button className="icon" onClick={() => move(i, 1)} disabled={i === macro.length - 1} title="Move down">↓</button>
                <button className="icon danger" onClick={() => setMacro(macro.filter((_, j) => j !== i))} title="Remove">✕</button>
              </span>
            </li>
          ))}
          {macro.length === 0 && <li className="muted pad">This macro is empty. Add a step below.</li>}
        </ol>

        <div className="row gap wrap">
          <button onClick={() => setMacro([...macro, NEW_STEP.text])}>+ Text</button>
          <button onClick={() => setMacro([...macro, NEW_STEP.tap])}>+ Tap key</button>
          <button onClick={() => setMacro([...macro, NEW_STEP.down])}>+ Hold</button>
          <button onClick={() => setMacro([...macro, NEW_STEP.up])}>+ Release</button>
          <button onClick={() => setMacro([...macro, NEW_STEP.delay])}>+ Wait</button>
          <span className="grow" />
          <button className="danger" disabled={macro.length === 0} onClick={() => setMacro([])}>
            Clear macro
          </button>
        </div>
        <p className="muted small">
          Tip: for a shortcut, hold the modifiers, tap the key, then release the modifiers in reverse order. Text steps type
          US-ASCII characters only, the same way the firmware does.
        </p>
      </section>
    </div>
  );
}
