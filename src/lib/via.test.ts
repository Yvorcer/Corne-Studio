import { describe, expect, it } from "vitest";
import { Via, parseKeymapBuffer, parseMatrixState, serializeKeymap, type Transport } from "./via";

describe("via buffers", () => {
  it("parses and serializes keymap buffers (big endian, layer-major)", () => {
    const bytes = [0x00, 0x2b, 0x00, 0x14, 0x7c, 0x16, 0x00, 0x04];
    const km = parseKeymapBuffer(bytes, 1, 2, 2);
    expect(km).toEqual([[[0x002b, 0x0014], [0x7c16, 0x0004]]]);
    expect(serializeKeymap(km)).toEqual(bytes);
  });

  it("parses switch matrix state (1 byte per row for 7 columns)", () => {
    const m = parseMatrixState([0b0000_0001, 0, 0, 0b0100_0000, 0, 0, 0, 0b0000_1000], 8, 7);
    expect(m[0][0]).toBe(true);
    expect(m[3][6]).toBe(true);
    expect(m[7][3]).toBe(true);
    expect(m.flat().filter(Boolean)).toHaveLength(3);
  });

  it("reads the keymap in 28-byte chunks", async () => {
    const memory = Array.from({ length: 6 * 8 * 7 * 2 }, (_, i) => i & 0xff);
    const sent: number[][] = [];
    const t: Transport = {
      send: async (d) => {
        sent.push(d);
        const off = (d[1] << 8) | d[2];
        return [...d.slice(0, 4), ...memory.slice(off, off + d[3])];
      },
    };
    const km = await new Via(t).getKeymap(6);
    expect(sent.every((s) => s[0] === 0x12 && s[3] <= 28)).toBe(true);
    expect(serializeKeymap(km)).toEqual(memory);
  });
});
