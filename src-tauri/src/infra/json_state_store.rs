use std::{
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use fs2::FileExt;
use kmark_contract::{StateEnvelope, MAX_JAVASCRIPT_SAFE_INTEGER, STATE_SCHEMA_VERSION};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const STATE_DIRECTORY_NAME: &str = "state";
const STATE_SLOT_COUNT: usize = 2;
const MAX_CORRUPT_FILES_PER_SLOT: usize = 3;
static RECOVERY_NOTICES: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

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
    #[error("failed to open {scope} state lock: {path}")]
    OpenLock {
        scope: &'static str,
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to lock {scope} state: {path}")]
    LockState {
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
    #[error("failed to sync {scope} state file: {path}")]
    SyncState {
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
    #[error("failed to verify {scope} state after write: {path}")]
    VerifyState { scope: &'static str, path: String },
    #[error("{scope} state schema {found} is newer than supported schema {supported}: {path}")]
    UnsupportedSchemaVersion {
        scope: &'static str,
        path: String,
        found: u32,
        supported: u32,
    },
    #[error("{scope} state revision exceeded the JavaScript safe integer range")]
    RevisionExhausted { scope: &'static str },
}

impl JsonStateStoreError {
    pub fn is_unsupported_schema_version(&self) -> bool {
        matches!(self, Self::UnsupportedSchemaVersion { .. })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StateEnvelopeHeader {
    schema_version: u32,
}

enum SlotState<T> {
    Missing,
    Valid(StateEnvelope<T>),
    Corrupt,
}

pub fn load_json_state<R, T>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
) -> Result<Option<T>, JsonStateStoreError>
where
    R: Runtime,
    T: Clone + DeserializeOwned + Serialize,
{
    let paths = state_paths(app, scope, file_name)?;
    load_json_state_from_paths(scope, &paths)
}

fn load_json_state_from_paths<T>(
    scope: &'static str,
    paths: &StatePaths,
) -> Result<Option<T>, JsonStateStoreError>
where
    T: Clone + DeserializeOwned + Serialize,
{
    with_state_lock(scope, &paths.lock, || {
        let mut valid_slots = Vec::new();

        for (index, path) in paths.slots.iter().enumerate() {
            match read_slot::<T>(scope, path)? {
                SlotState::Valid(envelope) => valid_slots.push((index, envelope)),
                SlotState::Corrupt => quarantine_corrupt_file(scope, path)?,
                SlotState::Missing => {}
            }
        }

        if let Some((_, envelope)) = valid_slots
            .into_iter()
            .max_by_key(|(index, envelope)| (envelope.revision, *index))
        {
            return Ok(Some(envelope.payload));
        }

        let Some(legacy_payload) = read_legacy_state::<T>(scope, &paths.legacy)? else {
            return Ok(None);
        };

        write_envelope(
            scope,
            &paths.slots[0],
            &StateEnvelope::new(1, legacy_payload.clone()),
        )?;
        Ok(Some(legacy_payload))
    })
}

pub fn persist_json_state<R, T>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
    value: &T,
) -> Result<(), JsonStateStoreError>
where
    R: Runtime,
    T: Clone + DeserializeOwned + Serialize,
{
    let paths = state_paths(app, scope, file_name)?;
    persist_json_state_to_paths(scope, &paths, value)
}

fn persist_json_state_to_paths<T>(
    scope: &'static str,
    paths: &StatePaths,
    value: &T,
) -> Result<(), JsonStateStoreError>
where
    T: Clone + DeserializeOwned + Serialize,
{
    with_state_lock(scope, &paths.lock, || {
        let mut valid_slots = Vec::new();
        let mut missing_or_corrupt = Vec::new();

        for (index, path) in paths.slots.iter().enumerate() {
            match read_slot::<T>(scope, path)? {
                SlotState::Valid(envelope) => valid_slots.push((index, envelope.revision)),
                SlotState::Corrupt => {
                    quarantine_corrupt_file(scope, path)?;
                    missing_or_corrupt.push(index);
                }
                SlotState::Missing => missing_or_corrupt.push(index),
            }
        }

        let current_revision = valid_slots
            .iter()
            .map(|(_, revision)| *revision)
            .max()
            .unwrap_or(0);
        let next_revision = current_revision
            .checked_add(1)
            .filter(|revision| *revision <= MAX_JAVASCRIPT_SAFE_INTEGER)
            .ok_or(JsonStateStoreError::RevisionExhausted { scope })?;
        let target_index = missing_or_corrupt.first().copied().unwrap_or_else(|| {
            valid_slots
                .iter()
                .min_by_key(|(index, revision)| (*revision, *index))
                .map(|(index, _)| *index)
                .unwrap_or(0)
        });

        write_envelope(
            scope,
            &paths.slots[target_index],
            &StateEnvelope::new(next_revision, value.clone()),
        )
    })
}

struct StatePaths {
    legacy: PathBuf,
    lock: PathBuf,
    slots: [PathBuf; STATE_SLOT_COUNT],
}

fn state_paths<R: Runtime>(
    app: &AppHandle<R>,
    scope: &'static str,
    file_name: &str,
) -> Result<StatePaths, JsonStateStoreError> {
    let mut directory = app
        .path()
        .app_config_dir()
        .map_err(|source| JsonStateStoreError::ResolveAppConfigDir { scope, source })?;
    directory.push(STATE_DIRECTORY_NAME);
    create_directory(scope, &directory)?;

    let legacy = directory.join(file_name);
    let file_stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name);

    Ok(StatePaths {
        legacy,
        lock: directory.join(format!("{file_stem}.lock")),
        slots: [
            directory.join(format!("{file_stem}.slot-0.json")),
            directory.join(format!("{file_stem}.slot-1.json")),
        ],
    })
}

fn with_state_lock<T>(
    scope: &'static str,
    lock_path: &Path,
    operation: impl FnOnce() -> Result<T, JsonStateStoreError>,
) -> Result<T, JsonStateStoreError> {
    let lock_file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|source| JsonStateStoreError::OpenLock {
            scope,
            path: display_path(lock_path),
            source,
        })?;
    lock_file
        .lock_exclusive()
        .map_err(|source| JsonStateStoreError::LockState {
            scope,
            path: display_path(lock_path),
            source,
        })?;

    operation()
}

fn read_slot<T: DeserializeOwned>(
    scope: &'static str,
    path: &Path,
) -> Result<SlotState<T>, JsonStateStoreError> {
    let Some(payload) = read_optional_file(scope, path)? else {
        return Ok(SlotState::Missing);
    };

    let header = match serde_json::from_slice::<StateEnvelopeHeader>(&payload) {
        Ok(header) => header,
        Err(_) => return Ok(SlotState::Corrupt),
    };
    if header.schema_version > STATE_SCHEMA_VERSION {
        return Err(JsonStateStoreError::UnsupportedSchemaVersion {
            scope,
            path: display_path(path),
            found: header.schema_version,
            supported: STATE_SCHEMA_VERSION,
        });
    }
    if header.schema_version != STATE_SCHEMA_VERSION {
        return Ok(SlotState::Corrupt);
    }

    match serde_json::from_slice::<StateEnvelope<T>>(&payload) {
        Ok(envelope) if envelope.revision <= MAX_JAVASCRIPT_SAFE_INTEGER => {
            Ok(SlotState::Valid(envelope))
        }
        Ok(_) | Err(_) => Ok(SlotState::Corrupt),
    }
}

fn read_legacy_state<T: DeserializeOwned>(
    scope: &'static str,
    path: &Path,
) -> Result<Option<T>, JsonStateStoreError> {
    let Some(payload) = read_optional_file(scope, path)? else {
        return Ok(None);
    };

    if let Ok(header) = serde_json::from_slice::<StateEnvelopeHeader>(&payload) {
        if header.schema_version > STATE_SCHEMA_VERSION {
            return Err(JsonStateStoreError::UnsupportedSchemaVersion {
                scope,
                path: display_path(path),
                found: header.schema_version,
                supported: STATE_SCHEMA_VERSION,
            });
        }
    }

    match serde_json::from_slice(&payload) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            quarantine_corrupt_file(scope, path)?;
            Ok(None)
        }
    }
}

fn read_optional_file(
    scope: &'static str,
    path: &Path,
) -> Result<Option<Vec<u8>>, JsonStateStoreError> {
    match fs::read(path) {
        Ok(payload) => Ok(Some(payload)),
        Err(source) if source.kind() == ErrorKind::NotFound => Ok(None),
        Err(source) => Err(JsonStateStoreError::ReadState {
            scope,
            path: display_path(path),
            source,
        }),
    }
}

fn write_envelope<T: Serialize + DeserializeOwned>(
    scope: &'static str,
    path: &Path,
    envelope: &StateEnvelope<T>,
) -> Result<(), JsonStateStoreError> {
    let payload = serde_json::to_vec(envelope)
        .map_err(|source| JsonStateStoreError::SerializeState { scope, source })?;
    let mut file = File::create(path).map_err(|source| JsonStateStoreError::WriteState {
        scope,
        path: display_path(path),
        source,
    })?;
    file.write_all(&payload)
        .and_then(|_| file.flush())
        .map_err(|source| JsonStateStoreError::WriteState {
            scope,
            path: display_path(path),
            source,
        })?;
    file.sync_all()
        .map_err(|source| JsonStateStoreError::SyncState {
            scope,
            path: display_path(path),
            source,
        })?;

    let verified = fs::read(path).map_err(|source| JsonStateStoreError::ReadState {
        scope,
        path: display_path(path),
        source,
    })?;
    let verified_envelope =
        serde_json::from_slice::<StateEnvelope<T>>(&verified).map_err(|source| {
            JsonStateStoreError::DeserializeState {
                scope,
                path: display_path(path),
                source,
            }
        })?;
    if verified_envelope.schema_version != envelope.schema_version
        || verified_envelope.revision != envelope.revision
    {
        return Err(JsonStateStoreError::VerifyState {
            scope,
            path: display_path(path),
        });
    }

    Ok(())
}

fn quarantine_corrupt_file(scope: &'static str, path: &Path) -> Result<(), JsonStateStoreError> {
    if !path.exists() {
        return Ok(());
    }

    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    let quarantine_path = path.with_file_name(format!("{file_name}.corrupt-{epoch_ms}"));
    fs::rename(path, &quarantine_path).map_err(|source| JsonStateStoreError::WriteState {
        scope,
        path: display_path(&quarantine_path),
        source,
    })?;
    record_recovery_notice(format!(
        "{scope} の破損データを隔離し 保存済み世代から復旧しました: {}",
        display_path(&quarantine_path)
    ));
    prune_corrupt_files(scope, path)
}

fn record_recovery_notice(message: String) {
    if let Ok(mut notices) = RECOVERY_NOTICES
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
    {
        notices.push(message);
    }
}

pub fn take_json_state_recovery_notices() -> Vec<String> {
    RECOVERY_NOTICES
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .map(|mut notices| std::mem::take(&mut *notices))
        .unwrap_or_default()
}

fn prune_corrupt_files(scope: &'static str, state_path: &Path) -> Result<(), JsonStateStoreError> {
    let Some(parent) = state_path.parent() else {
        return Ok(());
    };
    let prefix = format!(
        "{}.corrupt-",
        state_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
    );
    let mut corrupt_paths = fs::read_dir(parent)
        .map_err(|source| JsonStateStoreError::ReadState {
            scope,
            path: display_path(parent),
            source,
        })?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.starts_with(&prefix))
        })
        .collect::<Vec<_>>();
    corrupt_paths.sort();

    let remove_count = corrupt_paths
        .len()
        .saturating_sub(MAX_CORRUPT_FILES_PER_SLOT);
    for path in corrupt_paths.into_iter().take(remove_count) {
        fs::remove_file(&path).map_err(|source| JsonStateStoreError::WriteState {
            scope,
            path: display_path(&path),
            source,
        })?;
    }

    Ok(())
}

