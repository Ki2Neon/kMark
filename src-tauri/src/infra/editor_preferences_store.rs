use tauri::{AppHandle, Runtime};

use crate::dto::EditorPreferencesPayload;
use kmark_core::EditorPreferences;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const EDITOR_PREFERENCES_SCOPE: &str = "editor_preferences";
const EDITOR_PREFERENCES_FILE_NAME: &str = "editor-preferences.json";

pub fn load_editor_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<EditorPreferences>, JsonStateStoreError> {
    load_json_state::<R, EditorPreferencesPayload>(
        app,
        EDITOR_PREFERENCES_SCOPE,
        EDITOR_PREFERENCES_FILE_NAME,
    )
    .map(|payload: Option<EditorPreferencesPayload>| payload.map(Into::into))
}

pub fn persist_editor_preferences<R: Runtime>(
    app: &AppHandle<R>,
    editor_preferences: &EditorPreferences,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        EDITOR_PREFERENCES_SCOPE,
        EDITOR_PREFERENCES_FILE_NAME,
        &EditorPreferencesPayload::from(editor_preferences),
    )
}
