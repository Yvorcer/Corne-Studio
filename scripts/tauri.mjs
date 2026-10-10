// Runs the Tauri CLI with rustup's toolchain (~/.cargo/bin) first on PATH, so an older
// system Rust (e.g. Homebrew's) doesn't shadow it. Works on macOS, Windows and Linux.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@tauri-apps/cli/package.json")), "tauri.js");

const env = { ...process.env };
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
const cargoBin = join(homedir(), ".cargo", "bin");
if (existsSync(cargoBin)) env[pathKey] = cargoBin + delimiter + (env[pathKey] ?? "");

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
