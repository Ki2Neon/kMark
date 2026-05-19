use serde::Serialize;

use crate::infra::{JsonStateStoreError, SubWindowRegistryError};
use kmark_core::MarkdownDocumentError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandErrorPayload {
    code: String,
    message: String,
    detail: Option<String>,
}

impl CommandErrorPayload {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            detail: None,
        }
    }

    pub(crate) fn with_detail(
        code: &str,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub(crate) fn state_poisoned(context: &str) -> Self {
        Self::new(
            "state_poisoned",
            format!("failed to access {context} state"),
        )
    }

    pub(crate) fn message(&self) -> &str {
        &self.message
    }
}

impl From<MarkdownDocumentError> for CommandErrorPayload {
    fn from(error: MarkdownDocumentError) -> Self {
        match error {
            MarkdownDocumentError::UnsupportedPath(path) => Self::with_detail(
                "unsupported_markdown_path",
                "unsupported markdown file path",
                path,
            ),
            MarkdownDocumentError::NotFound(path) => Self::with_detail(
                "markdown_document_not_found",
                "markdown document not found",
                path,
            ),
            MarkdownDocumentError::ReadFailed { path, source } => Self::with_detail(
                "markdown_document_read_failed",
                format!("failed to read markdown document: {path}"),
                source.to_string(),
            ),
            MarkdownDocumentError::WriteFailed { path, source } => Self::with_detail(
                "markdown_document_write_failed",
                format!("failed to write markdown document: {path}"),
                source.to_string(),
            ),
            MarkdownDocumentError::OpenRequestQueuePoisoned => Self::new(
                "open_request_queue_poisoned",
                "failed to access pending markdown open request queue",
            ),
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
