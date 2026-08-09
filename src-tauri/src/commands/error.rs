use serde::Serialize;

use crate::infra::{JsonStateStoreError, SubWindowRegistryError};
use kmark_application::ApplicationError;
use kmark_contract::CommandErrorPayload as ContractCommandErrorPayload;
use kmark_core::MarkdownDocumentError;

#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct CommandErrorPayload(ContractCommandErrorPayload);

impl CommandErrorPayload {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self(ContractCommandErrorPayload::new(code, message))
    }

    pub(crate) fn with_detail(
        code: &str,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self(ContractCommandErrorPayload::with_detail(
            code, message, detail,
        ))
    }

    pub(crate) fn state_poisoned(context: &str) -> Self {
        Self(ContractCommandErrorPayload::state_poisoned(context))
    }

    pub(crate) fn message(&self) -> &str {
        self.0.message()
    }
}

impl From<MarkdownDocumentError> for CommandErrorPayload {
    fn from(error: MarkdownDocumentError) -> Self {
        Self(error.into())
    }
}

impl From<ApplicationError> for CommandErrorPayload {
    fn from(error: ApplicationError) -> Self {
        match error.current_revision() {
            Some(current_revision) => Self::with_detail(
                error.code().as_str(),
                error.message(),
                format!("currentRevision={current_revision}"),
            ),
            None => Self::new(error.code().as_str(), error.message()),
        }
    }
}

impl From<JsonStateStoreError> for CommandErrorPayload {
    fn from(error: JsonStateStoreError) -> Self {
        match error {
            JsonStateStoreError::ResolveAppConfigDir { scope, source } => Self::with_detail(
                "app_config_dir_unavailable",
                format!("failed to resolve {scope} storage path"),
                source.to_string(),
            ),
            JsonStateStoreError::CreateDirectory {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_directory_create_failed"),
                format!("failed to create {scope} directory: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::OpenLock {
                scope,
                path,
                source,
            }
            | JsonStateStoreError::LockState {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_lock_failed"),
                format!("failed to lock {scope}: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::ReadState {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_read_failed"),
                format!("failed to read {scope}: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::WriteState {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_write_failed"),
                format!("failed to write {scope}: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::SyncState {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_sync_failed"),
                format!("failed to sync {scope}: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::DeserializeState {
                scope,
                path,
                source,
            } => Self::with_detail(
                &format!("{scope}_deserialize_failed"),
                format!("failed to parse {scope}: {path}"),
                source.to_string(),
            ),
            JsonStateStoreError::SerializeState { scope, source } => Self::with_detail(
                &format!("{scope}_serialize_failed"),
                format!("failed to serialize {scope}"),
                source.to_string(),
            ),
            JsonStateStoreError::VerifyState { scope, path } => Self::new(
                &format!("{scope}_verify_failed"),
                format!("failed to verify {scope}: {path}"),
            ),
            JsonStateStoreError::UnsupportedSchemaVersion {
                scope,
                path,
                found,
                supported,
            } => Self::new(
                &format!("{scope}_schema_too_new"),
                format!(
                    "{scope} schema {found} is newer than supported schema {supported}: {path}"
                ),
            ),
            JsonStateStoreError::RevisionExhausted { scope } => Self::new(
                &format!("{scope}_revision_exhausted"),
                format!("{scope} revision exceeded the supported range"),
            ),
        }
    }
}

impl From<SubWindowRegistryError> for CommandErrorPayload {
    fn from(error: SubWindowRegistryError) -> Self {
        match error {
            SubWindowRegistryError::ResolveAppConfigDir { source } => Self::with_detail(
                "subwindow_registry_dir_unavailable",
                "failed to resolve subwindow registry path",
                source.to_string(),
            ),
            SubWindowRegistryError::Io {
                operation,
                path,
                source,
            } => Self::with_detail(
                "subwindow_registry_io_failed",
                format!("failed to {operation} subwindow registry path: {path}"),
                source.to_string(),
            ),
            SubWindowRegistryError::Serialize { source } => Self::with_detail(
                "subwindow_registry_serialize_failed",
                "failed to serialize subwindow registry",
                source.to_string(),
            ),
            SubWindowRegistryError::Deserialize { path, source } => Self::with_detail(
                "subwindow_registry_deserialize_failed",
                format!("failed to deserialize subwindow registry file: {path}"),
                source.to_string(),
            ),
            SubWindowRegistryError::SourceNotFound { source_id } => Self::with_detail(
                "subwindow_source_not_found",
                "subwindow source not found",
                source_id,
            ),
        }
    }
}
