import { create } from "zustand";
import { hid, hidTransport, files, log, type DeviceInfo } from "../lib/tauri";
import { Via, type Keymap } from "../lib/via";
import { parseMacros, serializeMacros, type Macro } from "../lib/macros";
import { CORNE_KEYS, LAYOUTS, type KeyGeom, type LayoutId } from "../lib/corneLayout";
import { boardById, detectBoard, deviceKey, rankDevices, type BoardDef, type Detection } from "../lib/boards";
import { ORIGINAL_BACKUP_ID, fitKeymap, makeProfile, parseProfile, type Profile } from "../lib/profiles";
import { OVERLAY_DEFAULTS, loadJson, loadLayerNames, saveJson, saveLayerNames, type OverlaySettings } from "../lib/settings";

export type Status = "disconnected" | "connecting" | "ready" | "error";
export type View = "keymap" | "macros" | "tester" | "profiles" | "overlay";

interface Edit {
  layer: number;
  row: number;
  col: number;
  from: number;
  to: number;
}

interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

interface State {
  status: Status;
  error?: string;
  device?: DeviceInfo;
  /** All VIA-capable keyboards currently plugged in, recognised Cornes first */
  devices: DeviceInfo[];
  /** Which Corne this is (undefined = unrecognised; the user is asked) */
  detection?: Detection;
  layoutId: LayoutId;
  /** Physical keys of the current layout, for drawing */
  keys: KeyGeom[];
  protocol: number;
  layerCount: number;
  macroCount: number;
  macroBufferSize: number;
  keymap: Keymap;
  macros: Macro[];
  macrosDirty: boolean;
  busy: boolean;

  view: View;
  layer: number;
  selected: { row: number; col: number } | null;
  undoStack: Edit[];
  redoStack: Edit[];
  toasts: Toast[];
  layerNames: string[];
  overlay: OverlaySettings;

  via: Via;
  connect: (path?: string) => Promise<void>;
  chooseBoard: (boardId: string) => Promise<void>;
  setLayout: (layout: LayoutId) => void;
  markDisconnected: () => void;
  reload: () => Promise<void>;
  setView: (v: View) => void;
  setLayer: (l: number) => void;
  select: (k: { row: number; col: number } | null) => void;
  assign: (code: number) => Promise<void>;
  setKey: (layer: number, row: number, col: number, code: number, record?: boolean) => Promise<boolean>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  updateMacros: (macros: Macro[]) => void;
  saveMacros: () => Promise<void>;
  revertMacros: () => Promise<void>;
  snapshot: (name: string) => Profile;
  applyProfile: (p: Profile) => Promise<void>;
  toast: (kind: Toast["kind"], text: string) => void;
  renameLayer: (layer: number, name: string) => void;
  setOverlay: (patch: Partial<OverlaySettings>) => void;
}

let toastId = 0;

// Remembered per keyboard model (vid:pid): the board picked for an unrecognised keyboard,
// and the chosen layout for PCBs that can be built with 5 or 6 columns.
const pref = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`corne-studio.${k}`) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`corne-studio.${k}`, v);
    } catch {
      /* non-essential */
    }
  },
};

function layoutFor(board: BoardDef, device: DeviceInfo): LayoutId {
  const saved = pref.get(`layout.${deviceKey(device)}`) as LayoutId | undefined;
  return saved && board.layouts.includes(saved) ? saved : board.layouts[0];
}

