import { describe, expect, it } from "vitest";
import { decode, encode, keycodeFromDomCode, MOD, setModStyle } from "./keycodes";

describe("keycodes", () => {
  it("decodes basic keys", () => {
    expect(decode(0x04)).toMatchObject({ label: "A", name: "KC_A", kind: "basic" });
    expect(decode(0x2c).name).toBe("KC_SPC");
    expect(decode(0x0001).name).toBe("KC_TRNS");
  });

  it("round-trips mod-tap", () => {
    const code = encode.modTap(MOD.CTL, 0x04);
    expect(code).toBe(0x2104); // LCTL_T(KC_A)
    expect(decode(code)).toMatchObject({ kind: "modTap", label: "A", hold: "⌃", name: "MT(MOD_LCTL, KC_A)" });
  });

  it("round-trips layer-tap", () => {
    const code = encode.layerTap(2, 0x2c);
    expect(code).toBe(0x422c); // LT(2, KC_SPC)
    expect(decode(code)).toMatchObject({ kind: "layerTap", layer: 2, label: "␣", hold: "L2" });
  });

  it("encodes layer functions at QMK v12 offsets", () => {
    expect(encode.mo(1)).toBe(0x5221);
    expect(encode.tg(3)).toBe(0x5263);
    expect(encode.to(0)).toBe(0x5200);
    expect(encode.osl(1)).toBe(0x5281);
    expect(encode.tt(2)).toBe(0x52c2);
    expect(encode.df(1)).toBe(0x5241);
    expect(decode(0x5221)).toMatchObject({ kind: "layer", layer: 1, name: "MO(1)" });
  });

  it("decodes modifier-wrapped keys and shifted symbols", () => {
    expect(decode(0x021e).label).toBe("!"); // KC_EXLM = LSFT(KC_1)
    expect(decode(encode.mods(MOD.GUI, 0x06))).toMatchObject({ kind: "mods", label: "⌘C", name: "LGUI(KC_C)" });
    expect(decode(encode.mods(MOD.GUI | MOD.SFT, 0x21)).name).toBe("LSG(KC_4)");
  });

  it("decodes the keys found on the shipped Corne v4 keymap", () => {
    expect(decode(0x7c16).name).toBe("QK_GESC");
    expect(decode(0x7c77).name).toBe("TL_LOWR");
    expect(decode(0x7c78).name).toBe("TL_UPPR");
    expect(decode(0x7c1e).name).toBe("SC_SENT");
    expect(decode(0x7820).name).toBe("UG_TOGG");
    expect(decode(0x2235)).toMatchObject({ kind: "modTap", hold: "⇧" });
  });

  it("keeps unknown codes as hex", () => {
    expect(decode(0x7600)).toMatchObject({ kind: "unknown", label: "0x7600" });
  });

  it("maps DOM key codes", () => {
    expect(keycodeFromDomCode("KeyQ")).toBe(0x14);
    expect(keycodeFromDomCode("MetaLeft")).toBe(0xe3);
    expect(keycodeFromDomCode("Digit0")).toBe(0x27);
  });

  it("uses Ctrl/Alt/Super legends on Linux", () => {
    setModStyle("linux");
    expect(decode(0xe3).label).toBe("Super");
    expect(decode(0xe7).label).toBe("RSuper");
    expect(decode(encode.mods(MOD.CTL, 0x06)).label).toBe("Ctrl+C");
    expect(decode(encode.modTap(MOD.CTL | MOD.SFT, 0x04)).hold).toBe("Ctrl+⇧");
    setModStyle("mac");
    expect(decode(0xe3).label).toBe("⌘");
  });
});
