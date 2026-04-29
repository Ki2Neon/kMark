use std::{mem, path::PathBuf, sync::Mutex};

use crate::domain::{MarkdownDocumentError, OpenRequestQueue};

#[derive(Default)]
pub struct InMemoryOpenRequestQueue {
    pending_paths: Mutex<Vec<PathBuf>>,
}

impl OpenRequestQueue for InMemoryOpenRequestQueue {
    fn enqueue(&self, paths: Vec<PathBuf>) -> Result<(), MarkdownDocumentError> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut pending_paths = self
            .pending_paths
            .lock()
            .map_err(|_| MarkdownDocumentError::OpenRequestQueuePoisoned)?;

        pending_paths.extend(paths);

        Ok(())
    }

    fn drain(&self) -> Result<Vec<PathBuf>, MarkdownDocumentError> {
        let mut pending_paths = self
            .pending_paths
            .lock()
            .map_err(|_| MarkdownDocumentError::OpenRequestQueuePoisoned)?;

        Ok(mem::take(&mut *pending_paths))
    }

    fn clear(&self) -> Result<(), MarkdownDocumentError> {
        let mut pending_paths = self
            .pending_paths
            .lock()
            .map_err(|_| MarkdownDocumentError::OpenRequestQueuePoisoned)?;

        pending_paths.clear();

        Ok(())
    }
}
