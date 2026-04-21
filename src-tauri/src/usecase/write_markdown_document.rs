use std::path::Path;

use crate::domain::{MarkdownDocumentError, MarkdownDocumentRepository};

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