use std::{
    fs::{self, File},
    io::{BufWriter, Write},
    path::Path,
};

use crate::ports::MarkdownDocumentRepository;
use kmark_core::{
    is_supported_markdown_path, EditorDocumentPersistenceSnapshot, MarkdownDocument,
    MarkdownDocumentError,
};

#[derive(Clone, Copy, Default)]
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

    fn write_editor_snapshot(
        &self,
        path: &Path,
        snapshot: &EditorDocumentPersistenceSnapshot,
    ) -> Result<(), MarkdownDocumentError> {
        validate_markdown_path(path)?;
        let display_path = display_path(path);
        let file = File::create(path).map_err(|source| MarkdownDocumentError::WriteFailed {
            path: display_path.clone(),
            source,
        })?;
        let mut writer = BufWriter::new(file);
        snapshot
            .write_to(&mut writer)
            .and_then(|()| writer.flush())
            .map_err(|source| MarkdownDocumentError::WriteFailed {
                path: display_path,
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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };

    use kmark_core::EditorDocument;

    use super::{FileSystemMarkdownDocumentRepository, MarkdownDocumentRepository};

    static NEXT_TEST_FILE_ID: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn writes_crlf_editor_snapshot_directly_to_file() {
        let file_id = NEXT_TEST_FILE_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "kmark-editor-snapshot-{}-{file_id}.md",
            std::process::id()
        ));
        let document = EditorDocument::from_external_text("日本語\r\nsecond\r\n", 3, true);
        let repository = FileSystemMarkdownDocumentRepository;

        repository
            .write_editor_snapshot(&path, &document.persistence_snapshot())
            .expect("write editor snapshot");
        let bytes = fs::read(&path).expect("read saved snapshot");
        fs::remove_file(&path).expect("remove saved snapshot");

        assert_eq!(bytes, "日本語\r\nsecond\r\n".as_bytes());
    }
}
