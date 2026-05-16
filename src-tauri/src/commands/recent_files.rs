use tauri::{AppHandle, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    dto::{recent_file_from_payload, recent_file_payloads_from_recent_files, RecentFilePayload},
    infra::persist_recent_files,
    AppState,
};

#[tauri::command]
pub fn get_recent_files(
    state: State<'_, AppState>,
) -> Result<Vec<RecentFilePayload>, CommandErrorPayload> {
    let recent_files = state
        .recent_files
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("recent files"))?;

    Ok(recent_file_payloads_from_recent_files(&recent_files))
}

#[tauri::command]
pub fn record_recent_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    recent_file: RecentFilePayload,
) -> Result<Vec<RecentFilePayload>, CommandErrorPayload> {
    let recent_file = recent_file_from_payload(recent_file).ok_or_else(|| {
        CommandErrorPayload::new("invalid_recent_file", "recent file requires a file path")
    })?;

    let next_recent_files = {
        let mut current_recent_files = state
            .recent_files
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("recent files"))?;
        let next_recent_files = current_recent_files.record(recent_file);
        *current_recent_files = next_recent_files.clone();
        next_recent_files
    };

    persist_recent_files(&app, &next_recent_files).map_err(CommandErrorPayload::from)?;

    Ok(recent_file_payloads_from_recent_files(&next_recent_files))
}
