//! Layer overlay: while enabled, a background thread reads the keyboard's switch matrix,
//! works out which layer is being held, and shows a floating, click-through window with
//! that layer's keymap. Layer keys send nothing to the computer, so the matrix is the only
//! reliable signal.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::utils::config::WindowEffectsConfig;
use tauri::window::{Effect, EffectState};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::hid::HidState;

pub const LABEL: &str = "overlay";
const POLL: Duration = Duration::from_millis(25);
const IDLE: Duration = Duration::from_millis(300);
const PREVIEW: Duration = Duration::from_millis(2500);

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfig {
    pub enabled: bool,
    /// Hold a layer this long before the overlay appears (quick taps while typing don't flash it)
    pub delay_ms: u64,
    /// "bottom" | "top" | "center"
    pub position: String,
    /// Window size in logical pixels, computed by the frontend from the layout
    pub width: f64,
    pub height: f64,
    pub rows: usize,
    pub cols: usize,
    /// keymap[layer][row][col]
    pub keymap: Vec<Vec<Vec<u16>>>,
    /// Data only the overlay webview needs (layout id, layer names, board name)
    pub view: serde_json::Value,
}

#[derive(Default)]
pub struct OverlayState {
    config: Mutex<OverlayConfig>,
    preview: Mutex<Option<(u8, Instant)>>,
}

impl OverlayState {
    pub fn enabled(&self) -> bool {
        self.config.lock().map(|c| c.enabled).unwrap_or(false)
    }
}

#[derive(Clone, PartialEq, Serialize)]
struct LayerEvent {
    layer: u8,
    /// Bitmask of active layers, so the overlay can show what transparent keys fall through to
    mask: u32,
    pressed: Vec<[usize; 2]>,
}

// ------------------------------------------------------------------------- layer logic

const KC_TRNS: u16 = 0x0001;
const TL_LOWR: u16 = 0x7C77;
const TL_UPPR: u16 = 0x7C78;
/// QMK tri-layer defaults: Lower = 1, Upper = 2, both together = 3.
const TRI: (u8, u8, u8) = (1, 2, 3);

enum Held {
    Layer(u8),
    Lower,
    Upper,
}

/// What a held key does to the layer state (QMK keycode protocol v12+).
fn held_action(code: u16) -> Option<Held> {
    Some(match code {
        0x4000..=0x4FFF => Held::Layer(((code >> 8) & 0x0F) as u8), // LT(layer, kc), held
        0x5000..=0x51FF => Held::Layer(((code >> 5) & 0x0F) as u8), // LM(layer, mods)
        0x5220..=0x523F => Held::Layer((code & 0x1F) as u8),        // MO(layer)
        0x5280..=0x529F => Held::Layer((code & 0x1F) as u8),        // OSL(layer), held
        0x52C0..=0x52DF => Held::Layer((code & 0x1F) as u8),        // TT(layer), held
        TL_LOWR => Held::Lower,
        TL_UPPR => Held::Upper,
        _ => return None,
    })
}

/// Active-layer bitmask for the given pressed matrix positions. Each pressed key is looked up
/// on the highest active layer where it isn't transparent, like QMK does; repeated until stable
/// so layer keys on other layers (e.g. MO(3) on layer 1) are followed.
pub fn active_layers(keymap: &[Vec<Vec<u16>>], pressed: &[(usize, usize)]) -> u32 {
    let layers = keymap.len().min(32);
    let valid = |n: u8| (n as usize) < layers;
    let mut active: u32 = 1;
    for _ in 0..8 {
        let (mut next, mut lower, mut upper) = (1u32, false, false);
        for &(r, c) in pressed {
            let code = (0..layers)
                .rev()
                .filter(|&l| active & (1 << l) != 0)
                .map(|l| keymap[l].get(r).and_then(|row| row.get(c)).copied().unwrap_or(0))
                .find(|&k| k != KC_TRNS)
                .unwrap_or(0);
            match held_action(code) {
                Some(Held::Layer(n)) if valid(n) => next |= 1 << n,
                Some(Held::Lower) => lower = true,
                Some(Held::Upper) => upper = true,
                _ => {}
            }
        }
        for (on, n) in [(lower, TRI.0), (upper, TRI.1), (lower && upper, TRI.2)] {
            if on && valid(n) {
                next |= 1 << n;
            }
        }
        if next == active {
            break;
        }
        active = next;
    }
    active
}

fn highest(mask: u32) -> u8 {
    31 - mask.leading_zeros() as u8
}

