use std::path::Path;

use kmark_core::{EditorDocumentPersistenceSnapshot, MarkdownDocument, MarkdownDocumentError};

pub trait MarkdownDocumentRepository: Send + Sync {
    fn read(&self, path: &Path) -> Result<MarkdownDocument, MarkdownDocumentError>;
    fn write(&self, path: &Path, content: &str) -> Result<(), MarkdownDocumentError>;
    fn write_editor_snapshot(
        &self,
        path: &Path,
        snapshot: &EditorDocumentPersistenceSnapshot,
    ) -> Result<(), MarkdownDocumentError>;
}
