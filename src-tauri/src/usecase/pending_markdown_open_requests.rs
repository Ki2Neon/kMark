use crate::domain::{
    MarkdownDocument, MarkdownDocumentError, MarkdownDocumentRepository, OpenRequestQueue,
};

pub fn take_pending_markdown_documents<Q, R>(
    queue: &Q,
    repository: &R,
) -> Result<Vec<MarkdownDocument>, MarkdownDocumentError>
where
    Q: OpenRequestQueue,
    R: MarkdownDocumentRepository,
{
    queue
        .drain()?
        .into_iter()
        .map(|path| repository.read(&path))
        .collect()
}

pub fn clear_pending_markdown_open_requests<Q>(queue: &Q) -> Result<(), MarkdownDocumentError>
where
    Q: OpenRequestQueue,
{
    queue.clear()
}
