use thiserror::Error;

#[derive(Debug, Error)]
pub enum MarkdownDocumentError {
    #[error("unsupported markdown file: {0}")]
    UnsupportedPath(String),
    #[error("file not found: {0}")]
    NotFound(String),
    #[error("failed to read file: {path}")]
    ReadFailed {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to write file: {path}")]
    WriteFailed {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to access the pending open request queue")]
    OpenRequestQueuePoisoned,
}