export const useStore = create<State>((set, get) => ({
  status: "disconnected",
  protocol: 0,
  layerCount: 0,
  macroCount: 0,
  macroBufferSize: 0,
  devices: [],
  layoutId: "split_3x6_3_ex2",
  keys: CORNE_KEYS,
  keymap: [],
  macros: [],
  macrosDirty: false,
  busy: false,
  view: "keymap",
  layer: 0,
  selected: null,
  undoStack: [],
  redoStack: [],
  toasts: [],
  layerNames: loadLayerNames(),
  overlay: loadJson("overlay", OVERLAY_DEFAULTS),
  via: new Via(hidTransport, 8, 7),

  connect: async (path) => {
    if (get().status === "connecting") return;
    set({ status: "connecting", error: undefined });
    try {
      const devices = rankDevices(await hid.list());
      set({ devices });
      if (devices.length === 0) throw new Error("No VIA-compatible keyboard found. Is your Corne plugged in?");
      const target = devices.find((d) => d.path === path) ?? devices[0];
      if (get().device) await hid.disconnect();
      const device = await hid.connect(target.path);
      let detection = detectBoard(device);
      if (!detection) {
        const chosen = boardById(pref.get(`board.${deviceKey(device)}`));
        if (chosen) detection = { board: chosen, source: "manual" };
      }
      log("info", `connected ${deviceKey(device)} rel=0x${device.release.toString(16)} "${device.product}" → ${detection ? `${detection.board.id} ${detection.revision ?? ""} (${detection.source})` : "unrecognised"}`);
      set({ device, detection, selected: null, undoStack: [], redoStack: [], keymap: [] });
      if (!detection) {
        set({ status: "ready" }); // the UI asks which Corne this is
        return;
      }
      await setupBoard(detection);
    } catch (e) {
      log("error", `connect failed: ${e instanceof Error ? `${e.message} (${e.stack ?? "no stack"})` : e}`);
      set({ status: "error", error: String(e instanceof Error ? e.message : e) });
    }
  },

  chooseBoard: async (boardId) => {
    const { device } = get();
    const board = boardById(boardId);
    if (!device || !board) return;
    pref.set(`board.${deviceKey(device)}`, board.id);
    try {
      await setupBoard({ board, source: "manual" });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  setLayout: (layoutId) => {
    const { device } = get();
    if (device) pref.set(`layout.${deviceKey(device)}`, layoutId);
    set({ layoutId, keys: LAYOUTS[layoutId].keys, selected: null });
  },

  markDisconnected: () =>
    set({ status: "disconnected", device: undefined, detection: undefined, selected: null, undoStack: [], redoStack: [] }),

  reload: async () => {
    set({ busy: true });
    try {
      const via = get().via;
      const protocol = await via.protocolVersion();
      const layerCount = await via.layerCount();
      const keymap = await via.getKeymap(layerCount);
      const macroCount = await via.macroCount();
      const macroBufferSize = await via.macroBufferSize();
      const macroBytes = await via.getMacroBuffer(macroBufferSize);
      set({
        protocol,
        layerCount,
        keymap,
        macroCount,
        macroBufferSize,
        macros: parseMacros(macroBytes, macroCount),
        macrosDirty: false,
        layer: Math.min(get().layer, layerCount - 1),
      });
    } finally {
      set({ busy: false });
    }
  },

  setView: (view) => set({ view }),
  setLayer: (layer) => set({ layer }),
  select: (selected) => set({ selected }),

  assign: async (code) => {
    const { selected, layer } = get();
    if (!selected) return;
    await get().setKey(layer, selected.row, selected.col, code);
  },

  setKey: async (layer, row, col, code, record = true) => {
    const from = get().keymap[layer]?.[row]?.[col];
    if (from === undefined || from === code) return true;
    const patch = (value: number) =>
      set((s) => ({
        keymap: s.keymap.map((l, li) =>
          li !== layer ? l : l.map((r, ri) => (ri !== row ? r : r.map((c, ci) => (ci === col ? value : c)))),
        ),
      }));
    patch(code); // optimistic
    try {
      await get().via.setKeycode(layer, row, col, code);
      if (record) set((s) => ({ undoStack: [...s.undoStack.slice(-199), { layer, row, col, from, to: code }], redoStack: [] }));
      return true;
    } catch (e) {
      patch(from);
      get().toast("error", `Couldn't write key: ${e}`);
      return false;
    }
  },

  undo: async () => {
    const edit = get().undoStack.at(-1);
    if (!edit) return;
    if (await get().setKey(edit.layer, edit.row, edit.col, edit.from, false)) {
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, edit], layer: edit.layer, selected: { row: edit.row, col: edit.col } }));
    }
  },

  redo: async () => {
    const edit = get().redoStack.at(-1);
    if (!edit) return;
    if (await get().setKey(edit.layer, edit.row, edit.col, edit.to, false)) {
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, edit], layer: edit.layer, selected: { row: edit.row, col: edit.col } }));
    }
  },

  updateMacros: (macros) => set({ macros, macrosDirty: true }),

  saveMacros: async () => {
    const { macros, macroCount, macroBufferSize } = get();
    set({ busy: true });
    try {
      await get().via.setMacroBuffer(serializeMacros(macros, macroCount), macroBufferSize);
      set({ macrosDirty: false });
      get().toast("success", "Macros saved to keyboard");
    } catch (e) {
      get().toast("error", `Couldn't save macros: ${e}`);
    } finally {
      set({ busy: false });
    }
  },

  revertMacros: async () => {
    const { macroCount, macroBufferSize } = get();
    const bytes = await get().via.getMacroBuffer(macroBufferSize);
    set({ macros: parseMacros(bytes, macroCount), macrosDirty: false });
  },

  snapshot: (name) => {
    const s = get();
    return makeProfile({
      name,
      device: { vendorId: s.device?.vendorId ?? 0, productId: s.device?.productId ?? 0, product: s.device?.product ?? "" },
      board: s.detection?.board.id,
      layout: s.layoutId,
      viaProtocol: s.protocol,
      keymap: s.keymap,
      macroBytes: serializeMacros(s.macros, s.macroCount),
    });
  },

  applyProfile: async (p) => {
    const s = get();
    set({ busy: true });
    try {
      const keymap = fitKeymap(p.keymap, s.keymap);
      await s.via.setKeymap(keymap);
      const macroBytes = p.macroBytes.slice(0, s.macroBufferSize - 1);
      await s.via.setMacroBuffer(macroBytes, s.macroBufferSize);
      await get().reload();
      set({ undoStack: [], redoStack: [] });
      get().toast("success", `Applied “${p.name}”`);
    } catch (e) {
      get().toast("error", `Couldn't apply profile: ${e}`);
    } finally {
      set({ busy: false });
    }
  },

  renameLayer: (layer, name) => {
    const layerNames = [...get().layerNames];
    layerNames[layer] = name.trim();
    saveLayerNames(layerNames);
    set({ layerNames });
  },

  setOverlay: (patch) => {
    const overlay = { ...get().overlay, ...patch };
    saveJson("overlay", overlay);
    set({ overlay });
  },

  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 6000 : 3000);
  },
}));

