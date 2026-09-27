use kmark_application::{DocumentSnapshot, SessionProposal};
use tauri::{AppHandle, State, WebviewWindow};

use super::error::CommandErrorPayload;
use crate::{
    dto::{
        DocumentSessionPayload, ExternalApiPreferencesPayload, ExternalApiStatusPayload,
        ExternalProposalReviewPayload, PendingExternalProposalsPayload,
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
    let previous = state
        .external_api_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("external API preferences"))?
        .clone();

    if preferences.enabled {
        let mut runtime = state.external_api_runtime.lock().await;
        if let Err(error) = runtime
            .start(&app, state.application.clone(), state.preview_jobs.clone())
            .await
        {
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
        return Err(error.into());
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
    let mut proposals = Vec::new();
    for proposal in state.application.pending_proposals() {
        let session = state.application.session_for_ui(&proposal.session_id)?;
        proposals.push(session_proposal_payload(&proposal, &session));
    }
    Ok(PendingExternalProposalsPayload { proposals })
}

#[tauri::command]
pub async fn accept_external_proposal(
    app: AppHandle,
    state: State<'_, AppState>,
    proposal_id: String,
) -> Result<DocumentSessionPayload, CommandErrorPayload> {
    if !state
        .application
        .pending_proposals()
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        return Err(CommandErrorPayload::new(
            "proposal_not_found",
            "pending proposal not found",
        ));
    }
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
    Ok(session_payload(&snapshot))
}

#[tauri::command]
pub fn reject_external_proposal(
    state: State<'_, AppState>,
    proposal_id: String,
) -> Result<(), CommandErrorPayload> {
    if !state
        .application
        .pending_proposals()
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        return Err(CommandErrorPayload::new(
            "proposal_not_found",
            "pending proposal not found",
        ));
    }
    state
        .application
        .reject_session_proposal(&proposal_id)
        .map_err(Into::into)
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
    }
}

fn session_proposal_payload(
    proposal: &SessionProposal,
    session: &DocumentSnapshot,
) -> ExternalProposalReviewPayload {
    ExternalProposalReviewPayload {
        proposal_id: proposal.id.clone(),
        session_id: proposal.session_id.clone(),
        kind: "text_edit".to_owned(),
        status: proposal.status.as_str().to_owned(),
        file_name: session.file_name.clone(),
        unified_diff: proposal.unified_diff.clone(),
    }
}
