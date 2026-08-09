use tauri::{AppHandle, Runtime};

use crate::dto::ExternalApiPreferencesPayload;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const EXTERNAL_API_PREFERENCES_SCOPE: &str = "external_api_preferences";
const EXTERNAL_API_PREFERENCES_FILE_NAME: &str = "external-api-preferences.json";

pub fn load_external_api_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<ExternalApiPreferencesPayload>, JsonStateStoreError> {
    load_json_state(
        app,
        EXTERNAL_API_PREFERENCES_SCOPE,
        EXTERNAL_API_PREFERENCES_FILE_NAME,
    )
}

pub fn persist_external_api_preferences<R: Runtime>(
    app: &AppHandle<R>,
    preferences: &ExternalApiPreferencesPayload,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        EXTERNAL_API_PREFERENCES_SCOPE,
        EXTERNAL_API_PREFERENCES_FILE_NAME,
        preferences,
    )
}
