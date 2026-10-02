use std::path::Path;

use crate::ports::MarkdownDocumentRepository;
use kmark_core::{EditorDocumentPersistenceSnapshot, MarkdownDocumentError};

pub fn write_markdown_document<R>(
    repository: &R,
    path: &Path,
    content: &str,
) -> Result<(), MarkdownDocumentError>
where
    R: MarkdownDocumentRepository,
{
    repository.write(path, content)
}

pub fn write_editor_document_snapshot<R>(
    repository: &R,
    path: &Path,
    snapshot: &EditorDocumentPersistenceSnapshot,
) -> Result<(), MarkdownDocumentError>
where
    R: MarkdownDocumentRepository,
{
    repository.write_editor_snapshot(path, snapshot)
}
