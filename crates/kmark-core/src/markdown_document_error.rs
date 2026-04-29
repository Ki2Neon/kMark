use std::{error::Error, fmt};

#[derive(Debug)]
pub enum MarkdownDocumentError {
    UnsupportedPath(String),
    NotFound(String),
    ReadFailed {
        path: String,
        source: std::io::Error,
    },
    WriteFailed {
        path: String,
        source: std::io::Error,
    },
    OpenRequestQueuePoisoned,
}

impl fmt::Display for MarkdownDocumentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedPath(path) => write!(formatter, "unsupported markdown file: {path}"),
            Self::NotFound(path) => write!(formatter, "file not found: {path}"),
            Self::ReadFailed { path, .. } => write!(formatter, "failed to read file: {path}"),
            Self::WriteFailed { path, .. } => write!(formatter, "failed to write file: {path}"),
            Self::OpenRequestQueuePoisoned => {
                formatter.write_str("failed to access the pending open request queue")
            }
        }
    }
}

impl Error for MarkdownDocumentError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::ReadFailed { source, .. } | Self::WriteFailed { source, .. } => Some(source),
            Self::UnsupportedPath(_) | Self::NotFound(_) | Self::OpenRequestQueuePoisoned => None,
        }
    }
}
