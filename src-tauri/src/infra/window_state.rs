use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalSize, Runtime, WebviewWindow, Window};

const WINDOW_STATE_DIRECTORY_NAME: &str = "window-state";
const WINDOW_STATE_FILE_EXTENSION: &str = "json";

#[derive(Debug, Serialize, Deserialize)]
struct StoredWindowState {
    width: u32,
    height: u32,
    maximized: bool,
}

impl StoredWindowState {
    fn has_valid_size(&self) -> bool {
        self.width > 0 && self.height > 0
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WindowStateError {
    #[error("failed to resolve app config directory")]
    ResolveAppConfigDir {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to create window state directory: {path}")]
    CreateDirectory {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to read window state file: {path}")]
    ReadState {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to write window state file: {path}")]
    WriteState {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to deserialize window state file: {path}")]
    DeserializeState {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to serialize window state")]
    SerializeState {
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to query window size")]
    QueryWindowSize {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to query window maximize state")]
    QueryWindowMaximized {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to restore window size")]
    RestoreWindowSize {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to restore window maximized state")]
    RestoreWindowMaximized {
        #[source]
        source: tauri::Error,
    },
}

pub fn restore_window_state<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<(), WindowStateError> {
    let Some(window_state) = load_window_state(app, window.label())? else {
        return Ok(());
    };

    if window_state.has_valid_size() {
        window
            .set_size(PhysicalSize::new(window_state.width, window_state.height))
            .map_err(|source| WindowStateError::RestoreWindowSize { source })?;
    }

    if window_state.maximized {
        window
            .maximize()
            .map_err(|source| WindowStateError::RestoreWindowMaximized { source })?;
    }

    Ok(())
}

pub fn persist_window_state<R: Runtime>(
    app: &AppHandle<R>,
    window: &Window<R>,
) -> Result<(), WindowStateError> {
    let is_maximized = window
        .is_maximized()
        .map_err(|source| WindowStateError::QueryWindowMaximized { source })?;

    let path = window_state_path(app, window.label())?;
    let window_state = if is_maximized {
        load_window_state_from_path(&path)?.unwrap_or_else(|| {
            let fallback_size = window
                .inner_size()
                .unwrap_or_else(|_| PhysicalSize::new(0, 0));

            StoredWindowState {
                width: fallback_size.width,
                height: fallback_size.height,
                maximized: true,
            }
        })
    } else {
        let size = window
            .inner_size()
            .map_err(|source| WindowStateError::QueryWindowSize { source })?;

        StoredWindowState {
            width: size.width,
            height: size.height,
            maximized: false,
        }
    };

    write_window_state(
        &path,
        &StoredWindowState {
            maximized: is_maximized,
            ..window_state
        },
    )
}

fn load_window_state<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
) -> Result<Option<StoredWindowState>, WindowStateError> {
    let path = window_state_path(app, window_label)?;

    load_window_state_from_path(&path)
}

fn load_window_state_from_path(path: &Path) -> Result<Option<StoredWindowState>, WindowStateError> {
    let payload = match fs::read(path) {
        Ok(payload) => payload,
        Err(source) if source.kind() == ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(WindowStateError::ReadState {
                path: display_path(path),
                source,
            });
        }
    };

    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(|source| WindowStateError::DeserializeState {
            path: display_path(path),
            source,
        })
}

fn write_window_state(
    path: &Path,
    window_state: &StoredWindowState,
) -> Result<(), WindowStateError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| WindowStateError::CreateDirectory {
            path: display_path(parent),
            source,
        })?;
    }

    let payload = serde_json::to_vec(window_state)
        .map_err(|source| WindowStateError::SerializeState { source })?;

    fs::write(path, payload).map_err(|source| WindowStateError::WriteState {
        path: display_path(path),
        source,
    })
}

fn window_state_path<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
) -> Result<PathBuf, WindowStateError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|source| WindowStateError::ResolveAppConfigDir { source })?;

    path.push(WINDOW_STATE_DIRECTORY_NAME);
    path.push(format!("{window_label}.{WINDOW_STATE_FILE_EXTENSION}"));

    Ok(path)
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
