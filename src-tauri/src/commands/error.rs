use serde::Serialize;

use crate::{domain::MarkdownDocumentError, infra::PreviewPreferencesStoreError};

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

impl From<PreviewPreferencesStoreError> for CommandErrorPayload {
    fn from(error: PreviewPreferencesStoreError) -> Self {
        match error {
            PreviewPreferencesStoreError::ResolveAppConfigDir { source } => Self::with_detail(
                "app_config_dir_unavailable",
                "failed to resolve preview preferences storage path",
                source.to_string(),
            ),
            PreviewPreferencesStoreError::CreateDirectory { path, source } => Self::with_detail(
                "preview_preferences_directory_create_failed",
                format!("failed to create preview preferences directory: {path}"),
                source.to_string(),
            ),
            PreviewPreferencesStoreError::ReadPreferences { path, source } => Self::with_detail(
                "preview_preferences_read_failed",
                format!("failed to read preview preferences: {path}"),
                source.to_string(),
            ),
            PreviewPreferencesStoreError::WritePreferences { path, source } => Self::with_detail(
                "preview_preferences_write_failed",
                format!("failed to write preview preferences: {path}"),
                source.to_string(),
            ),
            PreviewPreferencesStoreError::DeserializePreferences { path, source } => {
                Self::with_detail(
                    "preview_preferences_deserialize_failed",
                    format!("failed to parse preview preferences: {path}"),
                    source.to_string(),
                )
            }
            PreviewPreferencesStoreError::SerializePreferences { source } => Self::with_detail(
                "preview_preferences_serialize_failed",
                "failed to serialize preview preferences",
                source.to_string(),
            ),
        }
    }
}
