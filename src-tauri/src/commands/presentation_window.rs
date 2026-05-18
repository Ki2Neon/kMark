use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::error::CommandErrorPayload;
use crate::PRESENTATION_WINDOW_LABEL_PREFIX;

const PRESENTATION_WINDOW_URL_PREFIX: &str = "index.html?kmarkWindow=presentation&snapshotKey=";

#[tauri::command]
pub fn open_presentation_window(
    app: AppHandle,
    snapshot_key: String,
    title: String,
) -> Result<(), CommandErrorPayload> {
    let normalized_snapshot_key = snapshot_key.trim();

    if normalized_snapshot_key.is_empty() {
        return Err(CommandErrorPayload::new(
            "invalid_presentation_snapshot_key",
            "presentation snapshot key must not be empty",
        ));
    }

    if !is_supported_snapshot_key(normalized_snapshot_key) {
        return Err(CommandErrorPayload::with_detail(
            "invalid_presentation_snapshot_key",
            "presentation snapshot key contains unsupported characters",
            normalized_snapshot_key,
        ));
    }

    let label = format!("{PRESENTATION_WINDOW_LABEL_PREFIX}{normalized_snapshot_key}");

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = format!("{PRESENTATION_WINDOW_URL_PREFIX}{normalized_snapshot_key}");
    let window_title = resolve_window_title(&title);
    let window = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title(window_title)
        .inner_size(1280.0, 860.0)
        .min_inner_size(50.0, 50.0)
        .visible(true)
        .focused(true)
        .build()
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "presentation_window_open_failed",
                "failed to open presentation window",
                source.to_string(),
            )
        })?;

    let _ = window.set_focus();

    Ok(())
}

fn is_supported_snapshot_key(snapshot_key: &str) -> bool {
    snapshot_key
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn resolve_window_title(title: &str) -> String {
    let normalized_title = title.trim();

    if normalized_title.is_empty() {
        return "Presentation - kMark".to_owned();
    }

    format!("{normalized_title} - Presentation - kMark")
}
