use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use fs2::FileExt;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::dto::{
    SubWindowResolvedSourceStatePayload, SubWindowSelectionPayload,
    SubWindowSourceLineSelectionRequestPayload, SubWindowSourceSummaryPayload,
    SubWindowSourcesSnapshotPayload, SubWindowStatePayload,
};

const REGISTRY_DIRECTORY_NAME: &str = "subwindow-registry";
const SOURCES_DIRECTORY_NAME: &str = "sources";
const REQUESTS_DIRECTORY_NAME: &str = "line-selection-requests";
const REGISTRY_LOCK_FILE_NAME: &str = "registry.lock";
const ACTIVE_SOURCE_FILE_NAME: &str = "active-source.json";
const JSON_EXTENSION: &str = "json";
const TEMP_EXTENSION: &str = "tmp";
const SOURCE_STALE_AFTER_MS: u64 = 5_000;
const MAX_PENDING_LINE_SELECTION_REQUESTS: usize = 32;

pub(crate) const SUB_WINDOW_REGISTRY_HEARTBEAT_INTERVAL: Duration = Duration::from_millis(1_000);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSubWindowSource {
    source_id: String,
    process_id: String,
    window_label: String,
    heartbeat_at_epoch_ms: u64,
    state: SubWindowStatePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredActiveSubWindowSource {
    source_id: Option<String>,
    updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredLineSelectionRequests {
    requests: Vec<SubWindowSourceLineSelectionRequestPayload>,
}

#[derive(Debug, thiserror::Error)]
pub enum SubWindowRegistryError {
    #[error("failed to resolve subwindow registry app config directory")]
    ResolveAppConfigDir {
        #[source]
        source: tauri::Error,
    },
    #[error("failed to {operation} subwindow registry path: {path}")]
    Io {
        operation: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to serialize subwindow registry payload")]
    Serialize {
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to deserialize subwindow registry file: {path}")]
    Deserialize {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("subwindow source not found: {source_id}")]
    SourceNotFound { source_id: String },
}

pub(crate) fn register_sub_window_registry_source<R: Runtime>(
    app: &AppHandle<R>,
    source_id: &str,
    process_id: &str,
    window_label: &str,
    state: SubWindowStatePayload,
) -> Result<(), SubWindowRegistryError> {
    let now = current_epoch_ms();

    with_registry_lock(app, |base_path| {
        let source = StoredSubWindowSource {
            source_id: source_id.to_owned(),
            process_id: process_id.to_owned(),
            window_label: window_label.to_owned(),
            heartbeat_at_epoch_ms: now,
            state,
        };

        write_json_atomic(&source_path(base_path, source_id), &source)?;

        let sources = read_sources_locked(base_path, now)?;
        if read_active_source_id_locked(base_path, &sources)?.is_none() {
            write_active_source_id_locked(base_path, Some(source_id.to_owned()), now)?;
        }

        Ok(())
    })
}

pub(crate) fn publish_sub_window_registry_source_state<R: Runtime>(
    app: &AppHandle<R>,
    source_id: &str,
    process_id: &str,
    window_label: &str,
    state: SubWindowStatePayload,
) -> Result<(), SubWindowRegistryError> {
    let now = current_epoch_ms();

    with_registry_lock(app, |base_path| {
        let source = StoredSubWindowSource {
            source_id: source_id.to_owned(),
            process_id: process_id.to_owned(),
            window_label: window_label.to_owned(),
            heartbeat_at_epoch_ms: now,
            state,
        };

        write_json_atomic(&source_path(base_path, source_id), &source)
    })
}

pub(crate) fn remove_sub_window_registry_source<R: Runtime>(
    app: &AppHandle<R>,
    source_id: &str,
) -> Result<(), SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        remove_file_if_exists(&source_path(base_path, source_id))?;
        remove_file_if_exists(&request_path(base_path, source_id))?;

        let now = current_epoch_ms();
        let sources = read_sources_locked(base_path, now)?;
        if read_active_source_id_locked(base_path, &sources)?.as_deref() == Some(source_id) {
            write_active_source_id_locked(base_path, None, now)?;
        }

        Ok(())
    })
}

pub(crate) fn activate_sub_window_registry_source<R: Runtime>(
    app: &AppHandle<R>,
    source_id: &str,
) -> Result<(), SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        let now = current_epoch_ms();
        let sources = read_sources_locked(base_path, now)?;

        if sources.iter().any(|source| source.source_id == source_id) {
            write_active_source_id_locked(base_path, Some(source_id.to_owned()), now)?;
        }

        Ok(())
    })
}

