use std::path::Path;

use crate::ports::MarkdownDocumentRepository;
use kmark_core::{MarkdownDocument, MarkdownDocumentError};

pub fn read_markdown_document<R>(
    repository: &R,
    path: &Path,
) -> Result<MarkdownDocument, MarkdownDocumentError>
where
    R: MarkdownDocumentRepository,
{
    repository.read(path)
}
