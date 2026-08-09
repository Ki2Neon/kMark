use std::{
    collections::VecDeque,
    fs::{self, File, Metadata},
    io::{self, Read},
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use kmark_application::{
    ApplicationError, ApplicationErrorCode, DocumentFileRepository, FileEntry, FileFingerprint,
    ReadFileResult, RegisteredRoot, SearchMatch,
};
use sha2::{Digest, Sha256};

const MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SEARCH_FILE_BYTES: u64 = 1024 * 1024;
const MAX_SEARCHED_FILES: usize = 10_000;

#[derive(Default)]
pub(crate) struct ExternalApiFileRepository;

impl DocumentFileRepository for ExternalApiFileRepository {
    fn read_utf8(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<ReadFileResult, ApplicationError> {
        let (root_path, file_path) = resolve_existing_path(root, relative_path)?;
        let metadata =
            fs::metadata(&file_path).map_err(|source| io_error("read metadata", source))?;
        if !metadata.is_file() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "requested path is not a file",
            ));
        }
        if metadata.len() > MAX_TEXT_FILE_BYTES {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "text file exceeds the 8 MiB external API limit",
            ));
        }
        let bytes = fs::read(&file_path).map_err(|source| io_error("read file", source))?;
        let content = String::from_utf8(bytes.clone()).map_err(|_| {
            ApplicationError::new(
                ApplicationErrorCode::UnsupportedEncoding,
                "external API supports UTF-8 text files only",
            )
        })?;
        Ok(ReadFileResult {
            absolute_path: file_path.clone(),
            relative_path: normalize_relative_display(
                file_path.strip_prefix(&root_path).unwrap_or(&file_path),
            ),
            content,
            modified_at_epoch_ms: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64),
            fingerprint: fingerprint_from_bytes(&file_path, &metadata, &bytes)?,
        })
    }

    fn list_entries(
        &self,
        root: &RegisteredRoot,
        relative_directory: &str,
        limit: usize,
    ) -> Result<Vec<FileEntry>, ApplicationError> {
        let (root_path, directory_path) = if relative_directory.trim().is_empty() {
            let root_path = canonical_root(root)?;
            (root_path.clone(), root_path)
        } else {
            resolve_existing_path(root, relative_directory)?
        };
        if !directory_path.is_dir() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "requested path is not a directory",
            ));
        }
        let mut entries = fs::read_dir(&directory_path)
            .map_err(|source| io_error("list directory", source))?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path).ok()?;
                if metadata.file_type().is_symlink() {
                    return None;
                }
                let canonical = path.canonicalize().ok()?;
                if !canonical.starts_with(&root_path) {
                    return None;
                }
                Some(FileEntry {
                    relative_path: normalize_relative_display(
                        canonical.strip_prefix(&root_path).ok()?,
                    ),
                    is_directory: metadata.is_dir(),
                    byte_length: metadata.is_file().then_some(metadata.len()),
                })
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            right
                .is_directory
                .cmp(&left.is_directory)
                .then_with(|| left.relative_path.cmp(&right.relative_path))
        });
        entries.truncate(limit);
        Ok(entries)
    }

    fn search_utf8(
        &self,
        root: &RegisteredRoot,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchMatch>, ApplicationError> {
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let root_path = canonical_root(root)?;
        let mut queue = VecDeque::from([root_path.clone()]);
        let mut searched_files = 0usize;
        let mut matches = Vec::new();
        while let Some(directory) = queue.pop_front() {
            for entry in fs::read_dir(&directory)
                .map_err(|source| io_error("search directory", source))?
                .filter_map(Result::ok)
            {
                let path = entry.path();
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(metadata) => metadata,
                    Err(_) => continue,
                };
                if metadata.file_type().is_symlink() {
                    continue;
                }
                if metadata.is_dir() {
                    let canonical = match path.canonicalize() {
                        Ok(path) if path.starts_with(&root_path) => path,
                        _ => continue,
                    };
                    queue.push_back(canonical);
                    continue;
                }
                if !metadata.is_file() || metadata.len() > MAX_SEARCH_FILE_BYTES {
                    continue;
                }
                searched_files += 1;
                if searched_files > MAX_SEARCHED_FILES {
                    return Ok(matches);
                }
                let bytes = match fs::read(&path) {
                    Ok(bytes) => bytes,
                    Err(_) => continue,
                };
                let Ok(content) = String::from_utf8(bytes) else {
                    continue;
                };
                let relative_path = path
                    .canonicalize()
                    .ok()
                    .and_then(|canonical| {
                        canonical
                            .strip_prefix(&root_path)
                            .ok()
                            .map(normalize_relative_display)
                    })
                    .unwrap_or_else(|| normalize_relative_display(&path));
                for (line_index, line) in content.lines().enumerate() {
                    if line.contains(query) {
                        matches.push(SearchMatch {
                            relative_path: relative_path.clone(),
                            line: (line_index + 1).min(u32::MAX as usize) as u32,
                            text: line.to_owned(),
                        });
                        if matches.len() >= limit {
                            return Ok(matches);
                        }
                    }
                }
            }
        }
        Ok(matches)
    }

    fn fingerprint(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<FileFingerprint, ApplicationError> {
        let (_, path) = resolve_existing_path(root, relative_path)?;
        let metadata = fs::metadata(&path).map_err(|source| io_error("read metadata", source))?;
        if !metadata.is_file() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "requested path is not a file",
            ));
        }
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

    fn rename(
        &self,
        root: &RegisteredRoot,
        source_relative_path: &str,
        target_relative_path: &str,
    ) -> Result<ReadFileResult, ApplicationError> {
        let (_, source) = resolve_existing_path(root, source_relative_path)?;
        let target = resolve_new_path(root, target_relative_path)?;
        if target.exists() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::FileAlreadyExists,
                "rename target already exists",
            ));
        }
        fs::rename(&source, &target).map_err(|source| io_error("rename file", source))?;
        self.read_utf8(root, target_relative_path)
    }

    fn move_to_trash(
        &self,
        root: &RegisteredRoot,
        relative_path: &str,
    ) -> Result<(), ApplicationError> {
        let (_, path) = resolve_existing_path(root, relative_path)?;
        trash::delete(&path).map_err(|source| {
            ApplicationError::new(
                ApplicationErrorCode::IoFailed,
                format!("failed to move file to trash: {source}"),
            )
        })
    }

    fn resolve_registered_path(
        &self,
        roots: &[RegisteredRoot],
        absolute_path: &Path,
    ) -> Option<(String, String)> {
        let canonical = absolute_path.canonicalize().ok()?;
        roots.iter().find_map(|root| {
            let root_path = canonical_root(root).ok()?;
            let relative = canonical.strip_prefix(&root_path).ok()?;
            Some((root.id.clone(), normalize_relative_display(relative)))
        })
    }
}

