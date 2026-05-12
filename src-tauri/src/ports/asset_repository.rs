use std::{io, path::Path};

pub trait AssetRepository: Send + Sync {
    fn canonicalize(&self, path: &Path) -> io::Result<std::path::PathBuf>;
    fn copy_new_file(&self, source: &Path, destination: &Path) -> io::Result<()>;
    fn exists(&self, path: &Path) -> bool;
    fn is_dir(&self, path: &Path) -> bool;
    fn is_file(&self, path: &Path) -> bool;
}
