use tauri::{AppHandle, Emitter, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{dto::PreviewPreferencesPayload, infra::persist_preview_preferences, AppState};
use kmark_core::PreviewPreferences;

const PREVIEW_PREFERENCES_UPDATED_EVENT: &str = "preview-preferences-updated";

#[tauri::command]
pub fn get_preview_preferences(
    state: State<'_, AppState>,
) -> Result<PreviewPreferencesPayload, CommandErrorPayload> {
    let preview_preferences = state
        .preview_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?;

    Ok(PreviewPreferencesPayload::from(&*preview_preferences))
}

#[tauri::command]
pub fn set_preview_preferences<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    preview_preferences: PreviewPreferencesPayload,
) -> Result<PreviewPreferencesPayload, CommandErrorPayload> {
    let next_preview_preferences: PreviewPreferences = preview_preferences.into();

    {
        let mut current_preview_preferences = state
            .preview_preferences
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?;
        *current_preview_preferences = next_preview_preferences.clone();
    }

    persist_preview_preferences(&app, &next_preview_preferences)
        .map_err(CommandErrorPayload::from)?;

    let payload = PreviewPreferencesPayload::from(&next_preview_preferences);

    app.emit(PREVIEW_PREFERENCES_UPDATED_EVENT, &payload)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch preview preferences update",
                source.to_string(),
            )
        })?;

    Ok(payload)
}
