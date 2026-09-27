#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationErrorCode {
    DiskFileChanged,
    FileNotFound,
    InvalidAbsolutePath,
    InvalidEditRange,
    InvalidState,
    IoFailed,
    ProposalPending,
    ProposalNotFound,
    RevisionConflict,
    SessionNotFound,
    StaleProposal,
    UnsupportedEncoding,
    UnsupportedFileType,
}

impl ApplicationErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DiskFileChanged => "disk_file_changed",
            Self::FileNotFound => "file_not_found",
            Self::InvalidAbsolutePath => "invalid_absolute_path",
            Self::InvalidEditRange => "invalid_edit_range",
            Self::InvalidState => "invalid_state",
            Self::IoFailed => "io_failed",
            Self::ProposalPending => "proposal_pending",
            Self::ProposalNotFound => "proposal_not_found",
            Self::RevisionConflict => "revision_conflict",
            Self::SessionNotFound => "session_not_found",
            Self::StaleProposal => "stale_proposal",
            Self::UnsupportedEncoding => "unsupported_encoding",
            Self::UnsupportedFileType => "unsupported_file_type",
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
