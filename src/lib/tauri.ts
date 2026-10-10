// Bridges to the Rust side (src-tauri/src/hid.rs, profiles.rs).
import { invoke } from "@tauri-apps/api/core";
import type { Transport } from "./via";

export interface DeviceInfo {
  vendorId: number;
  productId: number;
  /** USB bcdDevice (PCB revision on Corne v4) */
  release: number;
  product: string;
  manufacturer: string;
  serial: string;
  path: string;
}

export const hidTransport: Transport = {
  send: (data) => invoke<number[]>("hid_send", { data }),
};

export const hid = {
  list: () => invoke<DeviceInfo[]>("hid_list"),
  connect: (path?: string) => invoke<DeviceInfo>("hid_connect", { path }),
  disconnect: () => invoke<void>("hid_disconnect"),
};

export const files = {
  profilesDir: () => invoke<string>("profiles_dir_path"),
  list: () => invoke<{ id: string; modified: number }[]>("profiles_list"),
  read: (id: string) => invoke<string>("profile_read", { id }),
  write: (id: string, contents: string) => invoke<string>("profile_write", { id, contents }),
  remove: (id: string) => invoke<void>("profile_delete", { id }),
  readText: (path: string) => invoke<string>("read_text_file", { path }),
  writeText: (path: string, contents: string) => invoke<void>("write_text_file", { path, contents }),
};

/** Diagnostics: printed by the Rust side to stderr. */
export function log(level: "info" | "warn" | "error", message: string) {
  invoke("log_line", { level, message }).catch(() => {});
}
