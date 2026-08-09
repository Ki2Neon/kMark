use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use fs2::FileExt;
use kmark_application::{ApplicationService, PreviewJobPort};
use kmark_rest::{start_rest_server, RestServerHandle};
use rand::RngCore;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

const DISCOVERY_SCHEMA_VERSION: u32 = 1;
const EXTERNAL_API_DIRECTORY_NAME: &str = "external-api";
const INSTANCE_DIRECTORY_NAME: &str = "instances";

#[derive(Debug, thiserror::Error)]
pub enum ExternalApiRuntimeError {
    #[error("failed to resolve external API app config directory")]
    ResolveDirectory(#[source] tauri::Error),
    #[error("failed to prepare external API discovery directory: {path}")]
    PrepareDirectory {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to start external API REST server")]
    StartServer(#[source] std::io::Error),
    #[error("failed to open external API instance lease: {path}")]
    OpenLease {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to lock external API instance lease: {path}")]
    LockLease {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to publish external API discovery record: {path}")]
    PublishRecord {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to serialize external API discovery record")]
    SerializeRecord(#[source] serde_json::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryRecord<'a> {
    schema_version: u32,
    instance_id: &'a str,
    pid: u32,
    endpoint: String,
    auth_token: &'a str,
    started_at_epoch_ms: u64,
}

pub(crate) struct ExternalApiRuntime {
    instance_id: String,
    server: Option<RestServerHandle>,
    lease_file: Option<File>,
    discovery_path: Option<PathBuf>,
}

impl ExternalApiRuntime {
    pub(crate) fn new(instance_id: String) -> Self {
        Self {
            instance_id,
            server: None,
            lease_file: None,
            discovery_path: None,
        }
    }

    pub(crate) fn endpoint(&self) -> Option<String> {
        self.server
            .as_ref()
            .map(|server| format!("http://{}", server.info().address))
    }

    pub(crate) fn is_enabled(&self) -> bool {
        self.server.is_some()
    }

    pub(crate) async fn start<R: Runtime>(
        &mut self,
        app: &AppHandle<R>,
        application: Arc<ApplicationService>,
        preview_jobs: Arc<dyn PreviewJobPort>,
    ) -> Result<(), ExternalApiRuntimeError> {
        if self.server.is_some() {
            return Ok(());
        }
        let token = generate_token();
        let server = start_rest_server(application, preview_jobs, token.clone())
            .await
            .map_err(ExternalApiRuntimeError::StartServer)?;
        let directory = discovery_directory(app)?;
        prepare_private_directory(&directory)?;
        let lease_path = directory.join(format!("{}.lock", self.instance_id));
        let lease_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lease_path)
            .map_err(|source| ExternalApiRuntimeError::OpenLease {
                path: display_path(&lease_path),
                source,
            })?;
        lease_file
            .try_lock_exclusive()
            .map_err(|source| ExternalApiRuntimeError::LockLease {
                path: display_path(&lease_path),
                source,
            })?;
        let discovery_path = directory.join(format!("{}.json", self.instance_id));
        let record = DiscoveryRecord {
            schema_version: DISCOVERY_SCHEMA_VERSION,
            instance_id: &self.instance_id,
            pid: std::process::id(),
            endpoint: format!("http://{}", server.info().address),
            auth_token: &token,
            started_at_epoch_ms: epoch_ms(),
        };
        if let Err(error) = publish_record(&discovery_path, &record) {
            let _ = server.shutdown().await;
            return Err(error);
        }
        self.server = Some(server);
        self.lease_file = Some(lease_file);
        self.discovery_path = Some(discovery_path);
        Ok(())
    }

    pub(crate) async fn stop(&mut self) {
        if let Some(path) = self.discovery_path.take() {
            let _ = fs::remove_file(path);
        }
        self.lease_file.take();
        if let Some(server) = self.server.take() {
            let _ = server.shutdown().await;
        }
    }
}

pub(crate) fn generate_instance_id() -> String {
    let mut bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn discovery_directory<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ExternalApiRuntimeError> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(ExternalApiRuntimeError::ResolveDirectory)?;
    path.push(EXTERNAL_API_DIRECTORY_NAME);
    path.push(INSTANCE_DIRECTORY_NAME);
    Ok(path)
}

fn prepare_private_directory(path: &Path) -> Result<(), ExternalApiRuntimeError> {
    fs::create_dir_all(path).map_err(|source| ExternalApiRuntimeError::PrepareDirectory {
        path: display_path(path),
        source,
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|source| {
            ExternalApiRuntimeError::PrepareDirectory {
                path: display_path(path),
                source,
            }
        })?;
    }
    Ok(())
}

fn publish_record(
    path: &Path,
    record: &DiscoveryRecord<'_>,
) -> Result<(), ExternalApiRuntimeError> {
    let payload = serde_json::to_vec(record).map_err(ExternalApiRuntimeError::SerializeRecord)?;
    let temporary_path = path.with_extension("json.tmp");
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file =
        options
            .open(&temporary_path)
            .map_err(|source| ExternalApiRuntimeError::PublishRecord {
                path: display_path(&temporary_path),
                source,
            })?;
    file.write_all(&payload)
        .map_err(|source| ExternalApiRuntimeError::PublishRecord {
            path: display_path(&temporary_path),
            source,
        })?;
    file.sync_all()
        .map_err(|source| ExternalApiRuntimeError::PublishRecord {
            path: display_path(&temporary_path),
            source,
        })?;
    if path.exists() {
        fs::remove_file(path).map_err(|source| ExternalApiRuntimeError::PublishRecord {
            path: display_path(path),
            source,
        })?;
    }
    fs::rename(&temporary_path, path).map_err(|source| ExternalApiRuntimeError::PublishRecord {
        path: display_path(path),
        source,
    })?;
    Ok(())
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default()
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
