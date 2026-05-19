use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::error::CommandErrorPayload;
use crate::{
    dto::{SubWindowSourceLineSelectionRequestPayload, SubWindowStatePayload},
    AppState, MAIN_WINDOW_LABEL, SUB_WINDOW_LABEL_PREFIX,
};

const SUB_WINDOW_URL: &str = "index.html";
const SUB_WINDOW_STATE_UPDATED_EVENT: &str = "subwindow-state-updated";
const SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT: &str =
    "subwindow-source-line-selection-requested";
const SUB_WINDOW_INIT_SCRIPT: &str = r#"
  window.__KMARK_WINDOW_KIND__ = "subwindow";
"#;

#[tauri::command]
pub async fn open_sub_window(
    app: AppHandle,
    state: SubWindowStatePayload,
) -> Result<(), CommandErrorPayload> {
    let label = next_sub_window_label(&app);
    let title = state.title.clone();

    store_sub_window_state(&app, &label, state)?;

    let window = WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::App(SUB_WINDOW_URL.into()),
    )
    .initialization_script(SUB_WINDOW_INIT_SCRIPT)
    .title(resolve_window_title(&title))
    .inner_size(1280.0, 860.0)
    .min_inner_size(50.0, 50.0)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|source| {
        remove_sub_window_state(&app, &label);
        CommandErrorPayload::with_detail(
            "subwindow_open_failed",
            "failed to open subwindow",
            source.to_string(),
        )
    })?;

    let _ = window.set_focus();

    Ok(())
}

#[tauri::command]
pub fn get_sub_window_state(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<SubWindowStatePayload, CommandErrorPayload> {
    let label = window.label();

    if !label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
        return Err(CommandErrorPayload::with_detail(
            "not_subwindow",
            "current window is not a subwindow",
            label,
        ));
    }

    let states = state
        .sub_window_states
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("subwindow state"))?;

    states.get(label).cloned().ok_or_else(|| {
        CommandErrorPayload::with_detail(
            "subwindow_state_not_found",
            "subwindow state not found",
            label,
        )
    })
}

#[tauri::command]
pub fn publish_sub_window_state(
    app: AppHandle,
    state: SubWindowStatePayload,
) -> Result<(), CommandErrorPayload> {
    let labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with(SUB_WINDOW_LABEL_PREFIX))
        .cloned()
        .collect();

    {
        let app_state = app.state::<AppState>();
        let mut states = app_state
            .sub_window_states
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("subwindow state"))?;

        for label in &labels {
            states.insert(label.clone(), state.clone());
        }
    }

    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            if let Err(error) = window.emit(SUB_WINDOW_STATE_UPDATED_EVENT, &state) {
                eprintln!("failed to dispatch subwindow state update: {error}");
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn request_sub_window_source_line_selection(
    app: AppHandle,
    window: WebviewWindow,
    request: SubWindowSourceLineSelectionRequestPayload,
) -> Result<(), CommandErrorPayload> {
    let label = window.label();

    if !label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
        return Err(CommandErrorPayload::with_detail(
            "not_subwindow",
            "current window is not a subwindow",
            label,
        ));
    }

    let main_window = app.get_webview_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        CommandErrorPayload::with_detail(
            "main_window_not_found",
            "main window not found",
            MAIN_WINDOW_LABEL,
        )
    })?;

    main_window
        .emit(SUB_WINDOW_SOURCE_LINE_SELECTION_REQUESTED_EVENT, &request)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "subwindow_source_line_selection_emit_failed",
                "failed to request source line selection from subwindow",
                source.to_string(),
            )
        })?;

    Ok(())
}

pub(crate) fn remove_sub_window_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) {
    let state = app.state::<AppState>();

    if let Ok(mut states) = state.sub_window_states.lock() {
        states.remove(label);
    };
}

fn next_sub_window_label<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_sub_window_sequence
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;

    format!("{SUB_WINDOW_LABEL_PREFIX}{next_sequence}")
}

fn store_sub_window_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    state_payload: SubWindowStatePayload,
) -> Result<(), CommandErrorPayload> {
    let state = app.state::<AppState>();
    let mut states = state
        .sub_window_states
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("subwindow state"))?;

    states.insert(label.to_owned(), state_payload);

    Ok(())
}

fn resolve_window_title(title: &str) -> String {
    let normalized_title = title.trim();

    if normalized_title.is_empty() {
        return "Subwindow - kMark".to_owned();
    }

    format!("{normalized_title} - Subwindow - kMark")
}