fn canonical_root(root: &RegisteredRoot) -> Result<PathBuf, ApplicationError> {
    root.path
        .canonicalize()
        .map_err(|source| io_error("resolve registered root", source))
}

fn validate_relative_path(
    relative_path: &str,
    allow_empty: bool,
) -> Result<PathBuf, ApplicationError> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return if allow_empty {
            Ok(PathBuf::new())
        } else {
            Err(invalid_relative_path())
        };
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        return Err(invalid_relative_path());
    }
    for component in path.components() {
        let Component::Normal(value) = component else {
            return Err(invalid_relative_path());
        };
        let value = value.to_string_lossy();
        if value.is_empty()
            || value.contains(':')
            || value.contains('\0')
            || value == "."
            || value == ".."
        {
            return Err(invalid_relative_path());
        }
    }
    Ok(path)
}

fn resolve_existing_path(
    root: &RegisteredRoot,
    relative_path: &str,
) -> Result<(PathBuf, PathBuf), ApplicationError> {
    let root_path = canonical_root(root)?;
    let relative = validate_relative_path(relative_path, false)?;
    let canonical = root_path.join(relative).canonicalize().map_err(|source| {
        if source.kind() == io::ErrorKind::NotFound {
            ApplicationError::new(ApplicationErrorCode::FileNotFound, "file not found")
        } else {
            io_error("resolve file", source)
        }
    })?;
    if !canonical.starts_with(&root_path) {
        return Err(invalid_relative_path());
    }
    Ok((root_path, canonical))
}

