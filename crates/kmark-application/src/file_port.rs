use std::path::{Path, PathBuf};

use crate::ApplicationError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileFingerprint {
    pub identity: String,
    pub sha256: String,
    pub byte_length: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadFileResult {
    pub absolute_path: PathBuf,
    pub content: String,
    pub modified_at_epoch_ms: Option<u64>,
    pub fingerprint: FileFingerprint,
}

/// Filesystem boundary used only by Kmark document open/save use cases.
pub trait DocumentFileRepository: Send + Sync {
    fn read_utf8(&self, absolute_path: &Path) -> Result<ReadFileResult, ApplicationError>;

    fn fingerprint(&self, absolute_path: &Path) -> Result<FileFingerprint, ApplicationError>;

    fn write_utf8(
        &self,
        absolute_path: &Path,
        content: &str,
    ) -> Result<ReadFileResult, ApplicationError>;
}
