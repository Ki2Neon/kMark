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
    let operation_id = format!("{}:{}", request.batch.client_id, request.batch.batch_id);
    let expected_revision = request.batch.expected_revision;
    eprintln!(
        "[kmark:ipc] begin command=apply_editor_mutation_batch session={} op={} rev={}",
        request.session_id, operation_id, expected_revision
    );
    let mutation = request.batch.into();
    let result: Result<EditorMutationAckPayload, CommandErrorPayload> = state
        .application
        .apply_editor_mutation_batch(&request.session_id, &mutation)
        .map(|ack| (&ack).into())
        .map_err(Into::into);
    match &result {
        Ok(ack) => eprintln!(
            "[kmark:ipc] end command=apply_editor_mutation_batch session={} op={} rev={}",
            request.session_id, operation_id, ack.revision
        ),
        Err(_) => eprintln!(
            "[kmark:ipc] error command=apply_editor_mutation_batch session={} op={} rev={}",
            request.session_id, operation_id, expected_revision
        ),
    }
    result
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
