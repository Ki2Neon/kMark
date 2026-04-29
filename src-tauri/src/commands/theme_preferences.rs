use tauri::{AppHandle, Emitter, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    dto::ThemePreferencesPayload,
    infra::persist_theme_preferences,
    AppState,
};
use kmark_core::ThemePreferences;

pub const THEME_PREFERENCES_UPDATED_EVENT: &str = "theme-preferences-updated";

#[tauri::command]
pub fn get_theme_preferences(
    state: State<'_, AppState>,
) -> Result<ThemePreferencesPayload, CommandErrorPayload> {
    let theme_preferences = state
        .theme_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("theme preferences"))?;

    Ok(ThemePreferencesPayload::from(&*theme_preferences))
}

#[tauri::command]
pub fn set_theme_preferences<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    theme_preferences: ThemePreferencesPayload,
) -> Result<ThemePreferencesPayload, CommandErrorPayload> {
    let next_theme_preferences: ThemePreferences = theme_preferences.into();

    {
        let mut current_theme_preferences = state
            .theme_preferences
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("theme preferences"))?;
        *current_theme_preferences = next_theme_preferences.clone();
    }

    persist_theme_preferences(&app, &next_theme_preferences).map_err(CommandErrorPayload::from)?;

    let payload = ThemePreferencesPayload::from(&next_theme_preferences);
    app.emit(THEME_PREFERENCES_UPDATED_EVENT, &payload)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch theme preferences update",
                source.to_string(),
            )
        })?;

    Ok(payload)
}
