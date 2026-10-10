mod hid;
mod profiles;

/// Frontend diagnostics end up on stderr (visible in `npm run tauri dev`).
#[tauri::command]
fn log_line(level: String, message: String) {
    eprintln!("[corne-studio:{level}] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(hid::HidState::new())
        .setup(|app| {
            hid::spawn_hotplug_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            log_line,
            hid::hid_list,
            hid::hid_connect,
            hid::hid_disconnect,
            hid::hid_send,
            profiles::profiles_dir_path,
            profiles::profiles_list,
            profiles::profile_read,
            profiles::profile_write,
            profiles::profile_delete,
            profiles::read_text_file,
            profiles::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
