// QMK keycodes (keycode protocol v12+, current QMK `quantum/keycodes.h`).
// Everything here is pure data + encode/decode helpers so it can be unit tested.

export type Category =
  | "basic"
  | "symbols"
  | "modifiers"
  | "navigation"
  | "function"
  | "media"
  | "mouse"
  | "numpad"
  | "layers"
  | "special"
  | "lighting"
  | "macro"
  | "international";

export interface KeyDef {
  code: number;
  /** QMK identifier, e.g. KC_A */
  name: string;
  /** Short legend drawn on the keycap */
  label: string;
  /** Longer human description for tooltips/search */
  desc?: string;
  category: Category;
  aliases?: string[];
  /** DOM KeyboardEvent.code that produces this key, used for "press a key to assign" */
  domCode?: string;
}

// ---------------------------------------------------------------- ranges
export const QK = {
  BASIC_MAX: 0x00ff,
  MODS: 0x0100,
  MODS_MAX: 0x1fff,
  MOD_TAP: 0x2000,
  MOD_TAP_MAX: 0x3fff,
  LAYER_TAP: 0x4000,
  LAYER_TAP_MAX: 0x4fff,
  LAYER_MOD: 0x5000,
  LAYER_MOD_MAX: 0x51ff,
  TO: 0x5200,
  MOMENTARY: 0x5220,
  DEF_LAYER: 0x5240,
  TOGGLE_LAYER: 0x5260,
  ONE_SHOT_LAYER: 0x5280,
  ONE_SHOT_MOD: 0x52a0,
  LAYER_TAP_TOGGLE: 0x52c0,
  PERSISTENT_DEF_LAYER: 0x52e0,
  TAP_DANCE: 0x5700,
  TAP_DANCE_MAX: 0x57ff,
  MACRO: 0x7700,
  MACRO_MAX: 0x777f,
  KB: 0x7e00,
  KB_MAX: 0x7e3f,
  USER: 0x7e40,
  USER_MAX: 0x7fff,
} as const;

/** 5-bit QMK modifier mask. Bit 4 selects right-hand modifiers. */
export const MOD = { CTL: 0x01, SFT: 0x02, ALT: 0x04, GUI: 0x08, RIGHT: 0x10 } as const;

export const KC_NO = 0x0000;
export const KC_TRNS = 0x0001;

// ---------------------------------------------------------------- basic table
const defs: KeyDef[] = [];
const add = (
  code: number,
  name: string,
  label: string,
  category: Category,
  extra: Partial<KeyDef> = {},
) => defs.push({ code, name, label, category, ...extra });

add(0x0000, "KC_NO", "", "special", { desc: "No action (blocks lower layers)", aliases: ["XXXXXXX", "none", "blank"] });
add(0x0001, "KC_TRNS", "▽", "special", { desc: "Transparent – falls through to the layer below", aliases: ["_______", "transparent"] });

for (let i = 0; i < 26; i++) {
  const ch = String.fromCharCode(65 + i);
  add(0x04 + i, `KC_${ch}`, ch, "basic", { domCode: `Key${ch}` });
}
const digits: [string, string][] = [
  ["1", "!"], ["2", "@"], ["3", "#"], ["4", "$"], ["5", "%"],
  ["6", "^"], ["7", "&"], ["8", "*"], ["9", "("], ["0", ")"],
];
digits.forEach(([d], i) => add(0x1e + i, `KC_${d}`, d, "basic", { domCode: `Digit${d}` }));