pub(crate) fn get_sub_window_registry_sources<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<SubWindowSourcesSnapshotPayload, SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        let now = current_epoch_ms();
        let sources = read_sources_locked(base_path, now)?;
        let active_source_id = read_active_source_id_locked(base_path, &sources)?;
        let mut summaries = sources
            .into_iter()
            .map(|source| SubWindowSourceSummaryPayload {
                id: source.source_id.clone(),
                is_active: active_source_id.as_deref() == Some(source.source_id.as_str()),
                title: source.state.title,
                updated_at_epoch_ms: source.state.updated_at_epoch_ms,
            })
            .collect::<Vec<_>>();

        summaries.sort_by(|left, right| {
            left.title
                .cmp(&right.title)
                .then_with(|| left.id.cmp(&right.id))
        });

        Ok(SubWindowSourcesSnapshotPayload {
            active_source_id,
            sources: summaries,
        })
    })
}

pub(crate) fn get_sub_window_registry_source_state<R: Runtime>(
    app: &AppHandle<R>,
    selection: &SubWindowSelectionPayload,
) -> Result<SubWindowResolvedSourceStatePayload, SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        let now = current_epoch_ms();
        let sources = read_sources_locked(base_path, now)?;
        let source_id = if selection.mode == "source" {
            selection.source_id.clone()
        } else {
            read_active_source_id_locked(base_path, &sources)?
        };
        let Some(source_id) = source_id else {
            return Ok(SubWindowResolvedSourceStatePayload {
                source_id: None,
                state: None,
            });
        };

        let state = sources
            .iter()
            .find(|source| source.source_id == source_id)
            .map(|source| source.state.clone());

        Ok(SubWindowResolvedSourceStatePayload {
            source_id: Some(source_id),
            state,
        })
    })
}

pub(crate) fn push_sub_window_registry_line_selection_request<R: Runtime>(
    app: &AppHandle<R>,
    request: SubWindowSourceLineSelectionRequestPayload,
) -> Result<(), SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        let now = current_epoch_ms();
        let sources = read_sources_locked(base_path, now)?;
        if !sources
            .iter()
            .any(|source| source.source_id == request.source_id)
        {
            return Err(SubWindowRegistryError::SourceNotFound {
                source_id: request.source_id,
            });
        }

        let path = request_path(base_path, &request.source_id);
        let mut requests = read_json_optional::<StoredLineSelectionRequests>(&path)?.unwrap_or(
            StoredLineSelectionRequests {
                requests: Vec::new(),
            },
        );
        requests.requests.push(request);

        if requests.requests.len() > MAX_PENDING_LINE_SELECTION_REQUESTS {
            let remove_count = requests.requests.len() - MAX_PENDING_LINE_SELECTION_REQUESTS;
            requests.requests.drain(0..remove_count);
        }

        write_json_atomic(&path, &requests)
    })
}

pub(crate) fn take_sub_window_registry_line_selection_requests<R: Runtime>(
    app: &AppHandle<R>,
    source_id: &str,
) -> Result<Vec<SubWindowSourceLineSelectionRequestPayload>, SubWindowRegistryError> {
    with_registry_lock(app, |base_path| {
        let path = request_path(base_path, source_id);
        let Some(requests) = read_json_optional::<StoredLineSelectionRequests>(&path)? else {
            return Ok(Vec::new());
        };

        remove_file_if_exists(&path)?;

        Ok(requests
            .requests
            .into_iter()
            .filter(|request| request.source_id == source_id)
            .collect())
    })
}

pub(crate) fn touch_sub_window_registry_sources<R: Runtime>(
    app: &AppHandle<R>,
    source_ids: &[String],
) -> Result<(), SubWindowRegistryError> {
    if source_ids.is_empty() {
        return Ok(());
    }

    let source_ids = source_ids.iter().cloned().collect::<HashSet<_>>();
    let now = current_epoch_ms();

    with_registry_lock(app, |base_path| {
        let sources = read_sources_locked(base_path, now)?;

        for mut source in sources {
            if !source_ids.contains(&source.source_id) {
                continue;
            }

            source.heartbeat_at_epoch_ms = now;
            write_json_atomic(&source_path(base_path, &source.source_id), &source)?;
        }

        Ok(())
    })
}

fn with_registry_lock<R: Runtime, T>(
    app: &AppHandle<R>,
    action: impl FnOnce(&Path) -> Result<T, SubWindowRegistryError>,
) -> Result<T, SubWindowRegistryError> {
    let base_path = base_directory(app)?;
    create_directory(&base_path)?;
    create_directory(&base_path.join(SOURCES_DIRECTORY_NAME))?;
    create_directory(&base_path.join(REQUESTS_DIRECTORY_NAME))?;

    let lock_path = base_path.join(REGISTRY_LOCK_FILE_NAME);
    let lock_file = open_lock_file(&lock_path)?;
    lock_file
        .lock_exclusive()
        .map_err(|source| SubWindowRegistryError::Io {
            operation: "lock",
            path: display_path(&lock_path),
            source,
        })?;

    action(&base_path)
}