/// Where the row bytes start in a VIA switch-matrix reply. Current QMK replies
/// `[0x02, 0x03, offset, rows…]` (the request's row offset is echoed back); older firmware
/// has no offset byte: `[0x02, 0x03, rows…]`.
pub fn matrix_rows_start(probe_reply: &[u8], probe_offset: u8) -> usize {
    if probe_reply.get(2) == Some(&probe_offset) { 3 } else { 2 }
}

/// Rows are `ceil(cols/8)` big-endian bytes each; bit n = column n.
pub fn parse_matrix(reply: &[u8], start: usize, rows: usize, cols: usize) -> Vec<(usize, usize)> {
    let bytes_per_row = cols.div_ceil(8);
    let mut out = Vec::new();
    for r in 0..rows {
        let mut v: u32 = 0;
        for b in 0..bytes_per_row {
            v = (v << 8) | *reply.get(start + r * bytes_per_row + b).unwrap_or(&0) as u32;
        }
        out.extend((0..cols).filter(|c| (v >> c) & 1 == 1).map(|c| (r, c)));
    }
    out
}

// ------------------------------------------------------------------------- window

pub fn create_window(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?overlay=1".into()))
        .title("Corne Studio layer overlay")
        .inner_size(820.0, 340.0)
        .transparent(true)
        // Native frosted blur of whatever is behind the panel (macOS HUD material, like the
        // volume pop-up). Kept "active" because the overlay never becomes the key window.
        // Corner radius matches .ov-card in src/overlay/overlay.css. Ignored on Linux.
        .effects(WindowEffectsConfig {
            effects: vec![Effect::HudWindow],
            state: Some(EffectState::Active),
            radius: Some(22.0),
            color: None,
            interactive: false,
        })
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        // never becomes the key window, so typing keeps going to the app you're in
        .focusable(false)
        .visible_on_all_workspaces(true)
        .build()?;
    let _ = win.set_ignore_cursor_events(true);
    #[cfg(target_os = "macos")]
    macos::float_over_fullscreen_apps(&win);
    Ok(())
}

fn place(app: &AppHandle, win: &WebviewWindow, cfg: &OverlayConfig) {
    let size = LogicalSize::new(cfg.width.max(320.0), cfg.height.max(160.0));
    let _ = win.set_size(size);
    // Show it on the display the mouse pointer is on.
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let scale = m.scale_factor();
    let area = m.work_area();
    let (ax, ay) = (area.position.x as f64 / scale, area.position.y as f64 / scale);
    let (aw, ah) = (area.size.width as f64 / scale, area.size.height as f64 / scale);
    let x = ax + (aw - size.width) / 2.0;
    let y = match cfg.position.as_str() {
        "top" => ay + 24.0,
        "center" => ay + (ah - size.height) / 2.0,
        _ => ay + ah - size.height - 24.0,
    };
    let _ = win.set_position(LogicalPosition::new(x, y));
}

fn show(app: &AppHandle, cfg: &OverlayConfig, ev: &LayerEvent) {
    eprintln!("[overlay] show layer {} after {} ms hold", ev.layer, cfg.delay_ms);
    let Some(win) = app.get_webview_window(LABEL) else { return };
    let _ = app.emit_to(LABEL, "overlay-show", ev);
    place(app, &win, cfg);
    // Give the webview a moment to draw the new layer before it becomes visible.
    thread::sleep(Duration::from_millis(40));
    let _ = win.show();
}

fn hide(app: &AppHandle) {
    eprintln!("[overlay] hide");
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
    }
    let _ = app.emit_to(LABEL, "overlay-hide", ());
}

// ------------------------------------------------------------------------- poller