add(0x28, "KC_ENT", "⏎", "basic", { desc: "Enter", aliases: ["enter", "return"], domCode: "Enter" });
add(0x29, "KC_ESC", "Esc", "basic", { desc: "Escape", domCode: "Escape" });
add(0x2a, "KC_BSPC", "⌫", "basic", { desc: "Backspace", aliases: ["backspace", "delete back"], domCode: "Backspace" });
add(0x2b, "KC_TAB", "⇥", "basic", { desc: "Tab", aliases: ["tab"], domCode: "Tab" });
add(0x2c, "KC_SPC", "␣", "basic", { desc: "Space", aliases: ["space"], domCode: "Space" });
add(0x2d, "KC_MINS", "-", "basic", { desc: "Minus", domCode: "Minus" });
add(0x2e, "KC_EQL", "=", "basic", { desc: "Equal", domCode: "Equal" });
add(0x2f, "KC_LBRC", "[", "basic", { desc: "Left bracket", domCode: "BracketLeft" });
add(0x30, "KC_RBRC", "]", "basic", { desc: "Right bracket", domCode: "BracketRight" });
add(0x31, "KC_BSLS", "\\", "basic", { desc: "Backslash", domCode: "Backslash" });
add(0x32, "KC_NUHS", "#~", "international", { desc: "Non-US #" });
add(0x33, "KC_SCLN", ";", "basic", { desc: "Semicolon", domCode: "Semicolon" });
add(0x34, "KC_QUOT", "'", "basic", { desc: "Quote", domCode: "Quote" });
add(0x35, "KC_GRV", "`", "basic", { desc: "Grave / backtick", domCode: "Backquote" });
add(0x36, "KC_COMM", ",", "basic", { desc: "Comma", domCode: "Comma" });
add(0x37, "KC_DOT", ".", "basic", { desc: "Period", domCode: "Period" });
add(0x38, "KC_SLSH", "/", "basic", { desc: "Slash", domCode: "Slash" });
add(0x39, "KC_CAPS", "⇪", "basic", { desc: "Caps Lock", aliases: ["caps"], domCode: "CapsLock" });

for (let i = 1; i <= 12; i++) add(0x3a + i - 1, `KC_F${i}`, `F${i}`, "function", { domCode: `F${i}` });
add(0x46, "KC_PSCR", "PrtSc", "navigation", { desc: "Print Screen", domCode: "PrintScreen" });
add(0x47, "KC_SCRL", "ScrLk", "navigation", { desc: "Scroll Lock", domCode: "ScrollLock" });
add(0x48, "KC_PAUS", "Pause", "navigation", { desc: "Pause", domCode: "Pause" });
add(0x49, "KC_INS", "Ins", "navigation", { desc: "Insert", domCode: "Insert" });
add(0x4a, "KC_HOME", "Home", "navigation", { domCode: "Home" });
add(0x4b, "KC_PGUP", "PgUp", "navigation", { desc: "Page Up", domCode: "PageUp" });
add(0x4c, "KC_DEL", "⌦", "navigation", { desc: "Forward Delete", aliases: ["delete"], domCode: "Delete" });
add(0x4d, "KC_END", "End", "navigation", { domCode: "End" });
add(0x4e, "KC_PGDN", "PgDn", "navigation", { desc: "Page Down", domCode: "PageDown" });
add(0x4f, "KC_RGHT", "→", "navigation", { desc: "Right arrow", aliases: ["right"], domCode: "ArrowRight" });
add(0x50, "KC_LEFT", "←", "navigation", { desc: "Left arrow", aliases: ["left"], domCode: "ArrowLeft" });
add(0x51, "KC_DOWN", "↓", "navigation", { desc: "Down arrow", aliases: ["down"], domCode: "ArrowDown" });
add(0x52, "KC_UP", "↑", "navigation", { desc: "Up arrow", aliases: ["up"], domCode: "ArrowUp" });

