use std::{ffi::OsStr, path::PathBuf};

use serde::Serialize;
use kmark_core::MarkdownDocument;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::CommandErrorPayload;
use crate::{
    usecase::{
        clear_pending_markdown_open_requests as clear_pending_markdown_open_requests_usecase,
        read_markdown_document,
        take_pending_markdown_documents,
        write_markdown_document as write_markdown_document_usecase,
    },
    AppState,
};

const MARKDOWN_DIALOG_FILTER_NAME: &str = "Markdown";
const MARKDOWN_DIALOG_FILTER_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentPayload {
    file_name: String,
    file_path: String,
    content: String,
}

impl From<MarkdownDocument> for MarkdownDocumentPayload {
    fn from(document: MarkdownDocument) -> Self {
        Self {
            file_name: document.file_name().to_owned(),
            file_path: document.file_path().to_string_lossy().into_owned(),
            content: document.content().to_owned(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMarkdownDocumentPayload {
    file_name: String,
    file_path: String,
}

fn resolve_dialog_path(file_path: FilePath) -> Result<PathBuf, CommandErrorPayload> {
    file_path.into_path().map_err(|error| {
        CommandErrorPayload::with_detail(
            "invalid_dialog_file_path",
            "failed to resolve selected markdown file path",
            error.to_string(),
        )
    })
}

fn saved_markdown_document_payload(path: &std::path::Path) -> SavedMarkdownDocumentPayload {
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    SavedMarkdownDocumentPayload {
        file_name,
        file_path: path.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub fn take_pending_markdown_open_requests(
    state: State<'_, AppState>,
) -> Result<Vec<MarkdownDocumentPayload>, CommandErrorPayload> {
    take_pending_markdown_documents(
        &state.open_request_queue,
        &state.markdown_document_repository,
    )
    .map(|documents| documents.into_iter().map(Into::into).collect())
    .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn clear_pending_markdown_open_requests(
    state: State<'_, AppState>,
) -> Result<(), CommandErrorPayload> {
    clear_pending_markdown_open_requests_usecase(&state.open_request_queue)
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub async fn open_markdown_document_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<MarkdownDocumentPayload>, CommandErrorPayload> {
    let app_handle = app.clone();
    let selected_file = tauri::async_runtime::spawn_blocking(move || {
        app_handle
            .dialog()
            .file()
            .add_filter(MARKDOWN_DIALOG_FILTER_NAME, MARKDOWN_DIALOG_FILTER_EXTENSIONS)
            .blocking_pick_file()
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "markdown_open_dialog_failed",
            "failed to open markdown picker",
            error.to_string(),
        )
    })?;

    let Some(selected_file) = selected_file else {
        return Ok(None);
    };

    let file_path = resolve_dialog_path(selected_file)?;

    read_markdown_document(&state.markdown_document_repository, &file_path)
        .map(Into::into)
        .map(Some)
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn write_markdown_document(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), CommandErrorPayload> {
    let file_path = PathBuf::from(&path);

    write_markdown_document_usecase(&state.markdown_document_repository, &file_path, &content)
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub async fn save_markdown_document_as_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    file_name: String,
    content: String,
) -> Result<Option<SavedMarkdownDocumentPayload>, CommandErrorPayload> {
    let suggested_file_name = file_name.clone();
    let app_handle = app.clone();
    let selected_file = tauri::async_runtime::spawn_blocking(move || {
        app_handle
            .dialog()
            .file()
            .add_filter(MARKDOWN_DIALOG_FILTER_NAME, MARKDOWN_DIALOG_FILTER_EXTENSIONS)
            .set_file_name(suggested_file_name)
            .blocking_save_file()
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "markdown_save_dialog_failed",
            "failed to open markdown save dialog",
            error.to_string(),
        )
    })?;

    let Some(selected_file) = selected_file else {
        return Ok(None);
    };

    let file_path = resolve_dialog_path(selected_file)?;

    write_markdown_document_usecase(&state.markdown_document_repository, &file_path, &content)
        .map_err(CommandErrorPayload::from)?;

    Ok(Some(saved_markdown_document_payload(&file_path)))
}