fn create_directory(scope: &'static str, path: &Path) -> Result<(), JsonStateStoreError> {
    fs::create_dir_all(path).map_err(|source| JsonStateStoreError::CreateDirectory {
        scope,
        path: display_path(path),
        source,
    })
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    const TEST_SCOPE: &str = "test_state";

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "kmark-json-state-{name}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test state directory");
            Self(path)
        }

        fn paths(&self) -> StatePaths {
            StatePaths {
                legacy: self.0.join("state.json"),
                lock: self.0.join("state.lock"),
                slots: [
                    self.0.join("state.slot-0.json"),
                    self.0.join("state.slot-1.json"),
                ],
            }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_json(path: &Path, value: &Value) {
        fs::write(
            path,
            serde_json::to_vec(value).expect("serialize test json"),
        )
        .expect("write test json");
    }

    #[test]
    fn persist_alternates_slots_and_loads_newest_revision() {
        let directory = TestDirectory::new("alternate");
        let paths = directory.paths();

        persist_json_state_to_paths(TEST_SCOPE, &paths, &json!({ "value": 1 }))
            .expect("persist first revision");
        persist_json_state_to_paths(TEST_SCOPE, &paths, &json!({ "value": 2 }))
            .expect("persist second revision");

        let loaded = load_json_state_from_paths::<Value>(TEST_SCOPE, &paths)
            .expect("load state")
            .expect("state exists");
        assert_eq!(loaded, json!({ "value": 2 }));

        let revisions = paths
            .slots
            .iter()
            .map(|path| {
                serde_json::from_slice::<StateEnvelope<Value>>(&fs::read(path).expect("read slot"))
                    .expect("parse envelope")
                    .revision
            })
            .collect::<Vec<_>>();
        assert_eq!(revisions, vec![1, 2]);
    }

    #[test]
    fn truncated_newest_slot_falls_back_and_is_quarantined() {
        let directory = TestDirectory::new("truncated");
        let paths = directory.paths();
        write_envelope(
            TEST_SCOPE,
            &paths.slots[0],
            &StateEnvelope::new(4, json!({ "value": "stable" })),
        )
        .expect("write stable slot");
        fs::write(&paths.slots[1], b"{\"schemaVersion\":1").expect("write truncated slot");

        let loaded = load_json_state_from_paths::<Value>(TEST_SCOPE, &paths)
            .expect("load fallback")
            .expect("fallback exists");
        assert_eq!(loaded, json!({ "value": "stable" }));
        assert!(!paths.slots[1].exists());
        assert!(fs::read_dir(&directory.0)
            .expect("list state directory")
            .filter_map(Result::ok)
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .contains("slot-1.json.corrupt-")));
        let _ = take_json_state_recovery_notices();
    }

    #[test]
    fn legacy_payload_is_migrated_without_deleting_source() {
        let directory = TestDirectory::new("legacy");
        let paths = directory.paths();
        write_json(&paths.legacy, &json!({ "legacy": true }));

        let loaded = load_json_state_from_paths::<Value>(TEST_SCOPE, &paths)
            .expect("load legacy")
            .expect("legacy exists");
        assert_eq!(loaded, json!({ "legacy": true }));
        assert!(paths.legacy.exists());
        assert!(paths.slots[0].exists());
    }

    #[test]
    fn future_schema_stops_load_even_when_an_older_slot_is_valid() {
        let directory = TestDirectory::new("future");
        let paths = directory.paths();
        write_envelope(
            TEST_SCOPE,
            &paths.slots[0],
            &StateEnvelope::new(3, json!({ "value": "old" })),
        )
        .expect("write supported slot");
        write_json(
            &paths.slots[1],
            &json!({
                "schemaVersion": STATE_SCHEMA_VERSION + 1,
                "revision": 4,
                "payload": { "value": "future" }
            }),
        );

        let error = load_json_state_from_paths::<Value>(TEST_SCOPE, &paths)
            .expect_err("future schema must fail");
        assert!(error.is_unsupported_schema_version());
        assert!(paths.slots[1].exists());
    }
}
