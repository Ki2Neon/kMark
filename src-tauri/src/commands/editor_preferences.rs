use tauri::{AppHandle, Emitter, Runtime, State};

#[cfg(all(desktop, not(debug_assertions)))]
use tauri_plugin_autostart::ManagerExt;

use super::error::CommandErrorPayload;
use crate::{dto::EditorPreferencesPayload, infra::persist_editor_preferences, AppState};
use kmark_core::EditorPreferences;

pub const EDITOR_PREFERENCES_UPDATED_EVENT: &str = "editor-preferences-updated";

#[tauri::command]
pub fn get_editor_preferences(
    state: State<'_, AppState>,
) -> Result<EditorPreferencesPayload, CommandErrorPayload> {
    let editor_preferences = state
        .editor_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("editor preferences"))?;

    Ok(EditorPreferencesPayload::from(&*editor_preferences))
}

#[tauri::command]
pub fn set_editor_preferences<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    editor_preferences: EditorPreferencesPayload,
) -> Result<EditorPreferencesPayload, CommandErrorPayload> {
    let next_editor_preferences = EditorPreferences::from(editor_preferences);
    sync_autostart_preference(&app, &next_editor_preferences)?;

    {
        let mut current_editor_preferences = state
            .editor_preferences
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("editor preferences"))?;
        *current_editor_preferences = next_editor_preferences.clone();
    }

    persist_editor_preferences(&app, &next_editor_preferences)
        .map_err(CommandErrorPayload::from)?;

    let payload = EditorPreferencesPayload::from(&next_editor_preferences);
    app.emit(EDITOR_PREFERENCES_UPDATED_EVENT, &payload)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "event_dispatch_failed",
                "failed to dispatch editor preferences update",
                source.to_string(),
            )
        })?;

    Ok(payload)
}

#[cfg(all(desktop, not(debug_assertions)))]
pub(crate) fn sync_autostart_preference<R: Runtime>(
    app: &AppHandle<R>,
    editor_preferences: &EditorPreferences,
) -> Result<(), CommandErrorPayload> {
    let autostart_manager = app.autolaunch();
    let current_enabled = autostart_manager.is_enabled().map_err(|source| {
        CommandErrorPayload::with_detail(
            "autostart_status_failed",
            "failed to read autostart status",
            source.to_string(),
        )
    })?;
    let next_enabled = editor_preferences.windows_startup_tray_resident_enabled();

    if current_enabled == next_enabled {
        return Ok(());
    }

    if next_enabled {
        autostart_manager.enable().map_err(|source| {
            CommandErrorPayload::with_detail(
                "autostart_enable_failed",
                "failed to enable autostart",
                source.to_string(),
            )
        })?;
    } else {
        autostart_manager.disable().map_err(|source| {
            CommandErrorPayload::with_detail(
                "autostart_disable_failed",
                "failed to disable autostart",
                source.to_string(),
            )
        })?;
    }

    Ok(())
}

#[cfg(any(not(desktop), debug_assertions))]
pub(crate) fn sync_autostart_preference<R: Runtime>(
    _app: &AppHandle<R>,
    _editor_preferences: &EditorPreferences,
) -> Result<(), CommandErrorPayload> {
    Ok(())
}