add(0x53, "KC_NUM", "NumLk", "numpad", { desc: "Num Lock", domCode: "NumLock" });
add(0x54, "KC_PSLS", "N/", "numpad", { desc: "Keypad /", domCode: "NumpadDivide" });
add(0x55, "KC_PAST", "N*", "numpad", { desc: "Keypad *", domCode: "NumpadMultiply" });
add(0x56, "KC_PMNS", "N-", "numpad", { desc: "Keypad -", domCode: "NumpadSubtract" });
add(0x57, "KC_PPLS", "N+", "numpad", { desc: "Keypad +", domCode: "NumpadAdd" });
add(0x58, "KC_PENT", "N⏎", "numpad", { desc: "Keypad Enter", domCode: "NumpadEnter" });
for (let i = 1; i <= 9; i++) add(0x59 + i - 1, `KC_P${i}`, `N${i}`, "numpad", { desc: `Keypad ${i}`, domCode: `Numpad${i}` });
add(0x62, "KC_P0", "N0", "numpad", { desc: "Keypad 0", domCode: "Numpad0" });
add(0x63, "KC_PDOT", "N.", "numpad", { desc: "Keypad .", domCode: "NumpadDecimal" });
add(0x64, "KC_NUBS", "\\|", "international", { desc: "Non-US \\", domCode: "IntlBackslash" });
add(0x65, "KC_APP", "Menu", "navigation", { desc: "Application / context menu", domCode: "ContextMenu" });
add(0x67, "KC_PEQL", "N=", "numpad", { desc: "Keypad =", domCode: "NumpadEqual" });
for (let i = 13; i <= 24; i++) add(0x68 + i - 13, `KC_F${i}`, `F${i}`, "function", { domCode: `F${i}` });
add(0x85, "KC_PCMM", "N,", "numpad", { desc: "Keypad ,", domCode: "NumpadComma" });
for (let i = 1; i <= 9; i++) add(0x87 + i - 1, `KC_INT${i}`, `Int${i}`, "international", { desc: `International ${i}` });
add(0x87, "KC_INT1", "ろ", "international", { desc: "JIS Ro (International 1)", domCode: "IntlRo" });
add(0x89, "KC_INT3", "¥", "international", { desc: "JIS Yen (International 3)", domCode: "IntlYen" });
add(0x8a, "KC_INT4", "変換", "international", { desc: "JIS Henkan (International 4)", domCode: "Convert" });
add(0x8b, "KC_INT5", "無変換", "international", { desc: "JIS Muhenkan (International 5)", domCode: "NonConvert" });
for (let i = 1; i <= 9; i++) add(0x90 + i - 1, `KC_LNG${i}`, `Lang${i}`, "international", { desc: `Language ${i}` });
add(0x90, "KC_LNG1", "かな", "international", { desc: "Kana / Hangul (Language 1)", domCode: "Lang1" });
add(0x91, "KC_LNG2", "英数", "international", { desc: "Eisu / Hanja (Language 2)", domCode: "Lang2" });

add(0xa5, "KC_PWR", "Power", "media", { desc: "System power" });
add(0xa6, "KC_SLEP", "Sleep", "media", { desc: "System sleep" });
add(0xa7, "KC_WAKE", "Wake", "media", { desc: "System wake" });
add(0xa8, "KC_MUTE", "🔇", "media", { desc: "Mute", aliases: ["mute"] });
add(0xa9, "KC_VOLU", "🔊", "media", { desc: "Volume up", aliases: ["volume up"] });
add(0xaa, "KC_VOLD", "🔉", "media", { desc: "Volume down", aliases: ["volume down"] });
add(0xab, "KC_MNXT", "⏭", "media", { desc: "Next track", aliases: ["next"] });
add(0xac, "KC_MPRV", "⏮", "media", { desc: "Previous track", aliases: ["previous"] });
add(0xad, "KC_MSTP", "⏹", "media", { desc: "Stop" });
add(0xae, "KC_MPLY", "⏯", "media", { desc: "Play / pause", aliases: ["play", "pause"] });
add(0xaf, "KC_MSEL", "Media", "media", { desc: "Media select" });
add(0xb0, "KC_EJCT", "⏏", "media", { desc: "Eject" });
add(0xb1, "KC_MAIL", "Mail", "media", { desc: "Launch mail" });
add(0xb2, "KC_CALC", "Calc", "media", { desc: "Launch calculator" });
add(0xb3, "KC_MYCM", "Comp", "media", { desc: "My computer / Finder" });
add(0xb4, "KC_WSCH", "Search", "media", { desc: "Browser search" });
add(0xb5, "KC_WHOM", "WHome", "media", { desc: "Browser home" });
add(0xb6, "KC_WBAK", "WBack", "media", { desc: "Browser back" });
add(0xb7, "KC_WFWD", "WFwd", "media", { desc: "Browser forward" });
add(0xb8, "KC_WSTP", "WStop", "media", { desc: "Browser stop" });
add(0xb9, "KC_WREF", "WRef", "media", { desc: "Browser refresh" });
add(0xba, "KC_WFAV", "WFav", "media", { desc: "Browser favorites" });
add(0xbb, "KC_MFFD", "⏩", "media", { desc: "Fast forward" });
add(0xbc, "KC_MRWD", "⏪", "media", { desc: "Rewind" });
add(0xbd, "KC_BRIU", "🔆", "media", { desc: "Screen brightness up", aliases: ["brightness"] });
add(0xbe, "KC_BRID", "🔅", "media", { desc: "Screen brightness down", aliases: ["brightness"] });
add(0xbf, "KC_CPNL", "Ctrl Pnl", "media", { desc: "Control panel / System Settings" });
add(0xc0, "KC_ASST", "Asst", "media", { desc: "Assistant (Siri)" });
add(0xc1, "KC_MCTL", "Mission", "media", { desc: "Mission Control (macOS)" });
add(0xc2, "KC_LPAD", "Launch", "media", { desc: "Launchpad (macOS)" });

