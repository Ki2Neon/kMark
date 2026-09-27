use std::{
    fs::{self, File, Metadata, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use kmark_application::{
    ApplicationError, ApplicationErrorCode, DocumentFileRepository, FileFingerprint, ReadFileResult,
};
use sha2::{Digest, Sha256};

const MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Default)]
pub(crate) struct ExternalApiFileRepository;

impl DocumentFileRepository for ExternalApiFileRepository {
    fn read_utf8(&self, absolute_path: &Path) -> Result<ReadFileResult, ApplicationError> {
        let path = canonical_existing_file(absolute_path)?;
        let metadata = fs::metadata(&path).map_err(|source| io_error("read metadata", source))?;
        ensure_size(&metadata)?;
        let bytes = fs::read(&path).map_err(|source| io_error("read file", source))?;
        let content = String::from_utf8(bytes.clone()).map_err(|_| {
            ApplicationError::new(
                ApplicationErrorCode::UnsupportedEncoding,
                "Kmark supports UTF-8 Markdown files only",
            )
        })?;
        Ok(read_result(path, metadata, bytes, content)?)
    }

    fn fingerprint(&self, absolute_path: &Path) -> Result<FileFingerprint, ApplicationError> {
        let path = canonical_existing_file(absolute_path)?;
        let metadata = fs::metadata(&path).map_err(|source| io_error("read metadata", source))?;
        let mut file = File::open(&path).map_err(|source| io_error("open file", source))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|source| io_error("hash file", source))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        Ok(FileFingerprint {
            identity: file_identity(&path, &metadata)?,
            sha256: format!("{:x}", hasher.finalize()),
            byte_length: metadata.len(),
        })
    }

    fn write_utf8(
        &self,
        absolute_path: &Path,
        content: &str,
    ) -> Result<ReadFileResult, ApplicationError> {
        let path = canonical_write_path(absolute_path)?;
        if content.len() as u64 > MAX_TEXT_FILE_BYTES {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "document exceeds the 8 MiB external API limit",
            ));
        }
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .map_err(|source| io_error("open file for save", source))?;
        file.write_all(content.as_bytes())
            .map_err(|source| io_error("write file", source))?;
        file.sync_all()
            .map_err(|source| io_error("flush file", source))?;
        drop(file);
        let path = path
            .canonicalize()
            .map_err(|source| io_error("resolve saved file", source))?;
        let metadata = fs::metadata(&path).map_err(|source| io_error("read metadata", source))?;
        Ok(read_result(
            path,
            metadata,
            content.as_bytes().to_vec(),
            content.to_owned(),
        )?)
    }
}

fn canonical_existing_file(path: &Path) -> Result<PathBuf, ApplicationError> {
    if !path.is_absolute() {
        return Err(ApplicationError::new(
            ApplicationErrorCode::InvalidAbsolutePath,
            "document path must be absolute",
        ));
    }
    let path = path
        .canonicalize()
        .map_err(|source| io_error("resolve file", source))?;
    if !path.is_file() {
        return Err(ApplicationError::new(
            ApplicationErrorCode::FileNotFound,
            "requested path is not a file",
        ));
    }
    Ok(path)
}

fn canonical_write_path(path: &Path) -> Result<PathBuf, ApplicationError> {
    if !path.is_absolute() {
        return Err(ApplicationError::new(
            ApplicationErrorCode::InvalidAbsolutePath,
            "document path must be absolute",
        ));
    }
    if path.exists() {
        return canonical_existing_file(path);
    }
    let parent = path.parent().ok_or_else(|| {
        ApplicationError::new(
            ApplicationErrorCode::InvalidAbsolutePath,
            "document path has no parent directory",
        )
    })?;
    let parent = parent
        .canonicalize()
        .map_err(|source| io_error("resolve save directory", source))?;
    if !parent.is_dir() {
        return Err(ApplicationError::new(
            ApplicationErrorCode::FileNotFound,
            "save directory does not exist",
        ));
    }
    let name = path.file_name().ok_or_else(|| {
        ApplicationError::new(
            ApplicationErrorCode::InvalidAbsolutePath,
            "document path has no file name",
        )
    })?;
    Ok(parent.join(name))
}

