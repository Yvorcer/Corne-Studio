// VIA raw-HID protocol client (QMK `quantum/via.h`).
// Requests and replies are 32-byte reports; the transport is injected so this is testable.

export interface Transport {
  send(data: number[]): Promise<number[]>;
}

export const CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  SET_KEYBOARD_VALUE: 0x03,
  GET_KEYCODE: 0x04,
  SET_KEYCODE: 0x05,
  KEYMAP_RESET: 0x06,
  MACRO_GET_COUNT: 0x0c,
  MACRO_GET_BUFFER_SIZE: 0x0d,
  MACRO_GET_BUFFER: 0x0e,
  MACRO_SET_BUFFER: 0x0f,
  MACRO_RESET: 0x10,
  GET_LAYER_COUNT: 0x11,
  KEYMAP_GET_BUFFER: 0x12,
  KEYMAP_SET_BUFFER: 0x13,
  UNHANDLED: 0xff,
} as const;

export const KBVAL = {
  UPTIME: 0x01,
  LAYOUT_OPTIONS: 0x02,
  SWITCH_MATRIX_STATE: 0x03,
  FIRMWARE_VERSION: 0x04,
} as const;

/** Max payload per buffer read/write: 32 bytes minus cmd, offset(2), size. */
export const CHUNK = 28;

export class UnhandledCommandError extends Error {
  constructor(cmd: number) {
    super(`Keyboard does not support VIA command 0x${cmd.toString(16)}`);
  }
}

export type Keymap = number[][][]; // [layer][row][col]

export class Via {
  constructor(
    private t: Transport,
    readonly rows = 8,
    readonly cols = 7,
  ) {}

  private async cmd(bytes: number[]): Promise<number[]> {
    const reply = await this.t.send(bytes);
    if (reply[0] === CMD.UNHANDLED && bytes[0] !== CMD.UNHANDLED) throw new UnhandledCommandError(bytes[0]);
    return reply;
  }

  async protocolVersion(): Promise<number> {
    const r = await this.cmd([CMD.GET_PROTOCOL_VERSION]);
    return (r[1] << 8) | r[2];
  }

  async layerCount(): Promise<number> {
    return (await this.cmd([CMD.GET_LAYER_COUNT]))[1];
  }

  async macroCount(): Promise<number> {
    return (await this.cmd([CMD.MACRO_GET_COUNT]))[1];
  }

  async macroBufferSize(): Promise<number> {
    const r = await this.cmd([CMD.MACRO_GET_BUFFER_SIZE]);
    return (r[1] << 8) | r[2];
  }

  async firmwareVersion(): Promise<number> {
    const r = await this.cmd([CMD.GET_KEYBOARD_VALUE, KBVAL.FIRMWARE_VERSION]);
    return ((r[2] << 24) | (r[3] << 16) | (r[4] << 8) | r[5]) >>> 0;
  }

  async getKeycode(layer: number, row: number, col: number): Promise<number> {
    const r = await this.cmd([CMD.GET_KEYCODE, layer, row, col]);
    return (r[4] << 8) | r[5];
  }

  async setKeycode(layer: number, row: number, col: number, code: number): Promise<void> {
    const r = await this.cmd([CMD.SET_KEYCODE, layer, row, col, (code >> 8) & 0xff, code & 0xff]);
    if (r[0] !== CMD.SET_KEYCODE) throw new Error("Unexpected reply while setting keycode");
  }

  private async readBuffer(command: number, size: number): Promise<number[]> {
    const out: number[] = [];
    for (let offset = 0; offset < size; offset += CHUNK) {
      const n = Math.min(CHUNK, size - offset);
      const r = await this.cmd([command, (offset >> 8) & 0xff, offset & 0xff, n]);
      out.push(...r.slice(4, 4 + n));
    }
    return out;
  }

  private async writeBuffer(command: number, data: number[], start = 0): Promise<void> {
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      const offset = start + i;
      await this.cmd([command, (offset >> 8) & 0xff, offset & 0xff, chunk.length, ...chunk]);
    }
  }

  async getKeymap(layers: number): Promise<Keymap> {
    const bytes = await this.readBuffer(CMD.KEYMAP_GET_BUFFER, layers * this.rows * this.cols * 2);
    return parseKeymapBuffer(bytes, layers, this.rows, this.cols);
  }

  async setKeymap(keymap: Keymap): Promise<void> {
    await this.writeBuffer(CMD.KEYMAP_SET_BUFFER, serializeKeymap(keymap));
  }

  async getMacroBuffer(size: number): Promise<number[]> {
    return this.readBuffer(CMD.MACRO_GET_BUFFER, size);
  }

  /**
   * Write macros the same way VIA does: mark the buffer "in progress" by setting the
   * last byte non-zero (firmware refuses to play macros then), write, then clear it.
   */
  async setMacroBuffer(data: number[], bufferSize: number): Promise<void> {
    if (data.length > bufferSize) throw new Error(`Macros use ${data.length} bytes but the keyboard only has ${bufferSize}`);
    const last = bufferSize - 1;
    await this.writeBuffer(CMD.MACRO_SET_BUFFER, [0xff], last);
    await this.writeBuffer(CMD.MACRO_SET_BUFFER, data);
    await this.writeBuffer(CMD.MACRO_SET_BUFFER, [0x00], last);
  }

  /** Byte where row data starts in matrix replies (3 on current QMK, 2 on older firmware). */
  private matrixRowsStart?: number;

  /** Returns pressed[row][col] for the physical switch matrix (both halves). */
  async matrixState(): Promise<boolean[][]> {
    if (this.matrixRowsStart === undefined) {
      // Current QMK echoes the requested row offset in byte 2 and puts rows after it.
      const probe = await this.cmd([CMD.GET_KEYBOARD_VALUE, KBVAL.SWITCH_MATRIX_STATE, 1]);
      this.matrixRowsStart = probe[2] === 1 ? 3 : 2;
    }
    const r = await this.cmd([CMD.GET_KEYBOARD_VALUE, KBVAL.SWITCH_MATRIX_STATE, 0]);
    return parseMatrixState(r.slice(this.matrixRowsStart), this.rows, this.cols);
  }
}

export function parseKeymapBuffer(bytes: number[], layers: number, rows: number, cols: number): Keymap {
  const km: Keymap = [];
  let i = 0;
  for (let l = 0; l < layers; l++) {
    const layer: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++, i += 2) row.push(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
      layer.push(row);
    }
    km.push(layer);
  }
  return km;
}

export function serializeKeymap(km: Keymap): number[] {
  const out: number[] = [];
  for (const layer of km) for (const row of layer) for (const code of row) out.push((code >> 8) & 0xff, code & 0xff);
  return out;
}

/** Each matrix row is packed big-endian into ceil(cols/8) bytes, bit N = column N. */
export function parseMatrixState(data: number[], rows: number, cols: number): boolean[][] {
  const bytesPerRow = Math.ceil(cols / 8);
  const out: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    let value = 0;
    for (let b = 0; b < bytesPerRow; b++) value = (value << 8) | (data[r * bytesPerRow + b] ?? 0);
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) row.push(((value >> c) & 1) === 1);
    out.push(row);
  }
  return out;
}
