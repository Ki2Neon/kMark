use std::{
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::error::CommandErrorPayload;
use crate::{
    dto::{
        RegisterSubWindowSourceResponsePayload, SubWindowResolvedSourceStatePayload,
        SubWindowSelectionPayload, SubWindowSourceLineSelectionRequestPayload,
        SubWindowSourceStateChangedPayload, SubWindowSourcesSnapshotPayload, SubWindowStatePayload,
    },
    infra::{
        activate_sub_window_registry_source, get_sub_window_registry_source_state,
        get_sub_window_registry_sources, publish_sub_window_registry_source_state,
        push_sub_window_registry_line_selection_request, register_sub_window_registry_source,
        remove_sub_window_registry_source, take_sub_window_registry_line_selection_requests,
        touch_sub_window_registry_sources,
    },
    AppState, SUB_WINDOW_LABEL_PREFIX,
};

const SUB_WINDOW_URL: &str = "index.html";
const SUB_WINDOW_SOURCES_UPDATED_EVENT: &str = "subwindow-sources-updated";
const SUB_WINDOW_SOURCE_STATE_UPDATED_EVENT: &str = "subwindow-source-state-updated";
const SUB_WINDOW_INIT_SCRIPT: &str = r#"
  window.__KMARK_WINDOW_KIND__ = "subwindow";
"#;
static RUNTIME_PROCESS_ID: OnceLock<String> = OnceLock::new();

#[tauri::command]
pub async fn open_sub_window(app: AppHandle) -> Result<(), CommandErrorPayload> {
    let label = next_sub_window_label(&app);

    let window =
        WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(SUB_WINDOW_URL.into()))
            .initialization_script(SUB_WINDOW_INIT_SCRIPT)
            .title("Subwindow - kMark")
            .inner_size(1280.0, 860.0)
            .min_inner_size(50.0, 50.0)
            .visible(true)
            .focused(true)
            .build()
            .map_err(|source| {
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
pub fn register_sub_window_source(
    app: AppHandle,
    window: WebviewWindow,
    state: SubWindowStatePayload,
) -> Result<RegisterSubWindowSourceResponsePayload, CommandErrorPayload> {
    let source_id = editor_source_id(&window)?;
    let window_label = window.label().to_owned();

    {
        let app_state = app.state::<AppState>();
        let mut sources = app_state
            .sub_window_sources
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("subwindow source"))?;
        sources.insert(source_id.clone(), state.clone());
    }

    if let Err(error) = register_sub_window_registry_source(
        &app,
        &source_id,
        runtime_process_id(),
        &window_label,
        state.clone(),
    ) {
        if let Ok(mut sources) = app.state::<AppState>().sub_window_sources.lock() {
            sources.remove(&source_id);
        }

        return Err(error.into());
    }

    emit_sources_snapshot(&app)?;
    emit_source_state_changed(&app, &source_id, &state);

    Ok(RegisterSubWindowSourceResponsePayload { source_id })
}

#[tauri::command]
pub fn unregister_sub_window_source(
    app: AppHandle,
    window: WebviewWindow,
    source_id: String,
) -> Result<(), CommandErrorPayload> {
    let window_source_id = editor_source_id(&window)?;

    if window_source_id != source_id {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_source_mismatch",
            "source id does not match current window",
            source_id,
        ));
    }

    remove_sub_window_source(&app, &window_source_id);

    Ok(())
}

#[tauri::command]
pub fn activate_sub_window_source(
    app: AppHandle,
    window: WebviewWindow,
    source_id: String,
) -> Result<(), CommandErrorPayload> {
    let window_source_id = editor_source_id(&window)?;

    if window_source_id != source_id {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_source_mismatch",
            "source id does not match current window",
            source_id,
        ));
    }

    set_active_sub_window_source(&app, &window_source_id)?;

    Ok(())
}

#[tauri::command]
pub fn publish_sub_window_source_state(
    app: AppHandle,
    window: WebviewWindow,
    source_id: String,
    state: SubWindowStatePayload,
) -> Result<(), CommandErrorPayload> {
    let window_source_id = editor_source_id(&window)?;
    let window_label = window.label().to_owned();

    if window_source_id != source_id {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_source_mismatch",
            "source id does not match current window",
            source_id,
        ));
    }

    publish_sub_window_registry_source_state(
        &app,
        &window_source_id,
        runtime_process_id(),
        &window_label,
        state.clone(),
    )?;

    {
        let app_state = app.state::<AppState>();
        let mut sources = app_state
            .sub_window_sources
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("subwindow source"))?;
        sources.insert(window_source_id.clone(), state.clone());
    }

    emit_source_state_changed(&app, &window_source_id, &state);
    emit_sources_snapshot(&app)?;

    Ok(())
}

