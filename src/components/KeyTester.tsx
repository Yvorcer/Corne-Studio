import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { KeyboardView } from "./KeyboardView";
import { keyId } from "../lib/corneLayout";
import { UnhandledCommandError } from "../lib/via";

const POLL_MS = 25;

interface LogEntry {
  id: number;
  text: string;
  kind: "down" | "up";
}

export function KeyTester() {
  const { via, keymap, layer, status, keys } = useStore();
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [tested, setTested] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"matrix" | "events">("matrix");
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);

  // Hardware matrix polling – sees every physical switch, including layer keys.
  useEffect(() => {
    if (mode !== "matrix" || status !== "ready") return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const state = await via.matrixState();
        if (!alive) return;
        const now = new Set<string>();
        state.forEach((row, r) => row.forEach((on, c) => on && now.add(keyId(r, c))));
        setPressed((prev) => (sameSet(prev, now) ? prev : now));
        if (now.size) setTested((prev) => (isSubset(now, prev) ? prev : new Set([...prev, ...now])));
      } catch (e) {
        if (e instanceof UnhandledCommandError) {
          setMode("events");
          return;
        }
      }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mode, status, via]);

  // What the computer actually receives.
  useEffect(() => {
    const push = (e: KeyboardEvent, kind: "down" | "up") => {
      if (e.repeat) return;
      e.preventDefault();
      const mods = [e.ctrlKey && "⌃", e.altKey && "⌥", e.shiftKey && "⇧", e.metaKey && "⌘"].filter(Boolean).join("");
      const text = `${kind === "down" ? "↓" : "↑"} ${mods}${e.key === " " ? "Space" : e.key}  ·  ${e.code}`;
      setLog((l) => [{ id: ++logId.current, text, kind }, ...l].slice(0, 40));
    };
    const down = (e: KeyboardEvent) => push(e, "down");
    const up = (e: KeyboardEvent) => push(e, "up");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const total = keys.length;
  const done = keys.filter((k) => tested.has(keyId(k.row, k.col))).length;

  return (
    <div className="tester">
      <header className="row gap center-v">
        <div>
          <h2>Key tester</h2>
          <p className="muted">
            {mode === "matrix"
              ? "Reading the switch matrix straight from the keyboard. Every physical switch shows up, including layer keys."
              : "This firmware doesn't share its switch matrix, so only keys the computer receives are shown on the right."}
          </p>
        </div>
        <span className="grow" />
        <div className="progress-pill" title="Switches that registered at least once">
          {done} / {total} switches OK
        </div>
        <button
          onClick={() => {
            setTested(new Set());
            setLog([]);
          }}
        >
          Reset
        </button>
      </header>
      <div className="tester-body">
        <div className="board-wrap">
          <KeyboardView keys={keys} codes={keymap[layer]} layer={layer} pressed={pressed} tested={tested} testerMode />
        </div>
        <aside className="event-log">
          <h4>Computer receives</h4>
          {log.length === 0 && <p className="muted small">Press keys…</p>}
          <ul>
            {log.map((l) => (
              <li key={l.id} className={l.kind}>
                {l.text}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