fn read_sources_locked(
    base_path: &Path,
    now: u64,
) -> Result<Vec<StoredSubWindowSource>, SubWindowRegistryError> {
    let sources_path = base_path.join(SOURCES_DIRECTORY_NAME);
    let mut sources = Vec::new();

    for entry in fs::read_dir(&sources_path).map_err(|source| SubWindowRegistryError::Io {
        operation: "read",
        path: display_path(&sources_path),
        source,
    })? {
        let entry = entry.map_err(|source| SubWindowRegistryError::Io {
            operation: "read",
            path: display_path(&sources_path),
            source,
        })?;
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some(JSON_EXTENSION) {
            continue;
        }

        let source = match read_json_optional::<StoredSubWindowSource>(&path) {
            Ok(Some(source)) => source,
            Ok(None) => continue,
            Err(SubWindowRegistryError::Deserialize { .. }) => {
                remove_file_if_exists(&path)?;
                continue;
            }
            Err(error) => return Err(error),
        };

        if now.saturating_sub(source.heartbeat_at_epoch_ms) > SOURCE_STALE_AFTER_MS {
            remove_file_if_exists(&path)?;
            remove_file_if_exists(&request_path(base_path, &source.source_id))?;
            continue;
        }

        sources.push(source);
    }

    Ok(sources)
}

fn read_active_source_id_locked(
    base_path: &Path,
    sources: &[StoredSubWindowSource],
) -> Result<Option<String>, SubWindowRegistryError> {
    let path = active_source_path(base_path);
    let active_source = match read_json_optional::<StoredActiveSubWindowSource>(&path) {
        Ok(active_source) => active_source,
        Err(SubWindowRegistryError::Deserialize { .. }) => {
            remove_file_if_exists(&path)?;
            None
        }
        Err(error) => return Err(error),
    };
    let Some(active_source_id) = active_source.and_then(|active| active.source_id) else {
        return Ok(None);
    };

    if sources
        .iter()
        .any(|source| source.source_id == active_source_id)
    {
        return Ok(Some(active_source_id));
    }

    remove_file_if_exists(&path)?;
    Ok(None)
}

fn write_active_source_id_locked(
    base_path: &Path,
    source_id: Option<String>,
    now: u64,
) -> Result<(), SubWindowRegistryError> {
    write_json_atomic(
        &active_source_path(base_path),
        &StoredActiveSubWindowSource {
            source_id,
            updated_at_epoch_ms: now,
        },
    )
}

fn read_json_optional<T: DeserializeOwned>(
    path: &Path,
) -> Result<Option<T>, SubWindowRegistryError> {
    let payload = match fs::read(path) {
        Ok(payload) => payload,
        Err(source) if source.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(SubWindowRegistryError::Io {
                operation: "read",
                path: display_path(path),
                source,
            });
        }
    };

    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(|source| SubWindowRegistryError::Deserialize {
            path: display_path(path),
            source,
        })
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), SubWindowRegistryError> {
    if let Some(parent) = path.parent() {
        create_directory(parent)?;
    }

    let payload =
        serde_json::to_vec(value).map_err(|source| SubWindowRegistryError::Serialize { source })?;
    let temp_path = path.with_extension(TEMP_EXTENSION);

    fs::write(&temp_path, payload).map_err(|source| SubWindowRegistryError::Io {
        operation: "write",
        path: display_path(&temp_path),
        source,
    })?;

    remove_file_if_exists(path)?;
    fs::rename(&temp_path, path).map_err(|source| SubWindowRegistryError::Io {
        operation: "replace",
        path: display_path(path),
        source,
    })
}

fn create_directory(path: &Path) -> Result<(), SubWindowRegistryError> {
    fs::create_dir_all(path).map_err(|source| SubWindowRegistryError::Io {
        operation: "create",
        path: display_path(path),
        source,
    })
}

fn remove_file_if_exists(path: &Path) -> Result<(), SubWindowRegistryError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(SubWindowRegistryError::Io {
            operation: "remove",
            path: display_path(path),
            source,
        }),
    }
}

fn open_lock_file(path: &Path) -> Result<File, SubWindowRegistryError> {
    OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(path)
        .map_err(|source| SubWindowRegistryError::Io {
            operation: "open",
            path: display_path(path),
            source,
        })
}

fn source_path(base_path: &Path, source_id: &str) -> PathBuf {
    base_path
        .join(SOURCES_DIRECTORY_NAME)
        .join(format!("{}.json", encode_path_component(source_id)))
}

fn request_path(base_path: &Path, source_id: &str) -> PathBuf {
    base_path
        .join(REQUESTS_DIRECTORY_NAME)
        .join(format!("{}.json", encode_path_component(source_id)))
}

fn active_source_path(base_path: &Path) -> PathBuf {
    base_path.join(ACTIVE_SOURCE_FILE_NAME)
}

fn base_directory<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, SubWindowRegistryError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|source| SubWindowRegistryError::ResolveAppConfigDir { source })?;
    path.push(REGISTRY_DIRECTORY_NAME);
    Ok(path)
}

fn encode_path_component(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn current_epoch_ms() -> u64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    u64::try_from(millis).unwrap_or(u64::MAX)
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
