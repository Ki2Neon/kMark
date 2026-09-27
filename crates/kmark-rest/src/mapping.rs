use kmark_api_contract::{DocumentPayload, DocumentSessionSummaryPayload, ProposalPayload};
use kmark_application::{DocumentSnapshot, SessionProposal};

pub(crate) fn session_summary(snapshot: &DocumentSnapshot) -> DocumentSessionSummaryPayload {
    DocumentSessionSummaryPayload {
        instance_id: snapshot.instance_id.clone(),
        session_id: snapshot.session_id.clone(),
        revision: snapshot.revision,
        file_name: snapshot.file_name.clone(),
        file_path: snapshot.file_path.clone(),
        is_dirty: snapshot.is_dirty,
        pending_proposal_id: snapshot.pending_proposal_id.clone(),
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
        session_id: proposal.session_id.clone(),
        base_revision: proposal.base_revision,
        status: proposal.status.as_str().to_owned(),
        kind: "text_edit".to_owned(),
        unified_diff: proposal.unified_diff.clone(),
    }
}
