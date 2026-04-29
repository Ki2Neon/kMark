use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const MAIN_WINDOW_LABEL: &str = "main";
const PREVIEW_WINDOW_LABEL: &str = "preview-window";
const PREVIEW_WINDOW_ROUTE: &str = "index.html?preview-window=1";
const PREVIEW_WINDOW_TITLE: &str = "kMark Preview";

pub(crate) const PREVIEW_PREFERENCES_UPDATED_EVENT: &str = "preview-preferences-updated";
const PREVIEW_WINDOW_STATE_UPDATED_EVENT: &str = "preview-window-state-updated";
const PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT: &str = "preview-window-edit-jump-requested";

pub(crate) fn show_or_create_preview_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), tauri::Error> {
    if let Some(preview_window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        let _ = preview_window.show();
        let _ = preview_window.unminimize();
        let _ = preview_window.set_focus();

        return Ok(());
    }

    let preview_window = WebviewWindowBuilder::new(
        app,
        PREVIEW_WINDOW_LABEL,
        WebviewUrl::App(PREVIEW_WINDOW_ROUTE.into()),
    )
    .title(PREVIEW_WINDOW_TITLE)
    .inner_size(820.0, 900.0)
    .min_inner_size(50.0, 50.0)
    .center()
    .resizable(true)
    .build()?;

    let _ = preview_window.show();
    let _ = preview_window.set_focus();

    Ok(())
}

pub(crate) fn emit_preview_window_state_updated<R: Runtime, P: Serialize + Clone>(
    app: &AppHandle<R>,
    payload: &P,
) -> Result<(), tauri::Error> {
    if let Some(preview_window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        preview_window.emit(PREVIEW_WINDOW_STATE_UPDATED_EVENT, payload)?;
    }

    Ok(())
}

pub(crate) fn emit_main_window_preview_jump_request<R: Runtime, P: Serialize + Clone>(
    app: &AppHandle<R>,
    payload: &P,
) -> Result<(), tauri::Error> {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        main_window.emit(PREVIEW_WINDOW_EDIT_JUMP_REQUESTED_EVENT, payload)?;
    }

    Ok(())
}
