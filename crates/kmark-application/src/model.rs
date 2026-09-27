use std::path::PathBuf;

use crate::FileFingerprint;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSnapshot {
    pub instance_id: String,
    pub session_id: String,
    pub revision: u64,
    pub file_name: String,
    pub file_path: Option<String>,
    pub content: String,
    pub is_dirty: bool,
    pub pending_proposal_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DocumentSession {
    pub(crate) id: String,
    pub(crate) revision: u64,
    pub(crate) file_name: String,
    pub(crate) file_path: Option<PathBuf>,
    pub(crate) content: String,
    pub(crate) is_dirty: bool,
    pub(crate) attached_window_label: Option<String>,
    pub(crate) persisted_fingerprint: Option<FileFingerprint>,
    pub(crate) pending_proposal_id: Option<String>,
}

impl DocumentSession {
    pub(crate) fn snapshot(&self, instance_id: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            instance_id: instance_id.to_owned(),
            session_id: self.id.clone(),
            revision: self.revision,
            file_name: self.file_name.clone(),
            file_path: self
                .file_path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            content: self.content.clone(),
            is_dirty: self.is_dirty,
            pending_proposal_id: self.pending_proposal_id.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextEdit {
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionProposalInput {
    pub expected_revision: u64,
    pub operations: Vec<TextEdit>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProposalStatus {
    Pending,
    Accepted,
    Rejected,
    StaleProposal,
}

impl ProposalStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
            Self::StaleProposal => "stale_proposal",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionProposal {
    pub id: String,
    pub session_id: String,
    pub base_revision: u64,
    pub base_content_hash: String,
    pub status: ProposalStatus,
    pub operations: Vec<TextEdit>,
    pub unified_diff: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApplicationEvent {
    SessionProposalCreated {
        session_id: String,
        proposal_id: String,
    },
    SessionChanged {
        session_id: String,
        revision: u64,
    },
    SessionPresentationRequested {
        session_id: String,
    },
}