pub fn spawn_poller(app: AppHandle) {
    thread::spawn(move || {
        let mut shown: Option<LayerEvent> = None;
        // Row-data position in matrix replies; detected per connection (see matrix_rows_start).
        let mut rows_start: Option<usize> = None;
        let mut candidate: Option<(u8, Instant)> = None;
        let state = app.state::<OverlayState>();
        let mut last_seen: Option<(u32, usize)> = None;
        let mut layer_since = Instant::now();
        // Debug builds: CORNE_OVERLAY_PREVIEW=<layer> previews a layer shortly after startup.
        #[cfg(debug_assertions)]
        if let Some(layer) = std::env::var("CORNE_OVERLAY_PREVIEW").ok().and_then(|v| v.parse::<u8>().ok()) {
            let app = app.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(8)); // after the keymap has loaded
                *app.state::<OverlayState>().preview.lock().unwrap() = Some((layer, Instant::now() + Duration::from_secs(10)));
                eprintln!("[overlay] debug preview of layer {layer} started");
            });
        }
        loop {
            let cfg = state.config.lock().map(|c| c.clone()).unwrap_or_default();
            let preview = {
                let mut p = state.preview.lock().unwrap();
                if p.is_some_and(|(_, until)| Instant::now() >= until) {
                    *p = None;
                }
                p.map(|(layer, _)| layer)
            };

            let reading = cfg.enabled && !cfg.keymap.is_empty();
            let hid = app.state::<HidState>();
            if reading && rows_start.is_none() {
                // Ask for row offset 1: firmware that echoes it uses the newer reply layout.
                rows_start = hid.transact(&[0x02, 0x03, 0x01]).ok().map(|r| matrix_rows_start(&r, 1));
            }
            let pressed = match (reading, rows_start) {
                (true, Some(start)) => match hid.transact(&[0x02, 0x03, 0x00]) {
                    Ok(reply) if reply[0] == 0x02 => Some(parse_matrix(&reply, start, cfg.rows, cfg.cols)),
                    _ => None, // not connected, or firmware without matrix access
                },
                _ => None,
            };
            if pressed.is_none() {
                rows_start = None; // re-detect after a reconnect
            }
            if pressed.is_none() && preview.is_none() {
                if shown.take().is_some() {
                    hide(&app);
                }
                candidate = None;
                thread::sleep(IDLE);
                continue;
            }

            let pressed = pressed.unwrap_or_default();
            let mut mask = active_layers(&cfg.keymap, &pressed);
            if let Some(layer) = preview.filter(|_| mask == 1) {
                mask = (1 << layer) | 1;
            }
            let layer = highest(mask);
            if last_seen.map(|(m, _)| m) != Some(mask) {
                let prev = last_seen.map(|(m, _)| highest(m)).unwrap_or(0);
                eprintln!(
                    "[overlay] layer {prev} → {layer} (mask {mask:#06b}); layer {prev} was active for {} ms",
                    layer_since.elapsed().as_millis()
                );
                layer_since = Instant::now();
            }
            #[cfg(debug_assertions)]
            if last_seen != Some((mask, pressed.len())) {
                eprintln!("[overlay] layer {layer} (mask {mask:#06b}) pressed {pressed:?}");
            }
            last_seen = Some((mask, pressed.len()));
            let ev = LayerEvent { layer, mask, pressed: pressed.iter().map(|&(r, c)| [r, c]).collect() };

            if layer == 0 {
                candidate = None;
                if shown.take().is_some() {
                    hide(&app);
                }
            } else if shown.is_some() {
                // Already visible: follow layer changes and key presses immediately.
                if shown.as_ref() != Some(&ev) {
                    let _ = app.emit_to(LABEL, "overlay-update", &ev);
                    shown = Some(ev);
                }
            } else {
                let since = match candidate {
                    Some((l, t)) if l == layer => t,
                    _ => {
                        candidate = Some((layer, Instant::now()));
                        Instant::now()
                    }
                };
                if preview.is_some() || since.elapsed() >= Duration::from_millis(cfg.delay_ms) {
                    show(&app, &cfg, &ev);
                    shown = Some(ev);
                }
            }
            thread::sleep(POLL);
        }
    });
}

// ------------------------------------------------------------------------- commands

#[tauri::command]
pub fn overlay_configure(app: AppHandle, state: tauri::State<'_, OverlayState>, config: OverlayConfig) {
    let enabled = config.enabled;
    eprintln!(
        "[overlay] configured: enabled={enabled} delay={}ms layers={} matrix={}x{} size={}x{}",
        config.delay_ms,
        config.keymap.len(),
        config.rows,
        config.cols,
        config.width,
        config.height
    );
    *state.config.lock().unwrap() = config.clone();
    #[cfg(target_os = "macos")]
    macos::set_app_nap_disabled(enabled);
    let _ = app.emit_to(LABEL, "overlay-config", &config);
    // Size or position changed while it's on screen (e.g. dragging the size setting): follow.
    if let Some(win) = app.get_webview_window(LABEL) {
        if win.is_visible().unwrap_or(false) {
            place(&app, &win, &config);
        }
    }
}

#[tauri::command]
pub fn overlay_get_config(state: tauri::State<'_, OverlayState>) -> OverlayConfig {
    state.config.lock().unwrap().clone()
}

/// Show the overlay for `layer` for a couple of seconds (the "Test" button).
#[tauri::command]
pub fn overlay_preview(state: tauri::State<'_, OverlayState>, layer: u8) {
    *state.preview.lock().unwrap() = Some((layer, Instant::now() + PREVIEW));
}

