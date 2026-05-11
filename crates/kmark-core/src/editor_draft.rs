pub const DEFAULT_FILE_NAME: &str = "untitled.md";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredEdit {
    file_name: String,
    content: String,
    file_path: Option<String>,
    saved_at: Option<u64>,
}

impl StoredEdit {
    pub fn new(
        file_name: impl Into<String>,
        content: impl Into<String>,
        file_path: Option<String>,
        saved_at: Option<u64>,
    ) -> Self {
        let raw_file_name = file_name.into();
        let normalized_file_path = file_path
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());

        Self {
            file_name: resolve_stored_file_name(&raw_file_name, normalized_file_path.as_deref()),
            content: content.into(),
            file_path: normalized_file_path,
            saved_at,
        }
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn file_path(&self) -> Option<&str> {
        self.file_path.as_deref()
    }

    pub fn saved_at(&self) -> Option<u64> {
        self.saved_at
    }
}

pub fn ensure_markdown_file_name(value: &str) -> String {
    let trimmed = value.trim();
    let normalized = if trimmed.is_empty() {
        DEFAULT_FILE_NAME
    } else {
        trimmed
    };

    let sanitized = normalized
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\u{0000}'..='\u{001f}' => '-',
            _ => character,
        })
        .collect::<String>();

    if sanitized.is_empty() {
        DEFAULT_FILE_NAME.to_owned()
    } else if has_markdown_extension(&sanitized) {
        sanitized
    } else {
        format!("{sanitized}.md")
    }
}

fn resolve_stored_file_name(file_name: &str, file_path: Option<&str>) -> String {
    let normalized_file_name = ensure_markdown_file_name(file_name);

    if normalized_file_name != DEFAULT_FILE_NAME {
        return normalized_file_name;
    }

    file_path
        .and_then(extract_file_name_from_path)
        .map(ensure_markdown_file_name)
        .unwrap_or(normalized_file_name)
}

fn extract_file_name_from_path(file_path: &str) -> Option<&str> {
    let trimmed_path = file_path
        .trim()
        .trim_end_matches(|character| character == '/' || character == '\\');

    if trimmed_path.is_empty() {
        return None;
    }

    trimmed_path
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .filter(|value| !value.trim().is_empty())
}

fn has_markdown_extension(value: &str) -> bool {
    value
        .rsplit_once('.')
        .map(|(_, extension)| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkd" | "txt"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{ensure_markdown_file_name, StoredEdit};

    #[test]
    fn normalizes_markdown_file_name() {
        assert_eq!(ensure_markdown_file_name(""), "untitled.md");
        assert_eq!(ensure_markdown_file_name(" notes "), "notes.md");
        assert_eq!(ensure_markdown_file_name("report.txt"), "report.txt");
        assert_eq!(ensure_markdown_file_name("bad:name"), "bad-name.md");
    }

    #[test]
    fn derives_default_stored_file_name_from_file_path() {
        let windows_edit = StoredEdit::new(
            "untitled.md",
            "content",
            Some("C:\\docs\\report.md".to_owned()),
            None,
        );
        let unix_edit = StoredEdit::new(
            "",
            "content",
            Some("/home/user/notes.markdown".to_owned()),
            None,
        );

        assert_eq!(windows_edit.file_name(), "report.md");
        assert_eq!(unix_edit.file_name(), "notes.markdown");
    }
}
