use std::path::{Path, PathBuf};

const DEFAULT_FILE_NAME: &str = "untitled.md";
const SUPPORTED_MARKDOWN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "txt"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MarkdownDocument {
    file_name: String,
    file_path: PathBuf,
    content: String,
}

impl MarkdownDocument {
    pub fn new(file_path: PathBuf, content: String) -> Self {
        let file_name = file_path
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(DEFAULT_FILE_NAME)
            .to_owned();

        Self {
            file_name,
            file_path,
            content,
        }
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    pub fn file_path(&self) -> &Path {
        &self.file_path
    }

    pub fn content(&self) -> &str {
        &self.content
    }
}

pub fn is_supported_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            SUPPORTED_MARKDOWN_EXTENSIONS
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}