// ------------------------------------------------------------------------- macOS specifics

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::{NSObjectProtocol, ProtocolObject};
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    /// Also appear over full-screen apps, and stay out of ⌘` window cycling.
    pub fn float_over_fullscreen_apps(win: &tauri::WebviewWindow) {
        let Ok(ptr) = win.ns_window() else { return };
        // SAFETY: Tauri hands out the live NSWindow; this runs on the main thread during setup.
        let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        ns.setCollectionBehavior(
            ns.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
    }

    struct Activity(Retained<ProtocolObject<dyn NSObjectProtocol>>);
    // SAFETY: the token is only stored and handed back to NSProcessInfo.
    unsafe impl Send for Activity {}
    static ACTIVITY: Mutex<Option<Activity>> = Mutex::new(None);

    /// With the window hidden macOS would App-Nap the process and stretch the 25 ms poll to
    /// about a second. Declaring user-initiated activity keeps the overlay responsive.
    pub fn set_app_nap_disabled(disabled: bool) {
        let mut slot = ACTIVITY.lock().unwrap();
        let info = NSProcessInfo::processInfo();
        match (disabled, slot.is_some()) {
            (true, false) => {
                let reason = NSString::from_str("Showing the Corne layer overlay");
                let token = info.beginActivityWithOptions_reason(NSActivityOptions::UserInitiatedAllowingIdleSystemSleep, &reason);
                *slot = Some(Activity(token));
            }
            (false, true) => {
                if let Some(Activity(token)) = slot.take() {
                    unsafe { info.endActivity(&token) };
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2 layers × 2×2 matrix helper
    fn km(layers: &[[[u16; 2]; 2]]) -> Vec<Vec<Vec<u16>>> {
        layers.iter().map(|l| l.iter().map(|r| r.to_vec()).collect()).collect()
    }

    #[test]
    fn momentary_and_layer_tap() {
        let k = km(&[[[0x5221, 0x4204], [0x0004, 0x0005]], [[0x0001, 0x0001], [0x001E, 0x001F]], [[0x0001; 2]; 2]]);
        assert_eq!(active_layers(&k, &[]), 0b1);
        assert_eq!(active_layers(&k, &[(0, 0)]), 0b11); // MO(1)
        assert_eq!(active_layers(&k, &[(0, 1)]), 0b101); // LT(2, A) held
        assert_eq!(active_layers(&k, &[(1, 0)]), 0b1); // plain key
    }

    #[test]
    fn tri_layer_lower_upper_adjust() {
        // Mirrors the Corne v4 default: thumbs are TL_LOWR / TL_UPPR, transparent above.
        let mut k = vec![vec![vec![0u16; 2]; 1]; 4];
        k[0][0] = vec![TL_LOWR, TL_UPPR];
        for l in 1..4 {
            k[l][0] = vec![KC_TRNS, KC_TRNS];
        }
        assert_eq!(highest(active_layers(&k, &[(0, 0)])), 1);
        assert_eq!(highest(active_layers(&k, &[(0, 1)])), 2);
        assert_eq!(active_layers(&k, &[(0, 0), (0, 1)]), 0b1111);
    }

    #[test]
    fn follows_layer_keys_on_other_layers() {
        // MO(1) on base; on layer 1 another key is MO(3).
        let k = km(&[[[0x5221, 0x0004], [0; 2]], [[0x0001, 0x5223], [0; 2]], [[0; 2]; 2], [[0x0001; 2]; 2]]);
        assert_eq!(highest(active_layers(&k, &[(0, 0), (0, 1)])), 3);
    }

    #[test]
    fn ignores_layers_the_board_doesnt_have() {
        let k = km(&[[[0x5225, 0], [0; 2]]]);
        assert_eq!(active_layers(&k, &[(0, 0)]), 0b1);
    }

    #[test]
    fn parses_switch_matrix_with_offset_byte() {
        // Current QMK (as on the Corne v4): [cmd, id, offset, rows…]
        let reply = [0x02, 0x03, 0x00, 0b0000_0001, 0, 0, 0b0100_0000, 0, 0, 0, 0b0000_1000];
        assert_eq!(parse_matrix(&reply, 3, 8, 7), vec![(0, 0), (3, 6), (7, 3)]);
    }

    #[test]
    fn parses_switch_matrix_without_offset_byte() {
        let reply = [0x02, 0x03, 0b0000_0001, 0, 0, 0b0100_0000, 0, 0, 0, 0b0000_1000];
        assert_eq!(parse_matrix(&reply, 2, 8, 7), vec![(0, 0), (3, 6), (7, 3)]);
    }

    #[test]
    fn detects_reply_layout_from_offset_echo() {
        assert_eq!(matrix_rows_start(&[0x02, 0x03, 0x01, 0, 0], 1), 3);
        assert_eq!(matrix_rows_start(&[0x02, 0x03, 0x00, 0, 0], 1), 2);
    }
}
