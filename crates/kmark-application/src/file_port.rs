use std::path::{Path, PathBuf};

use crate::ApplicationError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RegisteredRoot {
    pub id: String,
    pub label: String,
    pub path: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileFingerprint {
    pub identity: String,
    pub sha256: String,
    pub byte_length: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadFileResult {
    pub absolute_path: PathBuf,
    pub relative_path: String,
    pub content: String,
    pub modified_at_epoch_ms: Option<u64>,
    pub fingerprint: FileFingerprint,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub relative_path: String,
    pub is_directory: bool,
    pub byte_length: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchMatch {
    pub relative_path: String,
    pub line: u32,
    pub text: String,
}

pub trait DocumentFileRepository: Send + Sync {
    fn read_utf8(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<ReadFileResult, ApplicationError>;

    fn list_entries(
        &self,
        root: &RegisteredRoot,
        relative_directory: &str,
        limit: usize,
    ) -> Result<Vec<FileEntry>, ApplicationError>;

    fn search_utf8(
        &self,
        root: &RegisteredRoot,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchMatch>, ApplicationError>;

    fn fingerprint(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<FileFingerprint, ApplicationError>;

    fn rename(
        &self,
        root: &RegisteredRoot,
        source_relative_path: &str,
        target_relative_path: &str,
    ) -> Result<ReadFileResult, ApplicationError>;

    fn move_to_trash(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<(), ApplicationError>;

    fn resolve_registered_path(
        &self,
        roots: &[RegisteredRoot],
        absolute_path: &Path,
    ) -> Option<(String, String)>;
}