add(0xcd, "MS_UP", "🖱↑", "mouse", { desc: "Mouse cursor up" });
add(0xce, "MS_DOWN", "🖱↓", "mouse", { desc: "Mouse cursor down" });
add(0xcf, "MS_LEFT", "🖱←", "mouse", { desc: "Mouse cursor left" });
add(0xd0, "MS_RGHT", "🖱→", "mouse", { desc: "Mouse cursor right" });
for (let i = 1; i <= 8; i++) add(0xd1 + i - 1, `MS_BTN${i}`, `Btn${i}`, "mouse", { desc: `Mouse button ${i}` });
add(0xd9, "MS_WHLU", "Whl↑", "mouse", { desc: "Mouse wheel up" });
add(0xda, "MS_WHLD", "Whl↓", "mouse", { desc: "Mouse wheel down" });
add(0xdb, "MS_WHLL", "Whl←", "mouse", { desc: "Mouse wheel left" });
add(0xdc, "MS_WHLR", "Whl→", "mouse", { desc: "Mouse wheel right" });
add(0xdd, "MS_ACL0", "Acc0", "mouse", { desc: "Mouse acceleration 0" });
add(0xde, "MS_ACL1", "Acc1", "mouse", { desc: "Mouse acceleration 1" });
add(0xdf, "MS_ACL2", "Acc2", "mouse", { desc: "Mouse acceleration 2" });

add(0xe0, "KC_LCTL", "⌃", "modifiers", { desc: "Left Control", aliases: ["control", "ctrl"], domCode: "ControlLeft" });
add(0xe1, "KC_LSFT", "⇧", "modifiers", { desc: "Left Shift", aliases: ["shift"], domCode: "ShiftLeft" });
add(0xe2, "KC_LALT", "⌥", "modifiers", { desc: "Left Option / Alt", aliases: ["option", "alt"], domCode: "AltLeft" });
add(0xe3, "KC_LGUI", "⌘", "modifiers", { desc: "Left Command / GUI", aliases: ["command", "cmd", "gui", "win"], domCode: "MetaLeft" });
add(0xe4, "KC_RCTL", "R⌃", "modifiers", { desc: "Right Control", aliases: ["control", "ctrl"], domCode: "ControlRight" });
add(0xe5, "KC_RSFT", "R⇧", "modifiers", { desc: "Right Shift", aliases: ["shift"], domCode: "ShiftRight" });
add(0xe6, "KC_RALT", "R⌥", "modifiers", { desc: "Right Option / Alt", aliases: ["option", "alt"], domCode: "AltRight" });
add(0xe7, "KC_RGUI", "R⌘", "modifiers", { desc: "Right Command / GUI", aliases: ["command", "cmd", "gui"], domCode: "MetaRight" });

// Shifted symbols are LSFT(kc) and live in the QK_MODS range.
const SHIFTED: [number, string, string, string][] = [
  [0x1e, "KC_EXLM", "!", "Exclamation"], [0x1f, "KC_AT", "@", "At"], [0x20, "KC_HASH", "#", "Hash"],
  [0x21, "KC_DLR", "$", "Dollar"], [0x22, "KC_PERC", "%", "Percent"], [0x23, "KC_CIRC", "^", "Caret"],
  [0x24, "KC_AMPR", "&", "Ampersand"], [0x25, "KC_ASTR", "*", "Asterisk"], [0x26, "KC_LPRN", "(", "Left paren"],
  [0x27, "KC_RPRN", ")", "Right paren"], [0x2d, "KC_UNDS", "_", "Underscore"], [0x2e, "KC_PLUS", "+", "Plus"],
  [0x2f, "KC_LCBR", "{", "Left brace"], [0x30, "KC_RCBR", "}", "Right brace"], [0x31, "KC_PIPE", "|", "Pipe"],
  [0x33, "KC_COLN", ":", "Colon"], [0x34, "KC_DQUO", '"', "Double quote"], [0x35, "KC_TILD", "~", "Tilde"],
  [0x36, "KC_LABK", "<", "Less than"], [0x37, "KC_RABK", ">", "Greater than"], [0x38, "KC_QUES", "?", "Question mark"],
];
for (const [kc, name, label, desc] of SHIFTED) add((MOD.SFT << 8) | kc, name, label, "symbols", { desc });

