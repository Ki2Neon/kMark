use std::path::PathBuf;

use kmark_core::MarkdownDocumentError;

pub trait OpenRequestQueue: Send + Sync {
    fn enqueue(&self, paths: Vec<PathBuf>) -> Result<(), MarkdownDocumentError>;
    fn drain(&self) -> Result<Vec<PathBuf>, MarkdownDocumentError>;
    fn clear(&self) -> Result<(), MarkdownDocumentError>;
}
