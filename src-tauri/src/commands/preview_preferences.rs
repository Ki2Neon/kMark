use tauri::{AppHandle, Emitter, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    domain::PreviewPreferences,
    infra::{persist_preview_preferences, PREVIEW_PREFERENCES_UPDATED_EVENT},
    AppState,
};

#[tauri::command]
pub fn get_preview_preferences(
    state: State<'_, AppState>,
) -> Result<PreviewPreferences, CommandErrorPayload> {
    let preview_preferences = state
        .preview_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?;

    Ok(preview_preferences.clone())
}

#[tauri::command]
pub fn set_preview_preferences<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    preview_preferences: PreviewPreferences,
) -> Result<PreviewPreferences, CommandErrorPayload> {
    {
        let mut current_preview_preferences = state
            .preview_preferences
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?;
        *current_preview_preferences = preview_preferences.clone();
    }

    persist_preview_preferences(&app, &preview_preferences).map_err(CommandErrorPayload::from)?;

    app.emit(PREVIEW_PREFERENCES_UPDATED_EVENT, &preview_preferences)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch preview preferences update",
                source.to_string(),
            )
        })?;

    Ok(preview_preferences)
}
