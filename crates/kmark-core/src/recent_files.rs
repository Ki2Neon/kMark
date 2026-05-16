use crate::ensure_markdown_file_name;

pub const MAX_RECENT_FILES: usize = 12;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecentFile {
    file_name: String,
    file_path: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RecentFiles {
    files: Vec<RecentFile>,
}

impl RecentFile {
    pub fn new(file_name: impl Into<String>, file_path: impl Into<String>) -> Option<Self> {
        let file_path = normalize_file_path(&file_path.into())?;
        let file_name = resolve_recent_file_name(&file_name.into(), &file_path);

        Some(Self {
            file_name,
            file_path,
        })
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    pub fn file_path(&self) -> &str {
        &self.file_path
    }
}

impl RecentFiles {
    pub fn new(files: impl IntoIterator<Item = RecentFile>) -> Self {
        let mut recent_files = Vec::with_capacity(MAX_RECENT_FILES);

        for file in files {
            if recent_files
                .iter()
                .any(|current_file: &RecentFile| current_file.file_path == file.file_path)
            {
                continue;
            }

            recent_files.push(file);

            if recent_files.len() >= MAX_RECENT_FILES {
                break;
            }
        }

        Self {
            files: recent_files,
        }
    }

    pub fn record(&self, file: RecentFile) -> Self {
        let mut files = Vec::with_capacity(MAX_RECENT_FILES);
        files.push(file.clone());

        for current_file in &self.files {
            if current_file.file_path == file.file_path {
                continue;
            }

            files.push(current_file.clone());

            if files.len() >= MAX_RECENT_FILES {
                break;
            }
        }

        Self { files }
    }

    pub fn files(&self) -> &[RecentFile] {
        &self.files
    }
}

fn normalize_file_path(value: &str) -> Option<String> {
    let normalized = value
        .chars()
        .map(|character| match character {
            '\u{0000}'..='\u{001f}' => ' ',
            _ => character,
        })
        .collect::<String>();
    let normalized = normalized.trim();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_owned())
    }
}

fn resolve_recent_file_name(file_name: &str, file_path: &str) -> String {
    let normalized_file_name = ensure_markdown_file_name(file_name);

    if normalized_file_name != crate::DEFAULT_FILE_NAME {
        return normalized_file_name;
    }

    file_path
        .rsplit(['/', '\\'])
        .find(|segment| !segment.trim().is_empty())
        .map(ensure_markdown_file_name)
        .unwrap_or(normalized_file_name)
}

#[cfg(test)]
mod tests {
    use super::{RecentFile, RecentFiles, MAX_RECENT_FILES};

    #[test]
    fn rejects_empty_file_path() {
        assert_eq!(RecentFile::new("note.md", "  "), None);
    }

    #[test]
    fn derives_file_name_from_path_when_name_is_empty() {
        let file = RecentFile::new("", r"C:\docs\report.md").expect("recent file");

        assert_eq!(file.file_name(), "report.md");
        assert_eq!(file.file_path(), r"C:\docs\report.md");
    }

    #[test]
    fn records_most_recent_first_and_deduplicates_path() {
        let first = RecentFile::new("first.md", r"C:\docs\first.md").expect("first");
        let second = RecentFile::new("second.md", r"C:\docs\second.md").expect("second");
        let renamed_first = RecentFile::new("first-renamed.md", r"C:\docs\first.md").expect("renamed first");
        let recent_files = RecentFiles::default()
            .record(first)
            .record(second.clone())
            .record(renamed_first.clone());

        assert_eq!(recent_files.files(), &[renamed_first, second]);
    }

    #[test]
    fn caps_recent_files() {
        let files = (0..(MAX_RECENT_FILES + 2))
            .filter_map(|index| RecentFile::new(format!("{index}.md"), format!("C:\\docs\\{index}.md")))
            .collect::<Vec<_>>();
        let recent_files = RecentFiles::new(files);

        assert_eq!(recent_files.files().len(), MAX_RECENT_FILES);
        assert_eq!(recent_files.files()[0].file_name(), "0.md");
    }
}
