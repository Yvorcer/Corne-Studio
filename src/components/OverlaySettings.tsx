import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useStore } from "../state/store";
import { previewOverlay } from "../lib/overlaySync";
import { defaultLayerName, type OverlaySettings } from "../lib/settings";
import { layerColor } from "./KeyboardView";
import { isMac } from "../lib/platform";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function OverlaySettingsView() {
  const { overlay, setOverlay, layerCount, layerNames, keymap } = useStore();
  const [atLogin, setAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    isEnabled().then(setAtLogin).catch(() => setAtLogin(null));
  }, []);

  const toggleLogin = async (on: boolean) => {
    try {
      await (on ? enable() : disable());
      setAtLogin(await isEnabled());
    } catch (e) {
      useStore.getState().toast("error", `Couldn't change login item: ${e}`);
    }
  };

  const set = (patch: Partial<OverlaySettings>) => setOverlay(patch);
  const layers = Array.from({ length: layerCount }, (_, l) => l).filter((l) => l > 0 && keymap[l]);

  return (
    <div className="settings">
      <header>
        <h2>Layer overlay</h2>
        <p className="muted">
          Hold a layer key on your Corne and a heads-up display of that layer appears on screen, over any app (even full-screen
          ones). Let go and it disappears. It never takes focus, so you keep typing where you were.
        </p>
      </header>

      <section className="setting-card">
        <div className="setting-row">
          <div>
            <strong>Show the layer overlay</strong>
            <p className="muted small">Reads the keyboard's switch matrix about 40 times a second while on.</p>
          </div>
          <Switch on={overlay.enabled} onChange={(enabled) => set({ enabled })} label="Show the layer overlay" />
        </div>

        <div className={`setting-group ${overlay.enabled ? "" : "disabled"}`}>
          <div className="setting-row">
            <div>
              <strong>Appear after holding for {overlay.delayMs} ms</strong>
              <p className="muted small">Quick layer taps while typing won't flash it. 0 shows it instantly.</p>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              step={50}
              value={overlay.delayMs}
              onChange={(e) => set({ delayMs: Number(e.target.value) })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Opacity {Math.round(overlay.opacity * 100)}%</strong>
              <p className="muted small">Lower is more see-through. Key labels always stay readable.</p>
            </div>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={overlay.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
          </div>
          <div className="setting-row">
            <strong>Position</strong>
            <Segmented
              value={overlay.position}
              options={[
                ["bottom", "Bottom"],
                ["center", "Center"],
                ["top", "Top"],
              ]}
              onChange={(position) => set({ position })}
            />
          </div>
          <div className="setting-row">
            <strong>Size</strong>
            <Segmented
              value={overlay.size}
              options={[
                ["s", "Small"],
                ["m", "Medium"],
                ["l", "Large"],
              ]}
              onChange={(size) => set({ size })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Preview</strong>
              <p className="muted small">Shows the overlay for a layer for 2.5 seconds.</p>
            </div>
            <div className="row gap wrap">
              {layers.map((l) => (
                <button
                  key={l}
                  className="preview-chip"
                  style={{ "--accent": layerColor(l) } as React.CSSProperties}
                  disabled={!overlay.enabled}
                  onClick={() => previewOverlay(l)}
                >
                  <span>{l}</span>
                  {layerNames[l] || defaultLayerName(l)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="setting-card">
        <div className="setting-row">
          <div>
            <strong>Open at login</strong>
            <p className="muted small">Starts Corne Studio in the background so the overlay is always available.</p>
          </div>
          {atLogin === null ? (
            <span className="muted small">Unavailable</span>
          ) : (
            <Switch on={atLogin} onChange={toggleLogin} label="Open at login" />
          )}
        </div>
        <p className="muted small">
          While the overlay is on, closing this window keeps Corne Studio running in the background.{" "}
          {isMac ? "Click its Dock icon to bring the window back; quit with ⌘Q." : "Quit it from the taskbar."}
        </p>
      </section>

      <p className="muted small">
        Shown for layers you <em>hold</em>: MO, LT, TT, LM, OSL and tri-layer Lower/Upper (Lower + Upper → Adjust). Toggled layers
        (TG, TO, DF) aren't reported by the keyboard, so they don't appear.
      </p>
    </div>
  );
}
