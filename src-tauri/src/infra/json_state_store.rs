use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const STATE_DIRECTORY_NAME: &str = "state";

#[derive(Debug, thiserror::Error)]
pub enum JsonStateStoreError {
    #[error("failed to resolve {scope} app config directory")]
    ResolveAppConfigDir {
        scope: &'static str,
        #[source]
        source: tauri::Error,
    },
    #[error("failed to create {scope} state directory: {path}")]
    CreateDirectory {
        scope: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to read {scope} state file: {path}")]
    ReadState {
        scope: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to write {scope} state file: {path}")]
    WriteState {
        scope: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to deserialize {scope} state file: {path}")]
    DeserializeState {
        scope: &'static str,
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to serialize {scope} state")]
    SerializeState {
        scope: &'static str,
        #[source]
        source: serde_json::Error,
    },
}

pub fn load_json_state<R: Runtime, T: DeserializeOwned>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
) -> Result<Option<T>, JsonStateStoreError> {
    let path = json_state_path(app, scope, file_name)?;
    let payload = match fs::read(&path) {
        Ok(payload) => payload,
        Err(source) if source.kind() == ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(JsonStateStoreError::ReadState {
                scope,
                path: display_path(&path),
                source,
            });
        }
    };

    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(|source| JsonStateStoreError::DeserializeState {
            scope,
            path: display_path(&path),
            source,
        })
}

pub fn persist_json_state<R: Runtime, T: Serialize>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
    value: &T,
) -> Result<(), JsonStateStoreError> {
    let path = json_state_path(app, scope, file_name)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| JsonStateStoreError::CreateDirectory {
            scope,
            path: display_path(parent),
            source,
        })?;
    }

    let payload = serde_json::to_vec(value)
        .map_err(|source| JsonStateStoreError::SerializeState { scope, source })?;

    fs::write(&path, payload).map_err(|source| JsonStateStoreError::WriteState {
        scope,
        path: display_path(&path),
        source,
    })
}

fn json_state_path<R: Runtime>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
) -> Result<PathBuf, JsonStateStoreError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|source| JsonStateStoreError::ResolveAppConfigDir { scope, source })?;
    path.push(STATE_DIRECTORY_NAME);
    path.push(file_name);
    Ok(path)
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
