mod error;
mod file_port;
mod model;
mod preview_port;
mod service;

pub use error::{ApplicationError, ApplicationErrorCode};
pub use file_port::{
    DocumentFileRepository, FileEntry, FileFingerprint, ReadFileResult, RegisteredRoot, SearchMatch,
};
pub use model::{
    ApplicationEvent, CreateDocumentProposal, CreateDocumentProposalInput, DocumentSession,
    DocumentSnapshot, InstanceProposalStatus, ProposalStatus, SessionProposal,
    SessionProposalInput, SessionProposalKind, StagedFileOperation, StagedFileOperationKind,
    TextEdit,
};
pub use preview_port::{
    PreviewArtifact, PreviewFormat, PreviewFuture, PreviewJob, PreviewJobPort, PreviewJobStatus,
    PreviewRequest,
};
pub use service::{ApplicationEventSink, ApplicationService, NoopApplicationEventSink};
