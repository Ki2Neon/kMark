use tauri::{AppHandle, Runtime};

use crate::dto::{
    recent_file_payloads_from_recent_files, recent_files_from_payloads, RecentFilePayload,
};
use kmark_core::RecentFiles;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const RECENT_FILES_SCOPE: &str = "recent_files";
const RECENT_FILES_FILE_NAME: &str = "recent-files.json";

pub fn load_recent_files<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<RecentFiles>, JsonStateStoreError> {
    load_json_state::<R, Vec<RecentFilePayload>>(app, RECENT_FILES_SCOPE, RECENT_FILES_FILE_NAME)
        .map(|payloads| payloads.map(recent_files_from_payloads))
}

pub fn persist_recent_files<R: Runtime>(
    app: &AppHandle<R>,
    recent_files: &RecentFiles,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        RECENT_FILES_SCOPE,
        RECENT_FILES_FILE_NAME,
        &recent_file_payloads_from_recent_files(recent_files),
    )
}