// Quantum / special
add(0x7c00, "QK_BOOT", "Boot", "special", { desc: "Reset into bootloader (for flashing)" });
add(0x7c01, "QK_RBT", "Reboot", "special", { desc: "Reboot the keyboard" });
add(0x7c02, "DB_TOGG", "Debug", "special", { desc: "Toggle debug mode" });
add(0x7c03, "EE_CLR", "EE Clr", "special", { desc: "Clear EEPROM (resets keymap!)" });
add(0x7c16, "QK_GESC", "Esc `", "special", { desc: "Grave Escape: Esc, or ` with Shift/GUI" });
add(0x7c1a, "SC_LSPO", "⇧ (", "special", { desc: "Space Cadet: Left Shift, ( when tapped" });
add(0x7c1b, "SC_RSPC", "⇧ )", "special", { desc: "Space Cadet: Right Shift, ) when tapped" });
add(0x7c1e, "SC_SENT", "⇧ ⏎", "special", { desc: "Space Cadet: Right Shift, Enter when tapped" });
add(0x7c58, "QK_LEAD", "Lead", "special", { desc: "Leader key" });
add(0x7c59, "QK_LOCK", "Lock", "special", { desc: "Lock the next key held" });
add(0x7c73, "CW_TOGG", "CapsWd", "special", { desc: "Caps Word toggle" });
add(0x7c77, "TL_LOWR", "Lower", "layers", { desc: "Tri-layer Lower (layer 1; Lower+Upper = layer 3)", aliases: ["lower", "tri layer"] });
add(0x7c78, "TL_UPPR", "Upper", "layers", { desc: "Tri-layer Upper (layer 2; Lower+Upper = layer 3)", aliases: ["upper", "tri layer"] });
add(0x7c7b, "QK_LLCK", "LyrLck", "layers", { desc: "Layer Lock – keep the current layer on" });
add(0x7c50, "CM_ON", "Cmb On", "special", { desc: "Combos on" });
add(0x7c51, "CM_OFF", "Cmb Off", "special", { desc: "Combos off" });
add(0x7c52, "CM_TOGG", "Cmb Tog", "special", { desc: "Combos toggle" });
add(0x7c74, "AC_ON", "AC On", "special", { desc: "Autocorrect on" });
add(0x7c75, "AC_OFF", "AC Off", "special", { desc: "Autocorrect off" });
add(0x7c76, "AC_TOGG", "AC Tog", "special", { desc: "Autocorrect toggle" });
add(0x7c79, "QK_REP", "Repeat", "special", { desc: "Repeat last key" });
add(0x7c7a, "QK_AREP", "AltRep", "special", { desc: "Alternate repeat key" });
add(0x7c13, "AS_ON", "AS On", "special", { desc: "Auto Shift on" });
add(0x7c14, "AS_OFF", "AS Off", "special", { desc: "Auto Shift off" });
add(0x7c15, "AS_TOGG", "AS Tog", "special", { desc: "Auto Shift toggle" });

