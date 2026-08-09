#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationErrorCode {
    DeleteStaged,
    DiskFileChanged,
    FileAlreadyExists,
    FileNotFound,
    InvalidEditRange,
    InvalidRelativePath,
    InvalidState,
    IoFailed,
    ProposalPending,
    ProposalNotFound,
    RevisionConflict,
    RootNotFound,
    SessionNotFound,
    StagedOperationNotFound,
    StaleProposal,
    UnsupportedEncoding,
}

impl ApplicationErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DeleteStaged => "delete_staged",
            Self::DiskFileChanged => "disk_file_changed",
            Self::FileAlreadyExists => "file_already_exists",
            Self::FileNotFound => "file_not_found",
            Self::InvalidEditRange => "invalid_edit_range",
            Self::InvalidRelativePath => "invalid_relative_path",
            Self::InvalidState => "invalid_state",
            Self::IoFailed => "io_failed",
            Self::ProposalPending => "proposal_pending",
            Self::ProposalNotFound => "proposal_not_found",
            Self::RevisionConflict => "revision_conflict",
            Self::RootNotFound => "root_not_found",
            Self::SessionNotFound => "session_not_found",
            Self::StagedOperationNotFound => "staged_operation_not_found",
            Self::StaleProposal => "stale_proposal",
            Self::UnsupportedEncoding => "unsupported_encoding",
        }
    }
}

#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct ApplicationError {
    code: ApplicationErrorCode,
    message: String,
    current_revision: Option<u64>,
}

impl ApplicationError {
    pub fn new(code: ApplicationErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            current_revision: None,
        }
    }

    pub fn revision_conflict(current_revision: u64) -> Self {
        Self {
            code: ApplicationErrorCode::RevisionConflict,
            message: "document revision does not match expected revision".to_owned(),
            current_revision: Some(current_revision),
        }
    }

    pub fn code(&self) -> ApplicationErrorCode {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn current_revision(&self) -> Option<u64> {
        self.current_revision
    }
}
