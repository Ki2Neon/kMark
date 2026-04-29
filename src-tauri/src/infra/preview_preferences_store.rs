use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager, Runtime};

use crate::domain::PreviewPreferences;

const PREFERENCES_DIRECTORY_NAME: &str = "preferences";
const PREVIEW_PREFERENCES_FILE_NAME: &str = "preview.json";

#[derive(Debug, thiserror::Error)]
pub enum PreviewPreferencesStoreError {
    #[error("failed to resolve app config directory")]
    ResolveAppConfigDir {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to create preview preferences directory: {path}")]
    CreateDirectory {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to read preview preferences file: {path}")]
    ReadPreferences {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to write preview preferences file: {path}")]
    WritePreferences {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to deserialize preview preferences file: {path}")]
    DeserializePreferences {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to serialize preview preferences")]
    SerializePreferences {
        #[source]
        source: serde_json::Error,
    },
}

pub fn load_preview_preferences<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<PreviewPreferences>, PreviewPreferencesStoreError> {
    let path = preview_preferences_path(app)?;
    let payload = match fs::read(&path) {
        Ok(payload) => payload,
        Err(source) if source.kind() == ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(PreviewPreferencesStoreError::ReadPreferences {
                path: display_path(&path),
                source,
            });
        }
    };

    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(
            |source| PreviewPreferencesStoreError::DeserializePreferences {
                path: display_path(&path),
                source,
            },
        )
}

pub fn persist_preview_preferences<R: Runtime>(
    app: &AppHandle<R>,
    preview_preferences: &PreviewPreferences,
) -> Result<(), PreviewPreferencesStoreError> {
    let path = preview_preferences_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| {
            PreviewPreferencesStoreError::CreateDirectory {
                path: display_path(parent),
                source,
            }
        })?;
    }

    let payload = serde_json::to_vec(preview_preferences)
        .map_err(|source| PreviewPreferencesStoreError::SerializePreferences { source })?;

    fs::write(&path, payload).map_err(|source| PreviewPreferencesStoreError::WritePreferences {
        path: display_path(&path),
        source,
    })
}

fn preview_preferences_path<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<PathBuf, PreviewPreferencesStoreError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|source| PreviewPreferencesStoreError::ResolveAppConfigDir { source })?;

    path.push(PREFERENCES_DIRECTORY_NAME);
    path.push(PREVIEW_PREFERENCES_FILE_NAME);

    Ok(path)
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