// RGB Matrix (the Corne v4 per-key lighting) + legacy underglow
const RM: [number, string, string, string][] = [
  [0x7840, "RM_ON", "RGB On", "RGB on"], [0x7841, "RM_OFF", "RGB Off", "RGB off"],
  [0x7842, "RM_TOGG", "RGB Tog", "RGB toggle"], [0x7843, "RM_NEXT", "Mode+", "Next effect"],
  [0x7844, "RM_PREV", "Mode-", "Previous effect"], [0x7845, "RM_HUEU", "Hue+", "Hue up"],
  [0x7846, "RM_HUED", "Hue-", "Hue down"], [0x7847, "RM_SATU", "Sat+", "Saturation up"],
  [0x7848, "RM_SATD", "Sat-", "Saturation down"], [0x7849, "RM_VALU", "Bri+", "LED brightness up"],
  [0x784a, "RM_VALD", "Bri-", "LED brightness down"], [0x784b, "RM_SPDU", "Spd+", "Effect speed up"],
  [0x784c, "RM_SPDD", "Spd-", "Effect speed down"], [0x784d, "RM_FLGN", "Flag+", "Next LED flag"],
  [0x784e, "RM_FLGP", "Flag-", "Previous LED flag"],
];
for (const [code, name, label, desc] of RM) add(code, name, label, "lighting", { desc: `RGB Matrix: ${desc}` });
const UG: [number, string, string, string][] = [
  [0x7820, "UG_TOGG", "UG Tog", "toggle"], [0x7821, "UG_NEXT", "UG Mode+", "next mode"],
  [0x7822, "UG_PREV", "UG Mode-", "previous mode"], [0x7823, "UG_HUEU", "UG Hue+", "hue up"],
  [0x7824, "UG_HUED", "UG Hue-", "hue down"], [0x7825, "UG_SATU", "UG Sat+", "saturation up"],
  [0x7826, "UG_SATD", "UG Sat-", "saturation down"], [0x7827, "UG_VALU", "UG Bri+", "brightness up"],
  [0x7828, "UG_VALD", "UG Bri-", "brightness down"], [0x7829, "UG_SPDU", "UG Spd+", "speed up"],
  [0x782a, "UG_SPDD", "UG Spd-", "speed down"],
];
for (const [code, name, label, desc] of UG) add(code, name, label, "lighting", { desc: `Underglow: ${desc}` });

// Later definitions win (used above to give a few INT/LNG keys nicer labels).
export const KEYCODES: Map<number, KeyDef> = new Map();
for (const d of defs) KEYCODES.set(d.code, d);
export const ALL_KEYS: KeyDef[] = [...KEYCODES.values()];

const byDomCode = new Map<string, number>();
for (const d of ALL_KEYS) if (d.domCode) byDomCode.set(d.domCode, d.code);

/** Map a DOM KeyboardEvent.code (physical key) to a QMK basic keycode. */
export function keycodeFromDomCode(domCode: string): number | undefined {
  return byDomCode.get(domCode);
}

// ---------------------------------------------------------------- mods
// Legends follow the host OS: ⌃⌥⇧⌘ on macOS, Ctrl/Alt/Shift/Win (or Super) elsewhere.
export type ModStyle = "mac" | "windows" | "linux";
let modStyle: ModStyle = "mac";
export function setModStyle(style: ModStyle) {
  modStyle = style;
}

const MOD_ORDER: [number, string][] = [
  [MOD.CTL, "CTL"],
  [MOD.ALT, "ALT"],
  [MOD.SFT, "SFT"],
  [MOD.GUI, "GUI"],
];

/** Short legend and long name for each modifier bit on the current platform. */
export function modNames(): Record<number, { sym: string; name: string }> {
  if (modStyle === "mac")
    return {
      [MOD.CTL]: { sym: "⌃", name: "Control" },
      [MOD.ALT]: { sym: "⌥", name: "Option" },
      [MOD.SFT]: { sym: "⇧", name: "Shift" },
      [MOD.GUI]: { sym: "⌘", name: "Command" },
    };
  const gui = modStyle === "windows" ? "Win" : "Super";
  return {
    [MOD.CTL]: { sym: "Ctrl", name: "Control" },
    [MOD.ALT]: { sym: "Alt", name: "Alt" },
    [MOD.SFT]: { sym: "⇧", name: "Shift" },
    [MOD.GUI]: { sym: gui, name: gui },
  };
}

export function modsLabel(mods: number): string {
  const names = modNames();
  const right = mods & MOD.RIGHT ? "R" : "";
  const parts = MOD_ORDER.filter(([bit]) => mods & bit).map(([bit]) => names[bit].sym);
  return right + parts.join(modStyle === "mac" ? "" : "+");
}

/** Legend for a modifier combination followed by a key, e.g. ⌘C or Ctrl+C. */
function comboLabel(mods: number, key: string): string {
  return modStyle === "mac" ? `${modsLabel(mods)}${key}` : `${modsLabel(mods)}+${key}`;
}

