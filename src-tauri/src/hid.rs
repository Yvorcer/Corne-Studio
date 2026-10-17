//! Thin raw-HID transport for VIA-compatible keyboards.
//!
//! The protocol itself lives in the frontend (`src/lib/via.ts`); this module only
//! finds the keyboard's raw-HID interface, sends 32-byte reports and returns the reply.

use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const CORNE_VID: u16 = 0x4653;
const RAW_USAGE_PAGE: u16 = 0xFF60;
const RAW_USAGE: u16 = 0x61;
const REPORT_LEN: usize = 32;
const READ_TIMEOUT_MS: i32 = 500;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    /// USB bcdDevice; Corne v4 firmware reports 0x0400 / 0x0410 for PCB rev 4.0 / 4.1
    pub release: u16,
    pub product: String,
    pub manufacturer: String,
    pub serial: String,
    pub path: String,
}

pub struct HidState {
    api: Mutex<Option<HidApi>>,
    device: Mutex<Option<(HidDevice, DeviceInfo)>>,
}

impl HidState {
    pub fn new() -> Self {
        Self {
            api: Mutex::new(HidApi::new().ok()),
            device: Mutex::new(None),
        }
    }
}

fn find_raw_interfaces(api: &mut HidApi) -> Vec<DeviceInfo> {
    let _ = api.refresh_devices();
    let mut found: Vec<DeviceInfo> = api
        .device_list()
        .filter(|d| d.usage_page() == RAW_USAGE_PAGE && d.usage() == RAW_USAGE)
        .map(|d| DeviceInfo {
            vendor_id: d.vendor_id(),
            product_id: d.product_id(),
            release: d.release_number(),
            product: d.product_string().unwrap_or_default().to_string(),
            manufacturer: d.manufacturer_string().unwrap_or_default().to_string(),
            serial: d.serial_number().unwrap_or_default().to_string(),
            path: d.path().to_string_lossy().to_string(),
        })
        .collect();
    // Prefer foostan Cornes when `connect` is called without a path;
    // the frontend ranks all known Corne variants itself (src/lib/boards.ts).
    found.sort_by_key(|d| d.vendor_id != CORNE_VID);
    found
}

#[tauri::command]
pub async fn hid_list(state: tauri::State<'_, HidState>) -> Result<Vec<DeviceInfo>, String> {
    let mut api = state.api.lock().map_err(|e| e.to_string())?;
    let api = api.as_mut().ok_or("HID subsystem unavailable")?;
    Ok(find_raw_interfaces(api))
}

#[tauri::command]
pub async fn hid_connect(
    state: tauri::State<'_, HidState>,
    path: Option<String>,
) -> Result<DeviceInfo, String> {
    let mut api_guard = state.api.lock().map_err(|e| e.to_string())?;
    let api = api_guard.as_mut().ok_or("HID subsystem unavailable")?;
    let candidates = find_raw_interfaces(api);
    let info = match path {
        Some(p) => candidates.into_iter().find(|d| d.path == p),
        None => candidates.into_iter().next(),
    }
    .ok_or("No VIA-compatible keyboard found. Is the Corne plugged in?")?;

    let cpath = std::ffi::CString::new(info.path.clone()).map_err(|e| e.to_string())?;
    let dev = api.open_path(&cpath).map_err(|e| format!("Could not open keyboard: {e}"))?;
    *state.device.lock().map_err(|e| e.to_string())? = Some((dev, info.clone()));
    Ok(info)
}

#[tauri::command]
pub async fn hid_disconnect(state: tauri::State<'_, HidState>) -> Result<(), String> {
    *state.device.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

impl HidState {
    /// Send one VIA request and return its 32-byte reply. Used by the UI (`hid_send`) and the
    /// overlay poller; the device mutex keeps their requests from interleaving.
    pub fn transact(&self, data: &[u8]) -> Result<[u8; REPORT_LEN], String> {
        if data.is_empty() || data.len() > REPORT_LEN {
            return Err(format!("report must be 1..={REPORT_LEN} bytes"));
        }
        let mut guard = self.device.lock().map_err(|e| e.to_string())?;
        let (dev, _) = guard.as_ref().ok_or("Keyboard not connected")?;

        // Drain any stale input reports so replies line up with requests.
        let mut scratch = [0u8; REPORT_LEN];
        while let Ok(n) = dev.read_timeout(&mut scratch, 0) {
            if n == 0 {
                break;
            }
        }

        // hidapi expects a leading report-ID byte (0 = no report IDs).
        let mut out = [0u8; REPORT_LEN + 1];
        out[1..=data.len()].copy_from_slice(data);
        if let Err(e) = dev.write(&out) {
            *guard = None;
            return Err(format!("Write failed: {e}"));
        }

        // VIA echoes the command id (or 0xFF if unsupported). Skip replies meant for another
        // client sharing the interface (e.g. a VIA/Remap browser tab).
        let deadline = std::time::Instant::now() + Duration::from_millis(READ_TIMEOUT_MS as u64);
        let mut buf = [0u8; REPORT_LEN];
        loop {
            let left = deadline.saturating_duration_since(std::time::Instant::now()).as_millis() as i32;
            match dev.read_timeout(&mut buf, left.max(1)) {
                Ok(0) => return Err("Keyboard did not respond (timeout)".into()),
                Ok(_) if buf[0] == data[0] || buf[0] == 0xFF => return Ok(buf),
                Ok(_) if left <= 1 => return Err("Keyboard did not respond (timeout)".into()),
                Ok(_) => continue,
                Err(e) => {
                    *guard = None;
                    return Err(format!("Read failed: {e}"));
                }
            }
        }
    }
}

/// Send one 32-byte report and return the 32-byte reply.
#[tauri::command]
pub async fn hid_send(state: tauri::State<'_, HidState>, data: Vec<u8>) -> Result<Vec<u8>, String> {
    state.transact(&data).map(|r| r.to_vec())
}

/// Poll for plug/unplug of the raw-HID interface and notify the frontend.
pub fn spawn_hotplug_watcher(app: AppHandle) {
    thread::spawn(move || {
        let mut present = false;
        loop {
            let now_present = {
                let state = app.state::<HidState>();
                let Ok(mut api) = state.api.lock() else { break };
                match api.as_mut() {
                    Some(api) => !find_raw_interfaces(api).is_empty(),
                    None => false,
                }
            };
            if now_present != present {
                present = now_present;
                if !present {
                    if let Ok(mut d) = app.state::<HidState>().device.lock() {
                        *d = None;
                    }
                }
                let _ = app.emit(if present { "device-attached" } else { "device-detached" }, ());
            }
            thread::sleep(Duration::from_millis(1000));
        }
    });
}
