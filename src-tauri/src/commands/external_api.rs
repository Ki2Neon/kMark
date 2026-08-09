use std::{collections::HashSet, path::PathBuf};

use kmark_application::{
    CreateDocumentProposal, DocumentSnapshot, InstanceProposalStatus, RegisteredRoot,
    SessionProposal, SessionProposalKind, StagedFileOperationKind,
};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::CommandErrorPayload;
use crate::{
    dto::{
        DocumentSessionPayload, ExternalApiPreferencesPayload, ExternalApiRootPayload,
        ExternalApiStatusPayload, ExternalProposalReviewPayload, PendingExternalProposalsPayload,
        StagedFileOperationPayload,
    },
    infra::persist_external_api_preferences,
    open_external_session_window, AppState,
};

#[tauri::command]
pub fn get_external_api_preferences(
    state: State<'_, AppState>,
) -> Result<ExternalApiPreferencesPayload, CommandErrorPayload> {
    state
        .external_api_preferences
        .lock()
        .map(|preferences| preferences.clone())
        .map_err(|_| CommandErrorPayload::state_poisoned("external API preferences"))
}

#[tauri::command]
pub async fn get_external_api_status(
    state: State<'_, AppState>,
) -> Result<ExternalApiStatusPayload, CommandErrorPayload> {
    let runtime = state.external_api_runtime.lock().await;
    Ok(ExternalApiStatusPayload {
        enabled: runtime.is_enabled(),
        instance_id: state.application.instance_id().to_owned(),
        endpoint: runtime.endpoint(),
    })
}

#[tauri::command]
pub async fn set_external_api_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences: ExternalApiPreferencesPayload,
) -> Result<ExternalApiPreferencesPayload, CommandErrorPayload> {
    let roots = validate_roots(&preferences.roots)?;
    let previous = state
        .external_api_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("external API preferences"))?
        .clone();
    let previous_roots = state.application.roots();

    if preferences.enabled {
        state.application.replace_roots(roots.clone());
        let mut runtime = state.external_api_runtime.lock().await;
        if let Err(error) = runtime
            .start(&app, state.application.clone(), state.preview_jobs.clone())
            .await
        {
            state.application.replace_roots(previous_roots);
            return Err(CommandErrorPayload::with_detail(
                "external_api_start_failed",
                "failed to start external API",
                error.to_string(),
            ));
        }
    }

    if let Err(error) = persist_external_api_preferences(&app, &preferences) {
        if preferences.enabled && !previous.enabled {
            state.external_api_runtime.lock().await.stop().await;
        }
        state.application.replace_roots(previous_roots);
        return Err(error.into());
    }

    if !preferences.enabled {
        state.application.replace_roots(roots);
    }
    *state
        .external_api_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("external API preferences"))? =
        preferences.clone();
    if !preferences.enabled {
        state.external_api_runtime.lock().await.stop().await;
    }
    Ok(preferences)
}

#[tauri::command]
pub async fn pick_external_api_root(
    app: AppHandle,
) -> Result<Option<ExternalApiRootPayload>, CommandErrorPayload> {
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "external_api_root_dialog_failed",
            "failed to open root directory picker",
            error.to_string(),
        )
    })?;
    selected.map(root_from_file_path).transpose()
}

#[tauri::command]
pub fn register_document_session(
    window: WebviewWindow,
    state: State<'_, AppState>,
    file_name: String,
    file_path: Option<String>,
    content: String,
    is_dirty: bool,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .register_frontend_session(
            window.label().to_owned(),
            file_name,
            file_path,
            content,
            is_dirty,
        )
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

#[tauri::command]
pub fn attach_document_session(
    window: WebviewWindow,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .attach_session(&session_id, window.label().to_owned())
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

#[tauri::command]
pub fn sync_document_session(
    state: State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    file_name: String,
    file_path: Option<String>,
    content: String,
    is_dirty: bool,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .sync_frontend_session(
            &session_id,
            expected_revision,
            file_name,
            file_path,
            content,
            is_dirty,
        )
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_document_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .session_for_ui(&session_id)
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_pending_external_proposals(
    state: State<'_, AppState>,
) -> Result<PendingExternalProposalsPayload, CommandErrorPayload> {
    let (create_proposals, session_proposals) = state.application.pending_proposals();
    let mut proposals = create_proposals
        .iter()
        .map(create_proposal_payload)
        .collect::<Vec<_>>();
    for proposal in &session_proposals {
        let session = state.application.session_for_ui(&proposal.session_id)?;
        proposals.push(session_proposal_payload(proposal, &session));
    }
    proposals.sort_by(|left, right| left.proposal_id.cmp(&right.proposal_id));
    Ok(PendingExternalProposalsPayload { proposals })
}

#[tauri::command]
pub async fn accept_external_proposal(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    let (create_proposals, session_proposals) = state.application.pending_proposals();
    if create_proposals
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        let snapshot = state
            .application
            .accept_create_document_proposal(&proposal_id)?;
        open_external_session_window(&app, &snapshot.session_id).map_err(|error| {
            CommandErrorPayload::with_detail(
                "external_session_window_failed",
                "proposal was accepted but its editor window could not be opened",
                error.to_string(),
            )
        })?;
        return Ok(session_payload(&snapshot));
    }
    if session_proposals
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        let snapshot = state.application.accept_session_proposal(&proposal_id)?;
        if !state
            .application
            .session_has_attached_window(&snapshot.session_id)?
        {
            open_external_session_window(&app, &snapshot.session_id).map_err(|error| {
                CommandErrorPayload::with_detail(
                    "external_session_window_failed",
                    "proposal was accepted but its editor window could not be opened",
                    error.to_string(),
                )
            })?;
        }
        return Ok(session_payload(&snapshot));
    }
    Err(CommandErrorPayload::new(
        "proposal_not_found",
        "pending proposal not found",
    ))
}

#[tauri::command]
pub fn reject_external_proposal(
    state: State<'_, AppState>,
    proposal_id: String,
) -> Result<(), CommandErrorPayload> {
    let (create_proposals, session_proposals) = state.application.pending_proposals();
    if create_proposals
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        return state
            .application
            .reject_create_document_proposal(&proposal_id)
            .map_err(Into::into);
    }
    if session_proposals
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        return state
            .application
            .reject_session_proposal(&proposal_id)
            .map_err(Into::into);
    }
    Err(CommandErrorPayload::new(
        "proposal_not_found",
        "pending proposal not found",
    ))
}

