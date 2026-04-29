use std::sync::atomic::Ordering;

use tauri::{AppHandle, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    domain::{PreviewWindowEditJumpRequest, PreviewWindowSnapshot, PreviewWindowState},
    infra::{
        emit_main_window_preview_jump_request, emit_preview_window_state_updated,
        show_or_create_preview_window,
    },
    AppState,
};

fn normalize_active_source_line(active_source_line: Option<u32>) -> Option<u32> {
    active_source_line.filter(|line_number| *line_number > 0)
}

fn build_preview_window_state(
    snapshot: PreviewWindowSnapshot,
    active_source_line: Option<u32>,
) -> PreviewWindowState {
    PreviewWindowState {
        snapshot,
        active_source_line: normalize_active_source_line(active_source_line),
    }
}

#[tauri::command]
pub fn get_preview_window_state(
    state: State<'_, AppState>,
) -> Result<PreviewWindowState, CommandErrorPayload> {
    let preview_window_state = state
        .preview_window_state
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview window"))?;

    Ok(preview_window_state.clone())
}

#[tauri::command]
pub fn sync_preview_window_state<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    snapshot: PreviewWindowSnapshot,
    active_source_line: Option<u32>,
) -> Result<(), CommandErrorPayload> {
    let next_preview_window_state = build_preview_window_state(snapshot, active_source_line);

    {
        let mut preview_window_state = state
            .preview_window_state
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("preview window"))?;
        *preview_window_state = next_preview_window_state.clone();
    }

    emit_preview_window_state_updated(&app, &next_preview_window_state).map_err(|source| {
        CommandErrorPayload::with_detail(
            "event_dispatch_failed",
            "failed to dispatch preview window state update",
            source.to_string(),
        )
    })?;

    Ok(())
}

#[tauri::command]
pub fn open_preview_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    snapshot: PreviewWindowSnapshot,
    active_source_line: Option<u32>,
) -> Result<(), CommandErrorPayload> {
    sync_preview_window_state(app.clone(), state, snapshot, active_source_line)?;

    show_or_create_preview_window(&app).map_err(|source| {
        CommandErrorPayload::with_detail(
            "preview_window_open_failed",
            "failed to open preview window",
            source.to_string(),
        )
    })?;

    Ok(())
}

#[tauri::command]
pub fn request_preview_window_edit_jump<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    line_number: u32,
) -> Result<PreviewWindowEditJumpRequest, CommandErrorPayload> {
    if line_number == 0 {
        return Err(CommandErrorPayload::new(
            "invalid_line_number",
            "line number must be greater than 0",
        ));
    }

    let request_id = state
        .next_preview_edit_jump_request_id
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    let preview_window_edit_jump_request = PreviewWindowEditJumpRequest {
        line_number,
        request_id,
    };

    emit_main_window_preview_jump_request(&app, &preview_window_edit_jump_request).map_err(
        |source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch preview window edit jump request",
                source.to_string(),
            )
        },
    )?;

    Ok(preview_window_edit_jump_request)
}
