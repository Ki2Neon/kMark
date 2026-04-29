use tauri::{AppHandle, Runtime};

use crate::dto::DesktopLayoutPreferencesPayload;
use kmark_core::DesktopLayoutPreferences;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const DESKTOP_LAYOUT_PREFERENCES_SCOPE: &str = "desktop_layout_preferences";
const DESKTOP_LAYOUT_PREFERENCES_FILE_NAME: &str = "desktop-layout-preferences.json";

pub fn load_desktop_layout_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<DesktopLayoutPreferences>, JsonStateStoreError> {
    load_json_state::<R, DesktopLayoutPreferencesPayload>(
        app,
        DESKTOP_LAYOUT_PREFERENCES_SCOPE,
        DESKTOP_LAYOUT_PREFERENCES_FILE_NAME,
    )
    .map(|payload: Option<DesktopLayoutPreferencesPayload>| payload.map(Into::into))
}

pub fn persist_desktop_layout_preferences<R: Runtime>(
    app: &AppHandle<R>,
    desktop_layout_preferences: &DesktopLayoutPreferences,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        DESKTOP_LAYOUT_PREFERENCES_SCOPE,
        DESKTOP_LAYOUT_PREFERENCES_FILE_NAME,
        &DesktopLayoutPreferencesPayload::from(desktop_layout_preferences),
    )
}