fn ensure_size(metadata: &Metadata) -> Result<(), ApplicationError> {
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        Err(ApplicationError::new(
            ApplicationErrorCode::InvalidState,
            "document exceeds the 8 MiB external API limit",
        ))
    } else {
        Ok(())
    }
}

fn read_result(
    path: PathBuf,
    metadata: Metadata,
    bytes: Vec<u8>,
    content: String,
) -> Result<ReadFileResult, ApplicationError> {
    Ok(ReadFileResult {
        absolute_path: path.clone(),
        content,
        modified_at_epoch_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64),
        fingerprint: fingerprint_from_bytes(&path, &metadata, &bytes)?,
    })
}

fn fingerprint_from_bytes(
    path: &Path,
    metadata: &Metadata,
    bytes: &[u8],
) -> Result<FileFingerprint, ApplicationError> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(FileFingerprint {
        identity: file_identity(path, metadata)?,
        sha256: format!("{:x}", hasher.finalize()),
        byte_length: metadata.len(),
    })
}

#[cfg(windows)]
fn file_identity(path: &Path, _metadata: &Metadata) -> Result<String, ApplicationError> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::{
        Foundation::HANDLE,
        Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION},
    };

    let file = File::open(path).map_err(|source| io_error("open file identity", source))?;
    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    let handle = HANDLE(file.as_raw_handle());
    unsafe { GetFileInformationByHandle(handle, &mut information) }.map_err(|source| {
        ApplicationError::new(
            ApplicationErrorCode::IoFailed,
            format!("failed to read file identity: {source}"),
        )
    })?;
    let file_index =
        (u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow);
    Ok(format!(
        "windows:{:08x}:{file_index:016x}",
        information.dwVolumeSerialNumber
    ))
}

#[cfg(unix)]
fn file_identity(_path: &Path, metadata: &Metadata) -> Result<String, ApplicationError> {
    use std::os::unix::fs::MetadataExt;
    Ok(format!(
        "unix:{:016x}:{:016x}",
        metadata.dev(),
        metadata.ino()
    ))
}

#[cfg(not(any(windows, unix)))]
fn file_identity(path: &Path, metadata: &Metadata) -> Result<String, ApplicationError> {
    let created = metadata
        .created()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(format!("portable:{}:{created}", path.to_string_lossy()))
}

fn io_error(operation: &str, source: io::Error) -> ApplicationError {
    let code = if source.kind() == io::ErrorKind::NotFound {
        ApplicationErrorCode::FileNotFound
    } else {
        ApplicationErrorCode::IoFailed
    };
    ApplicationError::new(code, format!("failed to {operation}: {source}"))
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use kmark_application::{
        ApplicationErrorCode, ApplicationService, DocumentFileRepository, NoopApplicationEventSink,
    };

    use super::ExternalApiFileRepository;

    #[test]
    fn open_and_save_revalidate_disk_fingerprint() {
        let directory =
            std::env::temp_dir().join(format!("kmark-file-port-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("note.md");
        fs::write(&path, "alpha").unwrap();
        let repository = Arc::new(ExternalApiFileRepository);
        let service = ApplicationService::new(
            "instance",
            repository.clone(),
            Arc::new(NoopApplicationEventSink),
        );
        let session = service.open_session(&path).unwrap();
        fs::write(&path, "external change").unwrap();
        let error = service
            .save_session(&session.session_id, session.revision, None)
            .unwrap_err();
        assert_eq!(error.code(), ApplicationErrorCode::DiskFileChanged);
        assert_eq!(
            repository.read_utf8(&path).unwrap().content,
            "external change"
        );
        let _ = fs::remove_file(path);
        let _ = fs::remove_dir(directory);
    }
}
