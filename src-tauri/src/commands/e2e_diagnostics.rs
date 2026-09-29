use serde::Serialize;
use tauri::{Manager, State, WebviewWindow};

use crate::AppState;

/// Read-only state projected from the live application. No test may mutate Core state through it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct E2eDebugSnapshot {
    instance_id: String,
    app_config_dir: Option<String>,
    session_id: Option<String>,
    document_revision: Option<u64>,
    preview_revision: Option<u64>,
    last_operation_id: Option<String>,
    last_operation_revision: Option<u64>,
    dirty: Option<bool>,
    active_document: Option<String>,
    pending_jobs: usize,
}

#[tauri::command]
pub fn get_e2e_debug_snapshot(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> E2eDebugSnapshot {
    let session = state.application.session_for_window(window.label());
    let session_id = session.as_ref().map(|session| session.session_id.clone());
    let preview_revision = session_id
        .as_deref()
        .and_then(|session_id| state.application.preview_revision(session_id));
    let last_operation = session_id
        .as_deref()
        .and_then(|session_id| state.application.last_applied_batch(session_id));
    E2eDebugSnapshot {
        instance_id: state.application.instance_id().to_owned(),
        app_config_dir: crate::infra::app_config_dir(&window.app_handle())
            .ok()
            .map(|path| path.to_string_lossy().into_owned()),
        session_id,
        document_revision: session.as_ref().map(|session| session.revision),
        preview_revision,
        last_operation_id: last_operation
            .as_ref()
            .map(|(client_id, batch_id, _)| format!("{client_id}:{batch_id}")),
        last_operation_revision: last_operation.map(|(_, _, revision)| revision),
        dirty: session.as_ref().map(|session| session.is_dirty),
        active_document: session.and_then(|session| session.file_path),
        pending_jobs: state.preview_jobs.pending_count(),
    }
}
