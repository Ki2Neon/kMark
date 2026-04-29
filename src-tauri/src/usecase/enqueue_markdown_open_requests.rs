use std::path::PathBuf;

use crate::domain::{MarkdownDocumentError, OpenRequestQueue};

pub fn enqueue_markdown_open_requests<Q>(
    queue: &Q,
    file_paths: Vec<PathBuf>,
) -> Result<(), MarkdownDocumentError>
where
    Q: OpenRequestQueue,
{
    queue.enqueue(file_paths)
}
