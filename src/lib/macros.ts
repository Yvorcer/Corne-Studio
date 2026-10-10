// VIA/QMK dynamic macro buffer format (see QMK `send_string_with_delay_impl`):
//   - macros are stored back to back, each terminated by 0x00
//   - printable ASCII bytes are typed as text
//   - 0x01 0x01 <kc>  tap basic keycode
//   - 0x01 0x02 <kc>  key down
//   - 0x01 0x03 <kc>  key up
//   - 0x01 0x04 <decimal digits> '|'  delay in ms
// Only 8-bit (basic) keycodes are supported inside macros by the firmware.

export type MacroStep =
  | { type: "text"; text: string }
  | { type: "tap" | "down" | "up"; keycode: number }
  | { type: "delay"; ms: number };

export type Macro = MacroStep[];

const PREFIX = 0x01;
const TAP = 0x01;
const DOWN = 0x02;
const UP = 0x03;
const DELAY = 0x04;
const PIPE = "|".charCodeAt(0);

const ACTION_CODE = { tap: TAP, down: DOWN, up: UP } as const;

/** Characters the firmware can type from a text step. */
export function isTypeable(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || ch === "\n" || ch === "\t";
}

export function serializeMacro(macro: Macro): number[] {
  const out: number[] = [];
  for (const step of macro) {
    switch (step.type) {
      case "text":
        for (const ch of step.text) if (isTypeable(ch)) out.push(ch.charCodeAt(0));
        break;
      case "tap":
      case "down":
      case "up":
        if (step.keycode > 0x01 && step.keycode <= 0xff) out.push(PREFIX, ACTION_CODE[step.type], step.keycode);
        break;
      case "delay": {
        const ms = Math.max(0, Math.min(99999, Math.round(step.ms)));
        out.push(PREFIX, DELAY, ...[...String(ms)].map((d) => d.charCodeAt(0)), PIPE);
        break;
      }
    }
  }
  return out;
}

/** Serialize all macros, each null-terminated. Always emits exactly `count` macros. */
export function serializeMacros(macros: Macro[], count = macros.length): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(...serializeMacro(macros[i] ?? []), 0);
  return out;
}

export function parseMacros(buffer: number[], count: number): Macro[] {
  const macros: Macro[] = [];
  let i = 0;
  for (let m = 0; m < count; m++) {
    const steps: Macro = [];
    let text = "";
    const flush = () => {
      if (text) steps.push({ type: "text", text });
      text = "";
    };
    while (i < buffer.length && buffer[i] !== 0) {
      const b = buffer[i];
      if (b === PREFIX && i + 1 < buffer.length) {
        const action = buffer[i + 1];
        if ((action === TAP || action === DOWN || action === UP) && i + 2 < buffer.length) {
          flush();
          const type = action === TAP ? "tap" : action === DOWN ? "down" : "up";
          steps.push({ type, keycode: buffer[i + 2] });
          i += 3;
          continue;
        }
        if (action === DELAY) {
          flush();
          let j = i + 2;
          let digits = "";
          while (j < buffer.length && buffer[j] >= 0x30 && buffer[j] <= 0x39) digits += String.fromCharCode(buffer[j++]);
          if (buffer[j] === PIPE) j++;
          steps.push({ type: "delay", ms: Number(digits || 0) });
          i = j;
          continue;
        }
      }
      text += String.fromCharCode(b);
      i++;
    }
    flush();
    macros.push(steps);
    i++; // skip terminator
  }
  return macros;
}
