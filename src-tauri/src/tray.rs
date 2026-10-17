//! Menu-bar (tray) icon. Corne Studio lives here while the editor window is closed, so the
//! layer overlay keeps working without a Dock icon.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::overlay::OverlayState;

pub struct TrayState {
    overlay_item: CheckMenuItem<Wry>,
}

impl TrayState {
    /// Keep the "Layer overlay" checkmark in sync when the setting changes in the app.
    pub fn set_overlay_checked(&self, enabled: bool) {
        let _ = self.overlay_item.set_checked(enabled);
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Corne Studio", true, None::<&str>)?;
    let overlay = CheckMenuItem::with_id(
        app,
        "overlay",
        "Layer overlay",
        true,
        app.state::<OverlayState>().enabled(),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Corne Studio", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &PredefinedMenuItem::separator(app)?, &overlay, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    // macOS: a monochrome template glyph the system tints for light/dark menu bars.
    #[cfg(target_os = "macos")]
    let builder = TrayIconBuilder::with_id("main").icon(tauri::include_image!("icons/tray-template.png")).icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = match app.default_window_icon() {
        Some(icon) => TrayIconBuilder::with_id("main").icon(icon.clone()),
        None => TrayIconBuilder::with_id("main"),
    };

    builder
        .tooltip("Corne Studio")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main(app),
            "overlay" => {
                // The checkmark has already flipped; read the new state.
                let on = app.state::<TrayState>().overlay_item.is_checked().unwrap_or(false);
                crate::overlay::set_enabled(app, on);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    app.manage(TrayState { overlay_item: overlay });
    Ok(())
}
