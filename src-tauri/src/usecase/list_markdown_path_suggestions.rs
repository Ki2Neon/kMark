use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

use kmark_core::is_supported_markdown_path;

use crate::ports::{AssetDirectoryEntry, AssetRepository};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkdownPathSuggestionEntryKind {
    Directory,
    File,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkdownPathSuggestionFilter {
    All,
    Extensions(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownPathSuggestion {
    pub label: String,
    pub insert_text: String,
    pub relative_path: String,
    pub entry_kind: MarkdownPathSuggestionEntryKind,
}

pub fn list_markdown_path_suggestions<R>(
    repository: &R,
    markdown_file_path: &Path,
    input: &str,
    filter: MarkdownPathSuggestionFilter,
) -> Vec<MarkdownPathSuggestion>
where
    R: AssetRepository,
{
    if !is_valid_markdown_file(repository, markdown_file_path) {
        return Vec::new();
    }

    let Some(markdown_directory) = markdown_file_path.parent() else {
        return Vec::new();
    };

    if !repository.is_dir(markdown_directory) {
        return Vec::new();
    }

    let normalized_input = trim_path_input_quotes(input);

    if is_absolute_or_url_like_path(normalized_input) {
        return Vec::new();
    }

    let path_input = split_path_input(normalized_input);
    let listing_directory = markdown_directory.join(&path_input.directory);

    if !repository.is_dir(&listing_directory) {
        return Vec::new();
    }

    let Ok(entries) = repository.read_dir(&listing_directory) else {
        return Vec::new();
    };

    let file_prefix = path_input.file_prefix.to_ascii_lowercase();
    let mut suggestions = entries
        .into_iter()
        .filter_map(|entry| {
            path_suggestion_from_entry(entry, &path_input.output_directory, &file_prefix, &filter)
        })
        .collect::<Vec<_>>();

    suggestions.sort_by(compare_path_suggestions);
    suggestions
}

fn is_valid_markdown_file<R>(repository: &R, markdown_file_path: &Path) -> bool
where
    R: AssetRepository,
{
    !markdown_file_path.as_os_str().is_empty()
        && is_supported_markdown_path(markdown_file_path)
        && repository.is_file(markdown_file_path)
}

struct PathInputParts {
    directory: PathBuf,
    file_prefix: String,
    output_directory: String,
}

fn split_path_input(input: &str) -> PathInputParts {
    let normalized = input.replace('\\', "/");
    let Some(separator_index) = normalized.rfind('/') else {
        return PathInputParts {
            directory: PathBuf::new(),
            file_prefix: normalized,
            output_directory: "./".to_owned(),
        };
    };

    let directory = &normalized[..=separator_index];
    let file_prefix = normalized[separator_index + 1..].to_owned();

    PathInputParts {
        directory: PathBuf::from(directory),
        file_prefix,
        output_directory: directory.to_owned(),
    }
}

fn path_suggestion_from_entry(
    entry: AssetDirectoryEntry,
    output_directory: &str,
    file_prefix: &str,
    filter: &MarkdownPathSuggestionFilter,
) -> Option<MarkdownPathSuggestion> {
    let file_name = entry.file_name.to_string_lossy();

    if file_name.is_empty()
        || (file_prefix.len() > 0 && !file_name.to_ascii_lowercase().starts_with(file_prefix))
    {
        return None;
    }

    if entry.is_dir {
        let relative_path = format!("{}{}/", output_directory, file_name.replace('\\', "/"));
        return Some(MarkdownPathSuggestion {
            label: format!("{}/", file_name),
            insert_text: relative_path.clone(),
            relative_path,
            entry_kind: MarkdownPathSuggestionEntryKind::Directory,
        });
    }

    if !entry.is_file || !is_file_allowed(&entry.path, filter) {
        return None;
    }

    let relative_path = format!("{}{}", output_directory, file_name.replace('\\', "/"));

    Some(MarkdownPathSuggestion {
        label: file_name.into_owned(),
        insert_text: quote_path_value_if_needed(&relative_path),
        relative_path,
        entry_kind: MarkdownPathSuggestionEntryKind::File,
    })
}

fn is_file_allowed(path: &Path, filter: &MarkdownPathSuggestionFilter) -> bool {
    match filter {
        MarkdownPathSuggestionFilter::All => true,
        MarkdownPathSuggestionFilter::Extensions(extensions) => path
            .extension()
            .and_then(OsStr::to_str)
            .map(|extension| {
                let lower_extension = extension.to_ascii_lowercase();
                extensions.iter().any(|allowed| {
                    allowed
                        .trim_start_matches('.')
                        .eq_ignore_ascii_case(&lower_extension)
                })
            })
            .unwrap_or(false),
    }
}

fn quote_path_value_if_needed(value: &str) -> String {
    if !value.chars().any(char::is_whitespace) {
        return value.to_owned();
    }

    format!("\"{}\"", value.replace('"', ""))
}

fn trim_path_input_quotes(input: &str) -> &str {
    let trimmed = input.trim();
    let without_opening = trimmed
        .strip_prefix('"')
        .or_else(|| trimmed.strip_prefix('\''))
        .unwrap_or(trimmed);

    without_opening
        .strip_suffix('"')
        .or_else(|| without_opening.strip_suffix('\''))
        .unwrap_or(without_opening)
}

fn is_absolute_or_url_like_path(input: &str) -> bool {
    if input.starts_with('/') || input.starts_with('\\') || input.starts_with("//") {
        return true;
    }

    let bytes = input.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return true;
    }

    Path::new(input).is_absolute() || input.contains("://")
}

fn compare_path_suggestions(
    left: &MarkdownPathSuggestion,
    right: &MarkdownPathSuggestion,
) -> std::cmp::Ordering {
    match (&left.entry_kind, &right.entry_kind) {
        (MarkdownPathSuggestionEntryKind::Directory, MarkdownPathSuggestionEntryKind::File) => {
            return std::cmp::Ordering::Less;
        }
        (MarkdownPathSuggestionEntryKind::File, MarkdownPathSuggestionEntryKind::Directory) => {
            return std::cmp::Ordering::Greater;
        }
        _ => {}
    }

    left.label
        .to_ascii_lowercase()
        .cmp(&right.label.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::infra::FileSystemAssetRepository;

    use super::{
        list_markdown_path_suggestions, MarkdownPathSuggestionEntryKind,
        MarkdownPathSuggestionFilter,
    };

    fn create_temp_test_directory() -> PathBuf {
        let mut directory = std::env::temp_dir();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        directory.push(format!("kmark_path_suggestions_test_{now}"));
        fs::create_dir_all(&directory).expect("failed to create temp directory");
        directory
    }

    #[test]
    fn lists_image_files_and_directories_relative_to_markdown_folder() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let image_path = sandbox.join("thumb.png");
        let video_path = sandbox.join("demo.mp4");
        let directory_path = sandbox.join("assets");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(image_path, "image").expect("failed to write image");
        fs::write(video_path, "video").expect("failed to write video");
        fs::create_dir_all(directory_path).expect("failed to create directory");

        let suggestions = list_markdown_path_suggestions(
            &FileSystemAssetRepository,
            &markdown_path,
            "",
            MarkdownPathSuggestionFilter::Extensions(vec!["png".to_owned()]),
        );

        assert_eq!(suggestions.len(), 2);
        assert_eq!(suggestions[0].label, "assets/");
        assert_eq!(suggestions[0].insert_text, "./assets/");
        assert_eq!(
            suggestions[0].entry_kind,
            MarkdownPathSuggestionEntryKind::Directory
        );
        assert_eq!(suggestions[1].label, "thumb.png");
        assert_eq!(suggestions[1].insert_text, "./thumb.png");
        assert_eq!(
            suggestions[1].entry_kind,
            MarkdownPathSuggestionEntryKind::File
        );
    }

    #[test]
    fn supports_parent_relative_path_input_without_absolute_paths() {
        let sandbox = create_temp_test_directory();
        let parent_image_path = sandbox.join("parent.png");
        let child = sandbox.join("child");
        let markdown_path = child.join("note.md");
        fs::create_dir_all(&child).expect("failed to create child directory");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(parent_image_path, "image").expect("failed to write image");

        let suggestions = list_markdown_path_suggestions(
            &FileSystemAssetRepository,
            &markdown_path,
            "../pa",
            MarkdownPathSuggestionFilter::Extensions(vec!["png".to_owned()]),
        );

        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].insert_text, "../parent.png");

        let absolute_suggestions = list_markdown_path_suggestions(
            &FileSystemAssetRepository,
            &markdown_path,
            sandbox.to_string_lossy().as_ref(),
            MarkdownPathSuggestionFilter::All,
        );

        assert!(absolute_suggestions.is_empty());
    }

    #[test]
    fn quotes_file_suggestion_with_spaces() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let image_path = sandbox.join("plot chart.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(image_path, "image").expect("failed to write image");

        let suggestions = list_markdown_path_suggestions(
            &FileSystemAssetRepository,
            &markdown_path,
            "plot",
            MarkdownPathSuggestionFilter::Extensions(vec!["png".to_owned()]),
        );

        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].insert_text, "\"./plot chart.png\"");
    }
}
