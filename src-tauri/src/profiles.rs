//! Keymap profiles stored as JSON files in the app data directory.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    pub id: String,
    pub modified: u64,
}

fn profiles_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("profiles");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Profile ids become file names, so keep them to a safe character set.
fn sanitize(id: &str) -> Result<String, String> {
    let clean: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    if clean.is_empty() {
        return Err("Profile id is empty".into());
    }
    Ok(clean)
}

#[tauri::command]
pub fn profiles_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(profiles_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn profiles_list(app: AppHandle) -> Result<Vec<ProfileEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(profiles_dir(&app)?).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            out.push(ProfileEntry { id: stem.to_string(), modified });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

#[tauri::command]
pub fn profile_read(app: AppHandle, id: String) -> Result<String, String> {
    fs::read_to_string(profiles_dir(&app)?.join(format!("{}.json", sanitize(&id)?)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profile_write(app: AppHandle, id: String, contents: String) -> Result<String, String> {
    let id = sanitize(&id)?;
    fs::write(profiles_dir(&app)?.join(format!("{id}.json")), contents).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn profile_delete(app: AppHandle, id: String) -> Result<(), String> {
    fs::remove_file(profiles_dir(&app)?.join(format!("{}.json", sanitize(&id)?)))
        .map_err(|e| e.to_string())
}

/// Read/write arbitrary user-chosen files (paths come from the native open/save dialogs).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}
