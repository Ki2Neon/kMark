use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use crate::ports::AssetRepository;

#[derive(Default)]
pub struct FileSystemAssetRepository;

impl AssetRepository for FileSystemAssetRepository {
    fn canonicalize(&self, path: &Path) -> io::Result<PathBuf> {
        fs::canonicalize(path)
    }

    fn copy_new_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        let mut source_file = File::open(source)?;
        let mut destination_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        let result = copy_stream(&mut source_file, &mut destination_file);
        drop(destination_file);

        if result.is_err() {
            let _ = fs::remove_file(destination);
        }

        result
    }

    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }
}

fn copy_stream(source: &mut File, destination: &mut File) -> io::Result<()> {
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = source.read(&mut buffer)?;

        if read == 0 {
            return Ok(());
        }

        destination.write_all(&buffer[..read])?;
    }
}
