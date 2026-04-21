use std::{ffi::OsString, path::{Path, PathBuf}};

use crate::domain::is_supported_markdown_path;

pub fn collect_markdown_file_paths<I, T>(args: I, current_dir: &Path) -> Vec<PathBuf>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|value| normalize_candidate_path(value.into(), current_dir))
        .filter(|path| path.is_file() && is_supported_markdown_path(path))
        .collect()
}

fn normalize_candidate_path(value: OsString, current_dir: &Path) -> Option<PathBuf> {
    if value.is_empty() {
        return None;
    }

    let candidate_path = PathBuf::from(value);

    if candidate_path.is_absolute() {
        return Some(candidate_path);
    }

    Some(current_dir.join(candidate_path))
}