use kmark_api_contract::{
    DocumentPayload, DocumentSessionSummaryPayload, ProposalPayload, StagedFileOperationPayload,
};
use kmark_application::{
    CreateDocumentProposal, DocumentSnapshot, InstanceProposalStatus, SessionProposal,
    SessionProposalKind, StagedFileOperationKind,
};

pub(crate) fn session_summary(snapshot: &DocumentSnapshot) -> DocumentSessionSummaryPayload {
    DocumentSessionSummaryPayload {
        instance_id: snapshot.instance_id.clone(),
        session_id: snapshot.session_id.clone(),
        revision: snapshot.revision,
        file_name: snapshot.file_name.clone(),
        file_path: snapshot.file_path.clone(),
        root_id: snapshot.root_id.clone(),
        relative_path: snapshot.relative_path.clone(),
        is_dirty: snapshot.is_dirty,
        pending_proposal_id: snapshot.pending_proposal_id.clone(),
        staged_file_operation: snapshot.staged_file_operation.as_ref().map(|operation| {
            StagedFileOperationPayload {
                kind: match operation.kind {
                    StagedFileOperationKind::Rename { .. } => "rename".to_owned(),
                    StagedFileOperationKind::Delete => "delete".to_owned(),
                },
                source_root_id: operation.source_root_id.clone(),
                source_relative_path: operation.source_relative_path.clone(),
                target_relative_path: match &operation.kind {
                    StagedFileOperationKind::Rename {
                        target_relative_path,
                    } => Some(target_relative_path.clone()),
                    StagedFileOperationKind::Delete => None,
                },
                staged_at_revision: operation.staged_at_revision,
            }
        }),
    }
}

pub(crate) fn document(snapshot: DocumentSnapshot) -> DocumentPayload {
    DocumentPayload {
        session: session_summary(&snapshot),
        content: snapshot.content,
    }
}

pub(crate) fn session_proposal(proposal: &SessionProposal) -> ProposalPayload {
    ProposalPayload {
        proposal_id: proposal.id.clone(),
        session_id: Some(proposal.session_id.clone()),
        base_revision: Some(proposal.base_revision),
        status: proposal.status.as_str().to_owned(),
        kind: match proposal.kind {
            SessionProposalKind::TextEdit { .. } => "text_edit",
            SessionProposalKind::RenameDocument { .. } => "rename_document",
            SessionProposalKind::DeleteDocument => "delete_document",
        }
        .to_owned(),
        unified_diff: proposal.unified_diff.clone(),
        created_session_id: None,
    }
}

pub(crate) fn create_proposal(proposal: &CreateDocumentProposal) -> ProposalPayload {
    ProposalPayload {
        proposal_id: proposal.id.clone(),
        session_id: None,
        base_revision: None,
        status: proposal.status.as_str().to_owned(),
        kind: "create_document".to_owned(),
        unified_diff: proposal.unified_diff.clone(),
        created_session_id: match &proposal.status {
            InstanceProposalStatus::Accepted { session_id } => Some(session_id.clone()),
            _ => None,
        },
    }
}
