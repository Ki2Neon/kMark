use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use crate::ports::{AssetDirectoryEntry, AssetRepository};

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

    fn has_same_file_content(&self, left: &Path, right: &Path) -> io::Result<bool> {
        if fs::metadata(left)?.len() != fs::metadata(right)?.len() {
            return Ok(false);
        }

        let mut left_file = File::open(left)?;
        let mut right_file = File::open(right)?;

        has_same_stream_content(&mut left_file, &mut right_file)
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

    fn read_dir(&self, path: &Path) -> io::Result<Vec<AssetDirectoryEntry>> {
        let mut entries = Vec::new();

        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let file_type = entry.file_type()?;

            entries.push(AssetDirectoryEntry {
                file_name: entry.file_name(),
                is_dir: file_type.is_dir(),
                is_file: file_type.is_file(),
                path: entry.path(),
            });
        }

        Ok(entries)
    }
}

fn has_same_stream_content(left: &mut File, right: &mut File) -> io::Result<bool> {
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];

    loop {
        let left_read = left.read(&mut left_buffer)?;
        let right_read = right.read(&mut right_buffer)?;

        if left_read != right_read {
            return Ok(false);
        }

        if left_read == 0 {
            return Ok(true);
        }

        if left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
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
