use std::path::Path;

use super::{MarkdownDocument, MarkdownDocumentError};

pub trait MarkdownDocumentRepository: Send + Sync {
    fn read(&self, path: &Path) -> Result<MarkdownDocument, MarkdownDocumentError>;
    fn write(&self, path: &Path, content: &str) -> Result<(), MarkdownDocumentError>;
}