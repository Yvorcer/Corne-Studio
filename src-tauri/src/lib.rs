mod hid;
mod overlay;
mod profiles;

use tauri::{Manager, RunEvent, WindowEvent};

/// Frontend diagnostics end up on stderr (visible in `npm run tauri dev`).
#[tauri::command]
fn log_line(level: String, message: String) {
    eprintln!("[corne-studio:{level}] {message}");
}

/// Passed by the login item: start without showing the main window.
const BACKGROUND_ARG: &str = "--background";

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
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
            hid::spawn_hotplug_watcher(app.handle().clone());
            overlay::create_window(app.handle())?;
            overlay::spawn_poller(app.handle().clone());
            if !std::env::args().any(|a| a == BACKGROUND_ARG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|win, event| {
            // With the layer overlay on, closing the window keeps the app running in the
            // background (click the Dock icon to bring it back). Otherwise closing quits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" {
                    let keep_running = win.app_handle().state::<overlay::OverlayState>().enabled();
                    if keep_running {
                        api.prevent_close();
                        let _ = win.hide();
                    } else {
                        win.app_handle().exit(0);
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
            // Dock icon clicked while the window is hidden.
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            let _ = (app, event);
        });
}
