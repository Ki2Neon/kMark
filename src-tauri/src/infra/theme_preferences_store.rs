use tauri::{AppHandle, Runtime};

use crate::dto::ThemePreferencesPayload;
use kmark_core::ThemePreferences;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const THEME_PREFERENCES_SCOPE: &str = "theme_preferences";
const THEME_PREFERENCES_FILE_NAME: &str = "theme-preferences.json";

pub fn load_theme_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<ThemePreferences>, JsonStateStoreError> {
    load_json_state::<R, ThemePreferencesPayload>(
        app,
        THEME_PREFERENCES_SCOPE,
        THEME_PREFERENCES_FILE_NAME,
    )
    .map(|payload: Option<ThemePreferencesPayload>| payload.map(Into::into))
}

pub fn persist_theme_preferences<R: Runtime>(
    app: &AppHandle<R>,
    theme_preferences: &ThemePreferences,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        THEME_PREFERENCES_SCOPE,
        THEME_PREFERENCES_FILE_NAME,
        &ThemePreferencesPayload::from(theme_preferences),
    )
}
