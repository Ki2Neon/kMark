use tauri::{AppHandle, Runtime};

use crate::dto::EditorDraftPayload;
use kmark_core::StoredEdit;

use super::{
    json_state_store::{load_json_state, persist_json_state},
    JsonStateStoreError,
};

const EDITOR_DRAFT_SCOPE: &str = "editor_draft";
const EDITOR_DRAFT_FILE_NAME: &str = "editor-draft.json";

pub fn load_editor_draft<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<StoredEdit>, JsonStateStoreError> {
    load_json_state::<R, EditorDraftPayload>(app, EDITOR_DRAFT_SCOPE, EDITOR_DRAFT_FILE_NAME)
        .map(|payload: Option<EditorDraftPayload>| payload.map(Into::into))
}

pub fn persist_editor_draft<R: Runtime>(
    app: &AppHandle<R>,
    stored_edit: &StoredEdit,
) -> Result<(), JsonStateStoreError> {
    persist_json_state(
        app,
        EDITOR_DRAFT_SCOPE,
        EDITOR_DRAFT_FILE_NAME,
        &EditorDraftPayload::from(stored_edit),
    )
}