fn resolve_new_path(
    root: &RegisteredRoot,
    relative_path: &str,
) -> Result<PathBuf, ApplicationError> {
    let root_path = canonical_root(root)?;
    let relative = validate_relative_path(relative_path, false)?;
    let target = root_path.join(relative);
    let parent = target.parent().ok_or_else(invalid_relative_path)?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|source| io_error("resolve target directory", source))?;
    if !canonical_parent.starts_with(&root_path) {
        return Err(invalid_relative_path());
    }
    Ok(canonical_parent.join(target.file_name().ok_or_else(invalid_relative_path)?))
}

fn normalize_relative_display(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
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

fn invalid_relative_path() -> ApplicationError {
    ApplicationError::new(
        ApplicationErrorCode::InvalidRelativePath,
        "path must remain inside the registered root",
    )
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
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use std::sync::Arc;

    use kmark_application::{
        ApplicationErrorCode, ApplicationService, DocumentFileRepository, NoopApplicationEventSink,
        RegisteredRoot, SessionProposalInput,
    };

    use super::ExternalApiFileRepository;

    fn test_root() -> RegisteredRoot {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("kmark-external-api-{suffix}"));
        fs::create_dir_all(&path).expect("create root");
        RegisteredRoot {
            id: "root".to_owned(),
            label: "Root".to_owned(),
            path,
        }
    }

    #[test]
    fn reads_utf8_and_rejects_parent_and_ads_paths() {
        let root = test_root();
        fs::write(root.path.join("note.md"), "あいう").expect("write");
        let repository = ExternalApiFileRepository;

        let file = repository.read_utf8(&root, "note.md").expect("read");
        assert_eq!(file.content, "あいう");
        assert!(repository.read_utf8(&root, "../outside.md").is_err());
        assert!(repository.read_utf8(&root, "note.md:stream").is_err());
    }

    #[test]
    fn rejects_rename_commit_when_source_changed_after_staging() {
        assert_changed_source_rejected(SessionProposalInput::RenameDocument {
            expected_revision: 1,
            target_relative_path: "renamed.md".to_owned(),
        });
    }

    #[test]
    fn rejects_delete_commit_when_source_changed_after_staging() {
        assert_changed_source_rejected(SessionProposalInput::DeleteDocument {
            expected_revision: 1,
        });
    }

    fn assert_changed_source_rejected(proposal: SessionProposalInput) {
        let root = test_root();
        let source = root.path.join("note.md");
        fs::write(&source, "original").expect("write source");
        let repository = Arc::new(ExternalApiFileRepository);
        let service =
            ApplicationService::new("instance", repository, Arc::new(NoopApplicationEventSink));
        service.replace_roots(vec![root.clone()]);
        let session = service.open_session(&root.id, "note.md").expect("open");
        let proposal = service
            .create_session_proposal(&session.session_id, proposal)
            .expect("propose");
        service
            .accept_session_proposal(&proposal.id)
            .expect("stage");
        fs::write(&source, "changed after staging").expect("mutate source");

        let error = service
            .commit_staged_file_operation(&session.session_id)
            .expect_err("changed source must reject commit");

        assert_eq!(error.code(), ApplicationErrorCode::DiskFileChanged);
        assert_eq!(
            fs::read_to_string(source).expect("read source"),
            "changed after staging"
        );
        assert!(!root.path.join("renamed.md").exists());
    }
}
