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
        Self {
            file_name: ensure_markdown_file_name(&file_name.into()),
            content: content.into(),
            file_path: file_path
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
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
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\u{0000}'..='\u{001f}' => {
                '-'
            }
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

fn has_markdown_extension(value: &str) -> bool {
    value.rsplit_once('.')
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
    use super::ensure_markdown_file_name;

    #[test]
    fn normalizes_markdown_file_name() {
        assert_eq!(ensure_markdown_file_name(""), "untitled.md");
        assert_eq!(ensure_markdown_file_name(" notes "), "notes.md");
        assert_eq!(ensure_markdown_file_name("report.txt"), "report.txt");
        assert_eq!(ensure_markdown_file_name("bad:name"), "bad-name.md");
    }
}