const MOD_KEY_BITS: Record<number, number> = {
  0xe0: MOD.CTL, 0xe1: MOD.SFT, 0xe2: MOD.ALT, 0xe3: MOD.GUI,
  0xe4: MOD.CTL | MOD.RIGHT, 0xe5: MOD.SFT | MOD.RIGHT, 0xe6: MOD.ALT | MOD.RIGHT, 0xe7: MOD.GUI | MOD.RIGHT,
};

export function modsName(mods: number): string {
  const side = mods & MOD.RIGHT ? "R" : "L";
  const parts = MOD_ORDER.filter(([bit]) => mods & bit).map(([, n]) => n);
  return `MOD_${side}${parts.join("|")}`;
}

// ---------------------------------------------------------------- encode
export const encode = {
  mods: (mods: number, kc: number) => ((mods & 0x1f) << 8) | (kc & 0xff),
  modTap: (mods: number, kc: number) => QK.MOD_TAP | ((mods & 0x1f) << 8) | (kc & 0xff),
  layerTap: (layer: number, kc: number) => QK.LAYER_TAP | ((layer & 0x0f) << 8) | (kc & 0xff),
  layerMod: (layer: number, mods: number) => QK.LAYER_MOD | ((layer & 0x0f) << 5) | (mods & 0x1f),
  to: (layer: number) => QK.TO | (layer & 0x1f),
  mo: (layer: number) => QK.MOMENTARY | (layer & 0x1f),
  df: (layer: number) => QK.DEF_LAYER | (layer & 0x1f),
  tg: (layer: number) => QK.TOGGLE_LAYER | (layer & 0x1f),
  osl: (layer: number) => QK.ONE_SHOT_LAYER | (layer & 0x1f),
  osm: (mods: number) => QK.ONE_SHOT_MOD | (mods & 0x1f),
  tt: (layer: number) => QK.LAYER_TAP_TOGGLE | (layer & 0x1f),
  pdf: (layer: number) => QK.PERSISTENT_DEF_LAYER | (layer & 0x1f),
  macro: (n: number) => QK.MACRO | (n & 0x7f),
  tapDance: (n: number) => QK.TAP_DANCE | (n & 0xff),
};

// ---------------------------------------------------------------- decode
export type Kind =
  | "basic"
  | "mods"
  | "modTap"
  | "layerTap"
  | "layerMod"
  | "layer"
  | "oneShotMod"
  | "macro"
  | "tapDance"
  | "user"
  | "known"
  | "unknown";

export interface Decoded {
  code: number;
  kind: Kind;
  /** Main legend (tap action) */
  label: string;
  /** Secondary legend (hold action), if any */
  hold?: string;
  /** QMK-style source expression, e.g. LT(1, KC_SPC) */
  name: string;
  /** Layer this key activates, for colouring layer keys */
  layer?: number;
  category: Category | "other";
}

export const hex = (code: number) => "0x" + code.toString(16).toUpperCase().padStart(4, "0");

function basic(kc: number): { label: string; name: string } {
  const d = KEYCODES.get(kc);
  return d ? { label: d.label, name: d.name } : { label: hex(kc), name: hex(kc) };
}

const LAYER_FNS: [number, string, string][] = [
  [QK.TO, "TO", "TO"],
  [QK.MOMENTARY, "MO", "MO"],
  [QK.DEF_LAYER, "DF", "DF"],
  [QK.TOGGLE_LAYER, "TG", "TG"],
  [QK.ONE_SHOT_LAYER, "OSL", "OSL"],
  [QK.LAYER_TAP_TOGGLE, "TT", "TT"],
  [QK.PERSISTENT_DEF_LAYER, "PDF", "PDF"],
];