#[tauri::command]
pub fn commit_staged_file_operation(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .commit_staged_file_operation(&session_id)
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

#[tauri::command]
pub fn cancel_staged_file_operation(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    state
        .application
        .cancel_staged_file_operation(&session_id)
        .map(|snapshot| session_payload(&snapshot))
        .map_err(Into::into)
}

fn validate_roots(
    roots: &[ExternalApiRootPayload],
) -> Result<Vec<RegisteredRoot>, CommandErrorPayload> {
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    roots
        .iter()
        .map(|root| {
            if root.id.trim().is_empty() || root.label.trim().is_empty() {
                return Err(CommandErrorPayload::new(
                    "invalid_external_api_root",
                    "root id and label must not be empty",
                ));
            }
            let path = PathBuf::from(root.path.trim())
                .canonicalize()
                .map_err(|error| {
                    CommandErrorPayload::with_detail(
                        "invalid_external_api_root",
                        "registered root directory could not be resolved",
                        error.to_string(),
                    )
                })?;
            if !path.is_dir() || !ids.insert(root.id.clone()) || !paths.insert(path.clone()) {
                return Err(CommandErrorPayload::new(
                    "invalid_external_api_root",
                    "registered roots must be unique existing directories",
                ));
            }
            Ok(RegisteredRoot {
                id: root.id.clone(),
                label: root.label.trim().to_owned(),
                path,
            })
        })
        .collect()
}

fn root_from_file_path(path: FilePath) -> Result<ExternalApiRootPayload, CommandErrorPayload> {
    let path = path.into_path().map_err(|error| {
        CommandErrorPayload::with_detail(
            "invalid_external_api_root",
            "selected root directory could not be resolved",
            error.to_string(),
        )
    })?;
    let path = path.canonicalize().map_err(|error| {
        CommandErrorPayload::with_detail(
            "invalid_external_api_root",
            "selected root directory could not be resolved",
            error.to_string(),
        )
    })?;
    let label = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    let id = format!("root-{}", hex_prefix(&digest, 16));
    Ok(ExternalApiRootPayload {
        id,
        label,
        path: path.to_string_lossy().into_owned(),
    })
}

fn hex_prefix(bytes: &[u8], count: usize) -> String {
    bytes
        .iter()
        .take(count / 2)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn session_payload(snapshot: &DocumentSnapshot) -> DocumentSessionPayload {
    DocumentSessionPayload {
        instance_id: snapshot.instance_id.clone(),
        session_id: snapshot.session_id.clone(),
        revision: snapshot.revision,
        file_name: snapshot.file_name.clone(),
        file_path: snapshot.file_path.clone(),
        content: snapshot.content.clone(),
        is_dirty: snapshot.is_dirty,
        pending_proposal_id: snapshot.pending_proposal_id.clone(),
        staged_file_operation: snapshot.staged_file_operation.as_ref().map(|operation| {
            StagedFileOperationPayload {
                kind: match operation.kind {
                    StagedFileOperationKind::Rename { .. } => "rename",
                    StagedFileOperationKind::Delete => "delete",
                }
                .to_owned(),
                source_relative_path: operation.source_relative_path.clone(),
                target_relative_path: match &operation.kind {
                    StagedFileOperationKind::Rename {
                        target_relative_path,
                    } => Some(target_relative_path.clone()),
                    StagedFileOperationKind::Delete => None,
                },
            }
        }),
    }
}

fn create_proposal_payload(proposal: &CreateDocumentProposal) -> ExternalProposalReviewPayload {
    ExternalProposalReviewPayload {
        proposal_id: proposal.id.clone(),
        session_id: match &proposal.status {
            InstanceProposalStatus::Accepted { session_id } => Some(session_id.clone()),
            _ => None,
        },
        kind: "create_document".to_owned(),
        status: proposal.status.as_str().to_owned(),
        file_name: proposal.suggested_file_name.clone(),
        unified_diff: proposal.unified_diff.clone(),
    }
}

fn session_proposal_payload(
    proposal: &SessionProposal,
    session: &DocumentSnapshot,
) -> ExternalProposalReviewPayload {
    let kind = match proposal.kind {
        SessionProposalKind::TextEdit { .. } => "text_edit",
        SessionProposalKind::RenameDocument { .. } => "rename_document",
        SessionProposalKind::DeleteDocument => "delete_document",
    };
    ExternalProposalReviewPayload {
        proposal_id: proposal.id.clone(),
        session_id: Some(proposal.session_id.clone()),
        kind: kind.to_owned(),
        status: proposal.status.as_str().to_owned(),
        file_name: session.file_name.clone(),
        unified_diff: proposal.unified_diff.clone(),
    }
}