/** Configure the VIA client and drawing for a recognised (or user-chosen) board, then load it. */
async function setupBoard(detection: Detection) {
  const { device } = useStore.getState();
  if (!device) return;
  const layoutId = layoutFor(detection.board, device);
  useStore.setState({
    detection,
    via: new Via(hidTransport, detection.board.rows, detection.board.cols),
    layoutId,
    keys: LAYOUTS[layoutId].keys,
  });
  await useStore.getState().reload();
  useStore.setState({ status: "ready" });
  await ensureOriginalBackup(useStore.getState());
}

/** The first time we ever see a keyboard model, save its keymap so it can always be restored. */
async function ensureOriginalBackup(s: State) {
  if (!s.device) return;
  try {
    const existing = (await files.list()).filter((p) => p.id.startsWith(ORIGINAL_BACKUP_ID));
    for (const { id } of existing) {
      try {
        const p = parseProfile(await files.read(id));
        if (p.device.vendorId === s.device.vendorId && p.device.productId === s.device.productId) return;
      } catch {
        /* unreadable backup: ignore */
      }
    }
    const id = existing.length === 0 ? ORIGINAL_BACKUP_ID : `${ORIGINAL_BACKUP_ID}-${deviceKey(s.device).replace(":", "-")}`;
    const name = s.detection ? `Original keymap · ${s.detection.board.name} (auto-backup)` : "Original keymap (auto-backup)";
    await files.write(id, JSON.stringify(s.snapshot(name), null, 2));
    s.toast("info", "Saved a backup of your original keymap in Profiles");
  } catch (e) {
    log("error", `backup failed: ${e}`);
    s.toast("error", `Couldn't create backup: ${e}`);
  }
}