#[tauri::command]
pub fn get_sub_window_sources(
    app: AppHandle,
) -> Result<SubWindowSourcesSnapshotPayload, CommandErrorPayload> {
    get_sub_window_registry_sources(&app).map_err(Into::into)
}

#[tauri::command]
pub fn get_sub_window_source_state(
    app: AppHandle,
    selection: SubWindowSelectionPayload,
) -> Result<SubWindowResolvedSourceStatePayload, CommandErrorPayload> {
    get_sub_window_registry_source_state(&app, &selection).map_err(Into::into)
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

    push_sub_window_registry_line_selection_request(&app, request)?;

    Ok(())
}

#[tauri::command]
pub fn take_sub_window_source_line_selection_requests(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<SubWindowSourceLineSelectionRequestPayload>, CommandErrorPayload> {
    let source_id = editor_source_id(&window)?;

    take_sub_window_registry_line_selection_requests(&app, &source_id).map_err(Into::into)
}

pub(crate) fn remove_sub_window_state<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, _label: &str) {
}

pub(crate) fn remove_sub_window_source<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source_id: &str,
) {
    let app_state = app.state::<AppState>();
    let removed = app_state
        .sub_window_sources
        .lock()
        .map(|mut sources| sources.remove(source_id).is_some())
        .unwrap_or(false);

    if !removed {
        return;
    }

    if let Err(error) = remove_sub_window_registry_source(app, source_id) {
        eprintln!("failed to remove subwindow source from registry: {error}");
    }

    if let Err(error) = emit_sources_snapshot(app) {
        eprintln!(
            "failed to dispatch subwindow sources update: {}",
            error.message()
        );
    }
}

pub(crate) fn remove_sub_window_source_for_window_label<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window_label: &str,
) {
    match editor_source_id_from_label(window_label) {
        Ok(source_id) => remove_sub_window_source(app, &source_id),
        Err(error) => eprintln!("failed to resolve subwindow source id: {}", error.message()),
    }
}

pub(crate) fn set_active_sub_window_source<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source_id: &str,
) -> Result<(), CommandErrorPayload> {
    let app_state = app.state::<AppState>();
    let has_source = app_state
        .sub_window_sources
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("subwindow source"))?
        .contains_key(source_id);

    if !has_source {
        return Ok(());
    }

    activate_sub_window_registry_source(app, source_id)?;

    emit_sources_snapshot(app)?;

    Ok(())
}

pub(crate) fn set_active_sub_window_source_for_window_label<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window_label: &str,
) -> Result<(), CommandErrorPayload> {
    let source_id = editor_source_id_from_label(window_label)?;

    set_active_sub_window_source(app, &source_id)
}

pub(crate) fn heartbeat_sub_window_sources<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let source_ids = app
        .state::<AppState>()
        .sub_window_sources
        .lock()
        .map(|sources| sources.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    if let Err(error) = touch_sub_window_registry_sources(app, &source_ids) {
        eprintln!("failed to touch subwindow sources: {error}");
    }
}

fn editor_source_id(window: &WebviewWindow) -> Result<String, CommandErrorPayload> {
    editor_source_id_from_label(window.label())
}

fn editor_source_id_from_label(label: &str) -> Result<String, CommandErrorPayload> {
    if label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
        return Err(CommandErrorPayload::with_detail(
            "not_editor_window",
            "current window is not an editor window",
            label,
        ));
    }

    Ok(format!("{}-{label}", runtime_process_id()))
}

fn next_sub_window_label<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_sub_window_sequence
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;

    format!("{SUB_WINDOW_LABEL_PREFIX}{next_sequence}")
}

fn emit_sources_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), CommandErrorPayload> {
    let snapshot = get_sub_window_registry_sources(app)?;

    for (label, window) in app.webview_windows() {
        if !label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
            continue;
        }

        if let Err(error) = window.emit(SUB_WINDOW_SOURCES_UPDATED_EVENT, &snapshot) {
            eprintln!("failed to dispatch subwindow sources update: {error}");
        }
    }

    Ok(())
}

fn runtime_process_id() -> &'static str {
    RUNTIME_PROCESS_ID.get_or_init(|| {
        format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        )
    })
}

fn emit_source_state_changed<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    source_id: &str,
    state: &SubWindowStatePayload,
) {
    let change = SubWindowSourceStateChangedPayload {
        source_id: source_id.to_owned(),
        state: state.clone(),
    };

    for (label, window) in app.webview_windows() {
        if !label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
            continue;
        }

        if let Err(error) = window.emit(SUB_WINDOW_SOURCE_STATE_UPDATED_EVENT, &change) {
            eprintln!("failed to dispatch subwindow source state update: {error}");
        }
    }
}
