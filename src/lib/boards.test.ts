import { describe, expect, it } from "vitest";
import { BOARDS, detectBoard, displayName, rankDevices } from "./boards";
import { LAYOUTS } from "./corneLayout";
import { fitKeymap } from "./profiles";

describe("board detection", () => {
  it("recognises Corne v4.0 and v4.1 by USB IDs + device release", () => {
    const v41 = detectBoard({ vendorId: 0x4653, productId: 0x0004, release: 0x0410 });
    expect(v41?.board.id).toBe("corne-v4");
    expect(v41?.revision).toBe("v4.1");
    expect(displayName(v41)).toBe("Corne v4.1");
    expect(detectBoard({ vendorId: 0x4653, productId: 0x0004, release: 0x0400 })?.revision).toBe("v4.0");
  });

  it("recognises the v4 mini, classic Corne and third-party boards", () => {
    expect(detectBoard({ vendorId: 0x4653, productId: 0x0104 })?.board.id).toBe("corne-v4-mini");
    expect(detectBoard({ vendorId: 0x4653, productId: 0x0001 })?.board.id).toBe("corne-classic");
    expect(detectBoard({ vendorId: 0x7171, productId: 0x0003 })?.board.id).toBe("mechboards-crkbd-pro");
    expect(detectBoard({ vendorId: 0x4273, productId: 0x7563 })?.board.id).toBe("boardsource-unicorne");
    expect(detectBoard({ vendorId: 0x1234, productId: 0x5678 })).toBeUndefined();
  });

  it("prefers recognised Cornes over other VIA keyboards", () => {
    const ranked = rankDevices([
      { vendorId: 0x3434, productId: 0x0101, path: "keychron" },
      { vendorId: 0x4653, productId: 0x0001, path: "v3" },
      { vendorId: 0x4653, productId: 0x0004, path: "v4" },
    ]);
    expect(ranked.map((d) => d.path)).toEqual(["v4", "v3", "keychron"]);
  });

  it("has layouts with the right key counts that fit each board's matrix", () => {
    expect(LAYOUTS.split_3x6_3_ex2.keys).toHaveLength(46);
    expect(LAYOUTS.split_3x5_3_ex2.keys).toHaveLength(40);
    expect(LAYOUTS.split_3x6_3.keys).toHaveLength(42);
    expect(LAYOUTS.split_3x5_3.keys).toHaveLength(36);
    for (const b of BOARDS)
      for (const l of b.layouts)
        for (const k of LAYOUTS[l].keys) {
          expect(k.row).toBeLessThan(b.rows);
          expect(k.col).toBeLessThan(b.cols);
        }
  });

  it("applies a v3 (8×6) profile onto a v4 (8×7) keymap, keeping the v4-only keys", () => {
    const v4 = [Array.from({ length: 8 }, (_, r) => Array.from({ length: 7 }, (_, c) => 0x1000 + r * 16 + c))];
    const v3 = [Array.from({ length: 8 }, () => Array.from({ length: 6 }, () => 0x0004))];
    const fitted = fitKeymap(v3, v4);
    expect(fitted[0][0].slice(0, 6)).toEqual(new Array(6).fill(0x0004));
    expect(fitted[0][0][6]).toBe(0x1006); // inner v4 key untouched
  });
});
