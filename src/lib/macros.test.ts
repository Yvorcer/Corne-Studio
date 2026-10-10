import { describe, expect, it } from "vitest";
import { parseMacros, serializeMacros, serializeMacro, type Macro } from "./macros";

describe("macros", () => {
  it("serializes text, taps and delays like QMK SEND_STRING", () => {
    const m: Macro = [
      { type: "text", text: "hi" },
      { type: "tap", keycode: 0x28 },
      { type: "delay", ms: 250 },
      { type: "down", keycode: 0xe3 },
      { type: "tap", keycode: 0x06 },
      { type: "up", keycode: 0xe3 },
    ];
    expect(serializeMacro(m)).toEqual([
      0x68, 0x69, 1, 1, 0x28, 1, 4, 0x32, 0x35, 0x30, 0x7c, 1, 2, 0xe3, 1, 1, 0x06, 1, 3, 0xe3,
    ]);
  });

  it("round-trips a full buffer and always emits `count` terminators", () => {
    const macros: Macro[] = [[{ type: "text", text: "git status\n" }], [], [{ type: "delay", ms: 5 }, { type: "tap", keycode: 4 }]];
    const bytes = serializeMacros(macros, 5);
    expect(bytes.filter((b) => b === 0)).toHaveLength(5);
    const padded = [...bytes, ...new Array(20).fill(0)];
    expect(parseMacros(padded, 5)).toEqual([...macros, [], []]);
  });

  it("drops characters the firmware can't type", () => {
    expect(serializeMacro([{ type: "text", text: "é a" }])).toEqual([0x20, 0x61]);
  });

  it("parses an empty (all-zero) buffer", () => {
    expect(parseMacros(new Array(32).fill(0), 16)).toEqual(new Array(16).fill([]));
  });
});
