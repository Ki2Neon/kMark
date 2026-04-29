use std::{fs, path::Path};

use crate::domain::{
    is_supported_markdown_path, MarkdownDocument, MarkdownDocumentError, MarkdownDocumentRepository,
};

#[derive(Default)]
pub struct FileSystemMarkdownDocumentRepository;

impl MarkdownDocumentRepository for FileSystemMarkdownDocumentRepository {
    fn read(&self, path: &Path) -> Result<MarkdownDocument, MarkdownDocumentError> {
        validate_markdown_path(path)?;

        if !path.is_file() {
            return Err(MarkdownDocumentError::NotFound(display_path(path)));
        }

        let content =
            fs::read_to_string(path).map_err(|source| MarkdownDocumentError::ReadFailed {
                path: display_path(path),
                source,
            })?;

        Ok(MarkdownDocument::new(path.to_path_buf(), content))
    }

    fn write(&self, path: &Path, content: &str) -> Result<(), MarkdownDocumentError> {
        validate_markdown_path(path)?;

        fs::write(path, content).map_err(|source| MarkdownDocumentError::WriteFailed {
            path: display_path(path),
            source,
        })
    }
}

fn validate_markdown_path(path: &Path) -> Result<(), MarkdownDocumentError> {
    if is_supported_markdown_path(path) {
        return Ok(());
    }

    Err(MarkdownDocumentError::UnsupportedPath(display_path(path)))
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
