use tauri::{AppHandle, Runtime};

use crate::dto::PreviewPreferencesPayload;
use kmark_core::PreviewPreferences;

use super::{json_state_store::{load_json_state, persist_json_state}, JsonStateStoreError};

const PREVIEW_PREFERENCES_SCOPE: &str = "preview_preferences";
const PREVIEW_PREFERENCES_FILE_NAME: &str = "preview-preferences.json";

pub fn load_preview_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<PreviewPreferences>, JsonStateStoreError> {
    load_json_state::<R, PreviewPreferencesPayload>(
        app,
        PREVIEW_PREFERENCES_SCOPE,
        PREVIEW_PREFERENCES_FILE_NAME,
    )
    .map(|payload: Option<PreviewPreferencesPayload>| payload.map(Into::into))
}

pub fn persist_preview_preferences<R: Runtime>(
    app: &AppHandle<R>,
    preview_preferences: &PreviewPreferences,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        PREVIEW_PREFERENCES_SCOPE,
        PREVIEW_PREFERENCES_FILE_NAME,
        &PreviewPreferencesPayload::from(preview_preferences),
    )
}
