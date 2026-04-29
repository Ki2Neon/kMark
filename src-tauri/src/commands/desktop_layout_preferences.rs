use tauri::{AppHandle, Emitter, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{
    dto::DesktopLayoutPreferencesPayload,
    infra::persist_desktop_layout_preferences,
    AppState,
};
use kmark_core::DesktopLayoutPreferences;

pub const DESKTOP_LAYOUT_PREFERENCES_UPDATED_EVENT: &str = "desktop-layout-preferences-updated";

#[tauri::command]
pub fn get_desktop_layout_preferences(
    state: State<'_, AppState>,
) -> Result<DesktopLayoutPreferencesPayload, CommandErrorPayload> {
    let desktop_layout_preferences = state
        .desktop_layout_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("desktop layout preferences"))?;

    Ok(DesktopLayoutPreferencesPayload::from(
        &*desktop_layout_preferences,
    ))
}

#[tauri::command]
pub fn set_desktop_layout_preferences<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    desktop_layout_preferences: DesktopLayoutPreferencesPayload,
) -> Result<DesktopLayoutPreferencesPayload, CommandErrorPayload> {
    let next_desktop_layout_preferences: DesktopLayoutPreferences =
        desktop_layout_preferences.into();

    {
        let mut current_desktop_layout_preferences = state
            .desktop_layout_preferences
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("desktop layout preferences"))?;
        *current_desktop_layout_preferences = next_desktop_layout_preferences;
    }

    persist_desktop_layout_preferences(&app, &next_desktop_layout_preferences)
        .map_err(CommandErrorPayload::from)?;

    let payload = DesktopLayoutPreferencesPayload::from(&next_desktop_layout_preferences);
    app.emit(DESKTOP_LAYOUT_PREFERENCES_UPDATED_EVENT, &payload)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch desktop layout preferences update",
                source.to_string(),
            )
        })?;

    Ok(payload)
}
