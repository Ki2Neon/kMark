use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::error::CommandErrorPayload;
use crate::{dto::PresentationWindowSnapshotPayload, AppState, PRESENTATION_WINDOW_LABEL_PREFIX};

const PRESENTATION_WINDOW_URL: &str = "index.html";
const PRESENTATION_WINDOW_INIT_SCRIPT: &str = r#"
  window.__KMARK_WINDOW_KIND__ = "presentation";
"#;

#[tauri::command]
pub async fn open_presentation_window(
    app: AppHandle,
    snapshot: PresentationWindowSnapshotPayload,
) -> Result<(), CommandErrorPayload> {
    let label = next_presentation_window_label(&app);
    let title = snapshot.title.clone();

    store_presentation_window_snapshot(&app, &label, snapshot)?;

    let window = WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::App(PRESENTATION_WINDOW_URL.into()),
    )
    .initialization_script(PRESENTATION_WINDOW_INIT_SCRIPT)
    .title(resolve_window_title(&title))
    .inner_size(1280.0, 860.0)
    .min_inner_size(50.0, 50.0)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|source| {
        remove_presentation_window_snapshot(&app, &label);
        CommandErrorPayload::with_detail(
            "presentation_window_open_failed",
            "failed to open presentation window",
            source.to_string(),
        )
    })?;

    let _ = window.set_focus();

    Ok(())
}

#[tauri::command]
pub fn get_presentation_window_snapshot(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<PresentationWindowSnapshotPayload, CommandErrorPayload> {
    let label = window.label();

    if !label.starts_with(PRESENTATION_WINDOW_LABEL_PREFIX) {
        return Err(CommandErrorPayload::with_detail(
            "not_presentation_window",
            "current window is not a presentation window",
            label,
        ));
    }

    let snapshots = state
        .presentation_window_snapshots
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("presentation window snapshot"))?;

    snapshots.get(label).cloned().ok_or_else(|| {
        CommandErrorPayload::with_detail(
            "presentation_snapshot_not_found",
            "presentation snapshot not found",
            label,
        )
    })
}

pub(crate) fn remove_presentation_window_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) {
    let state = app.state::<AppState>();

    if let Ok(mut snapshots) = state.presentation_window_snapshots.lock() {
        snapshots.remove(label);
    };
}

fn next_presentation_window_label<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_presentation_window_sequence
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;

    format!("{PRESENTATION_WINDOW_LABEL_PREFIX}{next_sequence}")
}

fn store_presentation_window_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    snapshot: PresentationWindowSnapshotPayload,
) -> Result<(), CommandErrorPayload> {
    let state = app.state::<AppState>();
    let mut snapshots = state
        .presentation_window_snapshots
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("presentation window snapshot"))?;

    snapshots.insert(label.to_owned(), snapshot);

    Ok(())
}

fn resolve_window_title(title: &str) -> String {
    let normalized_title = title.trim();

    if normalized_title.is_empty() {
        return "Presentation - kMark".to_owned();
    }

    format!("{normalized_title} - Presentation - kMark")
}
