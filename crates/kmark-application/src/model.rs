use std::path::PathBuf;

use crate::FileFingerprint;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSnapshot {
    pub instance_id: String,
    pub session_id: String,
    pub revision: u64,
    pub file_name: String,
    pub file_path: Option<String>,
    pub root_id: Option<String>,
    pub relative_path: Option<String>,
    pub content: String,
    pub is_dirty: bool,
    pub externally_visible: bool,
    pub pending_proposal_id: Option<String>,
    pub staged_file_operation: Option<StagedFileOperation>,
}

#[derive(Clone, Debug)]
pub struct DocumentSession {
    pub(crate) id: String,
    pub(crate) revision: u64,
    pub(crate) file_name: String,
    pub(crate) file_path: Option<PathBuf>,
    pub(crate) root_id: Option<String>,
    pub(crate) relative_path: Option<String>,
    pub(crate) content: String,
    pub(crate) is_dirty: bool,
    pub(crate) externally_visible: bool,
    pub(crate) attached_window_label: Option<String>,
    pub(crate) persisted_fingerprint: Option<FileFingerprint>,
    pub(crate) pending_proposal_id: Option<String>,
    pub(crate) staged_file_operation: Option<StagedFileOperation>,
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
            root_id: self.root_id.clone(),
            relative_path: self.relative_path.clone(),
            content: self.content.clone(),
            is_dirty: self.is_dirty,
            externally_visible: self.externally_visible,
            pending_proposal_id: self.pending_proposal_id.clone(),
            staged_file_operation: self.staged_file_operation.clone(),
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
pub enum SessionProposalInput {
    TextEdit {
        expected_revision: u64,
        operations: Vec<TextEdit>,
    },
    RenameDocument {
        expected_revision: u64,
        target_relative_path: String,
    },
    DeleteDocument {
        expected_revision: u64,
    },
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
pub enum SessionProposalKind {
    TextEdit { operations: Vec<TextEdit> },
    RenameDocument { target_relative_path: String },
    DeleteDocument,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionProposal {
    pub id: String,
    pub session_id: String,
    pub base_revision: u64,
    pub base_content_hash: String,
    pub status: ProposalStatus,
    pub kind: SessionProposalKind,
    pub unified_diff: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateDocumentProposalInput {
    pub suggested_file_name: String,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstanceProposalStatus {
    Pending,
    Accepted { session_id: String },
    Rejected,
}

impl InstanceProposalStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted { .. } => "accepted",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateDocumentProposal {
    pub id: String,
    pub suggested_file_name: String,
    pub content: String,
    pub status: InstanceProposalStatus,
    pub unified_diff: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StagedFileOperationKind {
    Rename { target_relative_path: String },
    Delete,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StagedFileOperation {
    pub kind: StagedFileOperationKind,
    pub source_root_id: String,
    pub source_relative_path: String,
    pub source_fingerprint: FileFingerprint,
    pub staged_at_revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApplicationEvent {
    InstanceProposalCreated {
        proposal_id: String,
    },
    SessionProposalCreated {
        session_id: String,
        proposal_id: String,
    },
    SessionChanged {
        session_id: String,
        revision: u64,
    },
}
