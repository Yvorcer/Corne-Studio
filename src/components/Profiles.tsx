import { useCallback, useEffect, useState } from "react";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import { files } from "../lib/tauri";
import { ORIGINAL_BACKUP_ID, parseProfile, slugify, type Profile } from "../lib/profiles";
import { KeyboardView } from "./KeyboardView";
import { LAYOUTS } from "../lib/corneLayout";
import { boardById } from "../lib/boards";

interface Entry {
  id: string;
  profile?: Profile;
  error?: string;
}

export function Profiles() {
  const { snapshot, applyProfile, toast, busy, detection, keys } = useStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [dir, setDir] = useState("");

  const refresh = useCallback(async () => {
    const list = await files.list();
    const loaded = await Promise.all(
      list.map(async ({ id }): Promise<Entry> => {
        try {
          return { id, profile: parseProfile(await files.read(id)) };
        } catch (e) {
          return { id, error: String(e) };
        }
      }),
    );
    // Keep the original backup pinned to the top.
    loaded.sort((a, b) => Number(b.id === ORIGINAL_BACKUP_ID) - Number(a.id === ORIGINAL_BACKUP_ID));
    setEntries(loaded);
  }, []);

  useEffect(() => {
    refresh();
    files.profilesDir().then(setDir).catch(() => {});
  }, [refresh]);

  const saveCurrent = async () => {
    const n = name.trim();
    if (!n) return;
    let id = slugify(n);
    if (entries.some((e) => e.id === id)) {
      if (!(await ask(`A profile called “${n}” already exists. Replace it?`, { title: "Replace profile", kind: "warning" }))) return;
    }
    if (id === ORIGINAL_BACKUP_ID) id = `${id}-copy`;
    await files.write(id, JSON.stringify(snapshot(n), null, 2));
    setName("");
    toast("success", `Saved “${n}”`);
    refresh();
  };

  const apply = async (p: Profile) => {
    const from = boardById(p.board);
    const other =
      from && detection && from.id !== detection.board.id
        ? `\n\nThis profile was made on a ${from.name}. Keys line up by matrix position; keys your ${detection.board.name} has that the profile doesn't keep their current assignment.`
        : "";
    const ok = await ask(
      `Write “${p.name}” to the keyboard? This replaces every layer and all macros currently on the Corne.${other}\n\nTip: save the current setup as a profile first if you want to keep it.`,
      { title: "Apply profile", kind: "warning", okLabel: "Apply" },
    );
    if (ok) await applyProfile(p);
  };

  const remove = async (e: Entry) => {
    const label = e.profile?.name ?? e.id;
    const extra = e.id === ORIGINAL_BACKUP_ID ? "\n\nThis is the backup of the keymap your keyboard came with." : "";
    if (!(await ask(`Delete “${label}”?${extra}`, { title: "Delete profile", kind: "warning", okLabel: "Delete" }))) return;
    await files.remove(e.id);
    refresh();
  };

  const exportProfile = async (e: Entry) => {
    if (!e.profile) return;
    const path = await save({ defaultPath: `${e.id}.json`, filters: [{ name: "Corne Studio profile", extensions: ["json"] }] });
    if (!path) return;
    await files.writeText(path, JSON.stringify(e.profile, null, 2));
    toast("success", "Exported");
  };

  const importProfile = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Corne Studio profile", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return;
    try {
      const p = parseProfile(await files.readText(path));
      let id = slugify(p.name);
      while (entries.some((x) => x.id === id)) id += "-1";
      await files.write(id, JSON.stringify(p, null, 2));
      toast("success", `Imported “${p.name}”`);
      refresh();
    } catch (err) {
      toast("error", String(err));
    }
  };

  const previewEntry = entries.find((e) => e.id === preview)?.profile;

  return (
    <div className="profiles">
      <header className="row gap center-v">
        <div>
          <h2>Profiles</h2>
          <p className="muted small" title={dir}>
            Complete keymap + macro snapshots stored on this Mac.
          </p>
        </div>
        <span className="grow" />
        <input
          placeholder="Name for current setup…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
        />
        <button className="primary" disabled={!name.trim()} onClick={saveCurrent}>
          Save current
        </button>
        <button onClick={importProfile}>Import…</button>
      </header>

      <div className="profile-grid">
        <ul className="profile-list">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`profile ${preview === e.id ? "active" : ""}`}
              onMouseEnter={() => setPreview(e.id)}
              onClick={() => setPreview(e.id)}
            >
              <div className="profile-main">
                <strong>
                  {e.id === ORIGINAL_BACKUP_ID && <span className="badge">backup</span>} {e.profile?.name ?? e.id}
                </strong>
                <span className="muted small">
                  {e.profile ? new Date(e.profile.createdAt).toLocaleString() : `Unreadable: ${e.error}`}
                </span>
              </div>
              <div className="row gap">
                <button className="primary" disabled={!e.profile || busy} onClick={() => e.profile && apply(e.profile)}>
                  Apply
                </button>
                <button disabled={!e.profile} onClick={() => exportProfile(e)}>
                  Export
                </button>
                <button className="danger" onClick={() => remove(e)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {entries.length === 0 && <li className="muted pad">No profiles yet.</li>}
        </ul>
        <div className="profile-preview">
          {previewEntry ? (
            <>
              <p className="muted small">
                Preview · {previewEntry.name} · base layer
                {boardById(previewEntry.board) ? ` · ${boardById(previewEntry.board)!.name}` : ""}
              </p>
              <KeyboardView
                keys={previewEntry.layout ? LAYOUTS[previewEntry.layout].keys : keys}
                codes={previewEntry.keymap[0]}
                layer={0}
              />
            </>
          ) : (
            <p className="muted">Hover a profile to preview its base layer.</p>
          )}
        </div>
      </div>
    </div>
  );
}
