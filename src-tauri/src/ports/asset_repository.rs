use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetDirectoryEntry {
    pub file_name: OsString,
    pub is_dir: bool,
    pub is_file: bool,
    pub path: PathBuf,
}

pub trait AssetRepository: Send + Sync {
    fn canonicalize(&self, path: &Path) -> io::Result<std::path::PathBuf>;
    fn copy_new_file(&self, source: &Path, destination: &Path) -> io::Result<()>;
    fn has_same_file_content(&self, left: &Path, right: &Path) -> io::Result<bool>;
    fn write_new_file(&self, destination: &Path, bytes: &[u8]) -> io::Result<()>;
    fn exists(&self, path: &Path) -> bool;
    fn is_dir(&self, path: &Path) -> bool;
    fn is_file(&self, path: &Path) -> bool;
    fn read_dir(&self, path: &Path) -> io::Result<Vec<AssetDirectoryEntry>>;
}
