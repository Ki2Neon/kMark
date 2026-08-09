use std::{
    env,
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
};

use fs2::FileExt;
use serde::{Deserialize, Serialize};

const APP_IDENTIFIER: &str = "com.accou.kmark";
const DISCOVERY_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecord {
    pub schema_version: u32,
    pub instance_id: String,
    pub endpoint: String,
    pub auth_token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSummary {
    pub instance_id: String,
    pub endpoint: String,
}

#[derive(Clone, Debug)]
pub struct DiscoveryStore {
    directory: PathBuf,
}

impl DiscoveryStore {
    pub fn from_environment() -> Result<Self, DiscoveryError> {
        let directory = match env::var_os("KMARK_DISCOVERY_DIR") {
            Some(value) => PathBuf::from(value),
            None => default_directory()?,
        };
        Ok(Self { directory })
    }

    pub fn instances(&self) -> Result<Vec<InstanceSummary>, DiscoveryError> {
        let mut records = self.records()?;
        records.sort_by(|left, right| left.instance_id.cmp(&right.instance_id));
        Ok(records
            .into_iter()
            .map(|record| InstanceSummary {
                instance_id: record.instance_id,
                endpoint: record.endpoint,
            })
            .collect())
    }

    pub fn resolve(&self, instance_id: &str) -> Result<DiscoveryRecord, DiscoveryError> {
        validate_identifier(instance_id)?;
        if !lease_is_active(&self.directory, instance_id) {
            return Err(DiscoveryError::RecordNotFound);
        }
        let path = self.directory.join(format!("{instance_id}.json"));
        let record = read_record(path)?;
        if record.instance_id != instance_id {
            return Err(DiscoveryError::InvalidRecord(
                "record instance id does not match its file name".to_owned(),
            ));
        }
        validate_record(&record)?;
        Ok(record)
    }

    fn records(&self) -> Result<Vec<DiscoveryRecord>, DiscoveryError> {
        if !self.directory.exists() {
            return Ok(Vec::new());
        }
        let entries = fs::read_dir(&self.directory).map_err(DiscoveryError::ReadDirectory)?;
        let mut records = Vec::new();
        for path in entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "json")
            })
        {
            let Ok(record) = read_record(path) else {
                continue;
            };
            if validate_record(&record).is_ok()
                && lease_is_active(&self.directory, &record.instance_id)
            {
                records.push(record);
            }
        }
        Ok(records)
    }
}

fn lease_is_active(directory: &Path, instance_id: &str) -> bool {
    let path = directory.join(format!("{instance_id}.lock"));
    let Ok(file) = OpenOptions::new().read(true).write(true).open(path) else {
        return false;
    };
    match file.try_lock_exclusive() {
        Ok(()) => {
            let _ = file.unlock();
            false
        }
        Err(_) => true,
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("failed to resolve Kmark discovery directory")]
    DirectoryUnavailable,
    #[error("failed to read Kmark discovery directory")]
    ReadDirectory(#[source] std::io::Error),
    #[error("Kmark instance is not running or external API is disabled")]
    RecordNotFound,
    #[error("failed to read Kmark instance record")]
    ReadRecord(#[source] std::io::Error),
    #[error("failed to parse Kmark instance record")]
    ParseRecord(#[source] serde_json::Error),
    #[error("invalid Kmark instance record: {0}")]
    InvalidRecord(String),
    #[error("invalid instance id")]
    InvalidInstanceId,
}

fn read_record(path: PathBuf) -> Result<DiscoveryRecord, DiscoveryError> {
    let payload = fs::read(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            DiscoveryError::RecordNotFound
        } else {
            DiscoveryError::ReadRecord(error)
        }
    })?;
    serde_json::from_slice(&payload).map_err(DiscoveryError::ParseRecord)
}

fn validate_record(record: &DiscoveryRecord) -> Result<(), DiscoveryError> {
    if record.schema_version != DISCOVERY_SCHEMA_VERSION {
        return Err(DiscoveryError::InvalidRecord(
            "unsupported schema version".to_owned(),
        ));
    }
    validate_identifier(&record.instance_id)?;
    if record.auth_token.len() < 32 {
        return Err(DiscoveryError::InvalidRecord(
            "invalid auth token".to_owned(),
        ));
    }
    let url = reqwest::Url::parse(&record.endpoint)
        .map_err(|_| DiscoveryError::InvalidRecord("invalid endpoint".to_owned()))?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DiscoveryError::InvalidRecord(
            "endpoint must be loopback HTTP".to_owned(),
        ));
    }
    Ok(())
}

fn validate_identifier(value: &str) -> Result<(), DiscoveryError> {
    if !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Ok(())
    } else {
        Err(DiscoveryError::InvalidInstanceId)
    }
}

#[cfg(windows)]
fn default_directory() -> Result<PathBuf, DiscoveryError> {
    let app_data = env::var_os("APPDATA").ok_or(DiscoveryError::DirectoryUnavailable)?;
    Ok(PathBuf::from(app_data)
        .join(APP_IDENTIFIER)
        .join("external-api")
        .join("instances"))
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, OpenOptions},
        time::{SystemTime, UNIX_EPOCH},
    };

    use fs2::FileExt;

    use super::DiscoveryStore;

    fn test_directory(name: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "kmark-mcp-discovery-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn write_record(directory: &std::path::Path, instance_id: &str) {
        fs::create_dir_all(directory).expect("create discovery directory");
        fs::write(
            directory.join(format!("{instance_id}.json")),
            format!(
                r#"{{"schemaVersion":1,"instanceId":"{instance_id}","endpoint":"http://127.0.0.1:49152","authToken":"01234567890123456789012345678901"}}"#
            ),
        )
        .expect("write discovery record");
    }

    #[test]
    fn excludes_record_without_an_active_lease() {
        let directory = test_directory("stale");
        write_record(&directory, "stale-instance");
        fs::write(directory.join("stale-instance.lock"), []).expect("write lease file");
        let store = DiscoveryStore {
            directory: directory.clone(),
        };

        assert!(store.instances().expect("list instances").is_empty());
        assert!(store.resolve("stale-instance").is_err());

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn includes_record_while_lease_is_locked() {
        let directory = test_directory("active");
        write_record(&directory, "active-instance");
        let lease = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(directory.join("active-instance.lock"))
            .expect("open lease");
        lease.try_lock_exclusive().expect("lock lease");
        let store = DiscoveryStore {
            directory: directory.clone(),
        };

        let instances = store.instances().expect("list instances");
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].instance_id, "active-instance");
        assert_eq!(
            store
                .resolve("active-instance")
                .expect("resolve active instance")
                .instance_id,
            "active-instance"
        );

        lease.unlock().expect("unlock lease");
        drop(lease);
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}

#[cfg(target_os = "macos")]
fn default_directory() -> Result<PathBuf, DiscoveryError> {
    let home = env::var_os("HOME").ok_or(DiscoveryError::DirectoryUnavailable)?;
    Ok(PathBuf::from(home)
        .join("Library/Application Support")
        .join(APP_IDENTIFIER)
        .join("external-api")
        .join("instances"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn default_directory() -> Result<PathBuf, DiscoveryError> {
    let base = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .ok_or(DiscoveryError::DirectoryUnavailable)?;
    Ok(base
        .join(APP_IDENTIFIER)
        .join("external-api")
        .join("instances"))
}
