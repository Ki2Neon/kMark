use std::{future::Future, pin::Pin};

use crate::{ApplicationError, DocumentSnapshot};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewFormat {
    Html,
    Png,
}

impl PreviewFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Html => "html",
            Self::Png => "png",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewRequest {
    pub format: PreviewFormat,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewJobStatus {
    Queued,
    Running,
    Completed,
    Failed,
}

impl PreviewJobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewJob {
    pub id: String,
    pub session_id: String,
    pub revision: u64,
    pub format: PreviewFormat,
    pub status: PreviewJobStatus,
    pub media_type: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewArtifact {
    pub media_type: String,
    pub bytes: Vec<u8>,
}

pub type PreviewFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, ApplicationError>> + Send + 'a>>;

pub trait PreviewJobPort: Send + Sync {
    fn create<'a>(
        &'a self,
        document: DocumentSnapshot,
        request: PreviewRequest,
    ) -> PreviewFuture<'a, PreviewJob>;

    fn get<'a>(&'a self, job_id: &'a str) -> PreviewFuture<'a, PreviewJob>;

    fn artifact<'a>(&'a self, job_id: &'a str) -> PreviewFuture<'a, PreviewArtifact>;
}
