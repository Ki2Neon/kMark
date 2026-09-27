use tauri::State;

use super::error::CommandErrorPayload;
use crate::{
    dto::{
        ApplyEditorMutationBatchRequestPayload, DocumentSessionPayload, EditorMutationAckPayload,
        MarkEditorSessionSavedRequestPayload,
    },
    AppState,
};

#[tauri::command]
pub fn apply_editor_mutation_batch(
    state: State<'_, AppState>,
    request: ApplyEditorMutationBatchRequestPayload,
) -> Result<EditorMutationAckPayload, CommandErrorPayload> {
    let mutation = request.batch.into();
    state
        .application
        .apply_editor_mutation_batch(&request.session_id, &mutation)
        .map(|ack| (&ack).into())
        .map_err(Into::into)
}

#[tauri::command]
pub fn mark_editor_session_saved(
    state: State<'_, AppState>,
    request: MarkEditorSessionSavedRequestPayload,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .mark_frontend_session_saved(&request.session_id, request.file_name, request.file_path)
        .map(|snapshot| super::external_api::session_payload(&snapshot))
        .map_err(Into::into)
}
