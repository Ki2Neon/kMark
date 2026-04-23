use std::{
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
    time::Duration,
};

use fs2::FileExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const TRAY_COORDINATOR_DIRECTORY_NAME: &str = "tray-coordinator";
const TRAY_OWNER_LOCK_FILE_NAME: &str = "owner.lock";
const TRAY_COMMAND_FILE_NAME: &str = "command.json";
const TRAY_COMMAND_TEMP_FILE_NAME: &str = "command.json.tmp";

pub(crate) const TRAY_COORDINATOR_POLL_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug)]
pub(crate) struct TrayCoordinator {
    owner_lock: Option<File>,
    last_command_sequence: u64,
    tray_registered: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TrayCommandKind {
    ShowAll,
    QuitAll,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredTrayCommand {
    sequence: u64,
    kind: TrayCommandKind,
}

#[derive(Debug, thiserror::Error)]
pub enum TrayCoordinatorError {
    #[error("failed to resolve app config directory")]
    ResolveAppConfigDir { #[source] source: tauri::Error },
    #[error("failed to create tray coordinator directory: {path}")]
    CreateDirectory {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to open tray owner lock file: {path}")]
    OpenOwnerLockFile {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to lock tray owner file: {path}")]
    LockOwnerFile {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to read tray command file: {path}")]
    ReadCommandFile {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to deserialize tray command file: {path}")]
    DeserializeCommandFile {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to serialize tray command")]
    SerializeCommand { #[source] source: serde_json::Error },
    #[error("failed to write tray command file: {path}")]
    WriteCommandFile {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to replace tray command file: {path}")]
    ReplaceCommandFile {
        path: String,
        #[source]
        source: io::Error,
    },
}

impl TrayCoordinator {
    pub(crate) fn initialize<R: Runtime>(
        app: &AppHandle<R>,
    ) -> Result<Self, TrayCoordinatorError> {
        let last_command_sequence = read_command(app)?.map(|command| command.sequence).unwrap_or(0);

        Ok(Self {
            owner_lock: None,
            last_command_sequence,
            tray_registered: false,
        })
    }

    pub(crate) fn try_claim_ownership<R: Runtime>(
        &mut self,
        app: &AppHandle<R>,
    ) -> Result<bool, TrayCoordinatorError> {
        if self.owner_lock.is_some() {
            return Ok(false);
        }

        let path = owner_lock_path(app)?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| TrayCoordinatorError::CreateDirectory {
                path: display_path(parent),
                source,
            })?;
        }

        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&path)
            .map_err(|source| TrayCoordinatorError::OpenOwnerLockFile {
                path: display_path(&path),
                source,
            })?;

        match file.try_lock_exclusive() {
            Ok(()) => {
                self.owner_lock = Some(file);
                Ok(true)
            }
            Err(source) if is_lock_contended(&source) => Ok(false),
            Err(source) => Err(TrayCoordinatorError::LockOwnerFile {
                path: display_path(&path),
                source,
            }),
        }
    }

    pub(crate) fn needs_tray_registration(&self) -> bool {
        self.owner_lock.is_some() && !self.tray_registered
    }

    pub(crate) fn mark_tray_registered(&mut self) {
        self.tray_registered = true;
    }

    pub(crate) fn take_pending_command<R: Runtime>(
        &mut self,
        app: &AppHandle<R>,
    ) -> Result<Option<TrayCommandKind>, TrayCoordinatorError> {
        let Some(command) = read_command(app)? else {
            return Ok(None);
        };

        if command.sequence <= self.last_command_sequence {
            return Ok(None);
        }

        self.last_command_sequence = command.sequence;

        Ok(Some(command.kind))
    }
}

pub(crate) fn broadcast_command<R: Runtime>(
    app: &AppHandle<R>,
    kind: TrayCommandKind,
) -> Result<(), TrayCoordinatorError> {
    let path = command_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| TrayCoordinatorError::CreateDirectory {
            path: display_path(parent),
            source,
        })?;
    }

    let next_sequence = read_command(app)?.map(|command| command.sequence + 1).unwrap_or(1);
    let payload = serde_json::to_vec(&StoredTrayCommand {
        sequence: next_sequence,
        kind,
    })
    .map_err(|source| TrayCoordinatorError::SerializeCommand { source })?;

    let temp_path = temporary_command_path(app)?;

    fs::write(&temp_path, payload).map_err(|source| TrayCoordinatorError::WriteCommandFile {
        path: display_path(&temp_path),
        source,
    })?;

    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(source) if source.kind() == io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(TrayCoordinatorError::ReplaceCommandFile {
                path: display_path(&path),
                source,
            });
        }
    }

    fs::rename(&temp_path, &path).map_err(|source| TrayCoordinatorError::ReplaceCommandFile {
        path: display_path(&path),
        source,
    })?;

    Ok(())
}

fn read_command<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<StoredTrayCommand>, TrayCoordinatorError> {
    let path = command_path(app)?;
    let payload = match fs::read(&path) {
        Ok(payload) => payload,
        Err(source) if source.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(TrayCoordinatorError::ReadCommandFile {
                path: display_path(&path),
                source,
            });
        }
    };

    if payload.is_empty() {
        return Ok(None);
    }

    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(|source| TrayCoordinatorError::DeserializeCommandFile {
            path: display_path(&path),
            source,
        })
}

fn owner_lock_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TrayCoordinatorError> {
    let mut path = base_directory(app)?;
    path.push(TRAY_OWNER_LOCK_FILE_NAME);
    Ok(path)
}

fn command_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TrayCoordinatorError> {
    let mut path = base_directory(app)?;
    path.push(TRAY_COMMAND_FILE_NAME);
    Ok(path)
}

fn temporary_command_path<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<PathBuf, TrayCoordinatorError> {
    let mut path = base_directory(app)?;
    path.push(TRAY_COMMAND_TEMP_FILE_NAME);
    Ok(path)
}

fn base_directory<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, TrayCoordinatorError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|source| TrayCoordinatorError::ResolveAppConfigDir { source })?;

    path.push(TRAY_COORDINATOR_DIRECTORY_NAME);

    Ok(path)
}

fn is_lock_contended(source: &io::Error) -> bool {
    let lock_error = fs2::lock_contended_error();

    source.kind() == lock_error.kind() || source.raw_os_error() == lock_error.raw_os_error()
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}