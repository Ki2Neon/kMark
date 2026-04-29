use std::sync::atomic::Ordering;

use tauri::{AppHandle, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    dto::{
        PreviewWindowEditJumpRequestPayload, PreviewWindowSnapshotPayload,
        PreviewWindowStatePayload,
    },
    infra::{
        emit_main_window_preview_jump_request, emit_preview_window_state_updated,
        show_or_create_preview_window,
    },
    AppState,
};

#[tauri::command]
pub fn get_preview_window_state(
    state: State<'_, AppState>,
) -> Result<PreviewWindowStatePayload, CommandErrorPayload> {
    let preview_window_state = state
        .preview_window_state
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview window"))?;

    Ok(PreviewWindowStatePayload::from(&*preview_window_state))
}

#[tauri::command]
pub fn sync_preview_window_state<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    snapshot: PreviewWindowSnapshotPayload,
    active_source_line: Option<u32>,
) -> Result<(), CommandErrorPayload> {
    let next_preview_window_state = kmark_core::PreviewWindowState::new(
        snapshot.into(),
        active_source_line,
    );

    {
        let mut preview_window_state = state
            .preview_window_state
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("preview window"))?;
        *preview_window_state = next_preview_window_state.clone();
    }

    let payload = PreviewWindowStatePayload::from(&next_preview_window_state);
    emit_preview_window_state_updated(&app, &payload).map_err(|source| {
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
    snapshot: PreviewWindowSnapshotPayload,
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
) -> Result<PreviewWindowEditJumpRequestPayload, CommandErrorPayload> {
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
    let preview_window_edit_jump_request =
        kmark_core::PreviewWindowEditJumpRequest::new(line_number, request_id);
    let payload = PreviewWindowEditJumpRequestPayload::from(&preview_window_edit_jump_request);

    emit_main_window_preview_jump_request(&app, &payload).map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch preview window edit jump request",
                source.to_string(),
            )
        })?;

    Ok(payload)
}