export function decode(code: number): Decoded {
  code &= 0xffff;
  const known = KEYCODES.get(code);
  if (known) {
    const kind: Kind = code <= QK.BASIC_MAX ? "basic" : "known";
    const label = MOD_KEY_BITS[code] !== undefined ? modsLabel(MOD_KEY_BITS[code]) : known.label;
    return { code, kind, label, name: known.name, category: known.category };
  }
  if (code <= QK.BASIC_MAX) {
    return { code, kind: "basic", label: hex(code), name: hex(code), category: "other" };
  }
  if (code >= QK.MODS && code <= QK.MODS_MAX) {
    const mods = (code >> 8) & 0x1f;
    const b = basic(code & 0xff);
    return {
      code,
      kind: "mods",
      label: comboLabel(mods, b.label),
      name: `${modWrapperName(mods)}(${b.name})`,
      category: "modifiers",
    };
  }
  if (code >= QK.MOD_TAP && code <= QK.MOD_TAP_MAX) {
    const mods = (code >> 8) & 0x1f;
    const b = basic(code & 0xff);
    return { code, kind: "modTap", label: b.label, hold: modsLabel(mods), name: `MT(${modsName(mods)}, ${b.name})`, category: "modifiers" };
  }
  if (code >= QK.LAYER_TAP && code <= QK.LAYER_TAP_MAX) {
    const layer = (code >> 8) & 0x0f;
    const b = basic(code & 0xff);
    return { code, kind: "layerTap", label: b.label, hold: `L${layer}`, layer, name: `LT(${layer}, ${b.name})`, category: "layers" };
  }
  if (code >= QK.LAYER_MOD && code <= QK.LAYER_MOD_MAX) {
    const layer = (code >> 5) & 0x0f;
    const mods = code & 0x1f;
    return { code, kind: "layerMod", label: `L${layer}`, hold: modsLabel(mods), layer, name: `LM(${layer}, ${modsName(mods)})`, category: "layers" };
  }
  if (code >= QK.ONE_SHOT_MOD && code < QK.ONE_SHOT_MOD + 0x20) {
    const mods = code & 0x1f;
    return { code, kind: "oneShotMod", label: `OS ${modsLabel(mods)}`, name: `OSM(${modsName(mods)})`, category: "modifiers" };
  }
  for (const [base, fn, short] of LAYER_FNS) {
    if (code >= base && code < base + 0x20) {
      const layer = code & 0x1f;
      return { code, kind: "layer", label: `${short} ${layer}`, layer, name: `${fn}(${layer})`, category: "layers" };
    }
  }
  if (code >= QK.MACRO && code <= QK.MACRO_MAX) {
    const n = code - QK.MACRO;
    return { code, kind: "macro", label: `M${n}`, name: `QK_MACRO_${n}`, category: "macro" };
  }
  if (code >= QK.TAP_DANCE && code <= QK.TAP_DANCE_MAX) {
    const n = code - QK.TAP_DANCE;
    return { code, kind: "tapDance", label: `TD${n}`, name: `TD(${n})`, category: "special" };
  }
  if (code >= QK.KB && code <= QK.USER_MAX) {
    const isKb = code <= QK.KB_MAX;
    const n = code - (isKb ? QK.KB : QK.USER);
    return { code, kind: "user", label: `${isKb ? "KB" : "USER"}${n}`, name: `${isKb ? "QK_KB" : "QK_USER"}_${n}`, category: "special" };
  }
  return { code, kind: "unknown", label: hex(code), name: hex(code), category: "other" };
}

/** QMK modifier-wrapper name, e.g. LSFT, LCTL, LCS (Ctrl+Shift), MEH, HYPR. */
export function modWrapperName(mods: number): string {
  const side = mods & MOD.RIGHT ? "R" : "L";
  const m = mods & 0x0f;
  const named: Record<number, string> = {
    [MOD.CTL]: "CTL",
    [MOD.SFT]: "SFT",
    [MOD.ALT]: "ALT",
    [MOD.GUI]: "GUI",
    [MOD.CTL | MOD.SFT]: "CS",
    [MOD.CTL | MOD.ALT]: "CA",
    [MOD.CTL | MOD.GUI]: "CG",
    [MOD.SFT | MOD.ALT]: "SA",
    [MOD.SFT | MOD.GUI]: "SG",
    [MOD.ALT | MOD.GUI]: "AG",
    [MOD.CTL | MOD.SFT | MOD.ALT]: "MEH",
    [MOD.CTL | MOD.SFT | MOD.ALT | MOD.GUI]: "HYPR",
  };
  const n = named[m];
  if (!n) return `MODS_${hex(mods)}`;
  if (n === "MEH" || n === "HYPR") return side === "R" ? `R${n}` : n;
  return side + n;
}

export function search(query: string, pool: KeyDef[] = ALL_KEYS): KeyDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter(
    (d) =>
      d.label.toLowerCase() === q ||
      d.name.toLowerCase().includes(q) ||
      (d.desc ?? "").toLowerCase().includes(q) ||
      (d.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
  );
}
