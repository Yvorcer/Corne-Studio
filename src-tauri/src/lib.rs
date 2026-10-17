mod hid;
mod overlay;
mod profiles;
mod tray;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

/// Frontend diagnostics end up on stderr (visible in `npm run tauri dev`).
#[tauri::command]
fn log_line(level: String, message: String) {
    eprintln!("[corne-studio:{level}] {message}");
}

/// Passed by the login item: start in the menu bar without opening the window.
const BACKGROUND_ARG: &str = "--background";

/// The Dock icon is only shown while the editor window is open; otherwise Corne Studio is a
/// menu-bar utility.
fn set_dock_icon(app: &tauri::AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    });
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
}

pub fn show_main(app: &tauri::AppHandle) {
    set_dock_icon(app, true);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn hide_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    set_dock_icon(app, false);
}

/// Turn on "Open at login" once, the first time an installed copy runs, so the overlay is
/// always available. The switch on the Layer overlay screen turns it off again.
fn enable_login_item_once(app: &tauri::AppHandle) {
    let Ok(exe) = std::env::current_exe() else { return };
    let exe = exe.to_string_lossy();
    // Never register dev builds or copies inside the source tree.
    if cfg!(debug_assertions) || exe.contains("/target/") {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else { return };
    let marker = dir.join("login-item-initialized");
    if marker.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(marker, "");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![BACKGROUND_ARG]),
        ))
        .manage(hid::HidState::new())
        .manage(overlay::OverlayState::default())
        .setup(|app| {
            let handle = app.handle();
            hid::spawn_hotplug_watcher(handle.clone());
            overlay::create_window(handle)?;
            overlay::spawn_poller(handle.clone());
            tray::create(handle)?;
            if std::env::args().any(|a| a == BACKGROUND_ARG) {
                set_dock_icon(handle, false);
            } else {
                show_main(handle);
            }
            enable_login_item_once(handle);
            Ok(())
        })
        .on_window_event(|win, event| {
            // With the layer overlay on, closing the window keeps Corne Studio running in the
            // menu bar. Otherwise closing quits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" {
                    let app = win.app_handle();
                    if app.state::<overlay::OverlayState>().enabled() {
                        api.prevent_close();
                        hide_main(app);
                    } else {
                        app.exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            log_line,
            hid::hid_list,
            hid::hid_connect,
            hid::hid_disconnect,
            hid::hid_send,
            overlay::overlay_configure,
            overlay::overlay_get_config,
            overlay::overlay_preview,
            profiles::profiles_dir_path,
            profiles::profiles_list,
            profiles::profile_read,
            profiles::profile_write,
            profiles::profile_delete,
            profiles::read_text_file,
            profiles::write_text_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Dock icon clicked (only visible while the window is open, or right after launch).
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            let _ = (app, event);
        });
}
