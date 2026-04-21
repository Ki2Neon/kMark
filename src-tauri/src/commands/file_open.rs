use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::{
    domain::MarkdownDocument,
    usecase::{
        clear_pending_markdown_open_requests as clear_pending_markdown_open_requests_usecase,
        take_pending_markdown_documents,
        write_markdown_document as write_markdown_document_usecase,
    },
    AppState,
};

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

#[tauri::command]
pub fn take_pending_markdown_open_requests(
    state: State<'_, AppState>,
) -> Result<Vec<MarkdownDocumentPayload>, String> {
    take_pending_markdown_documents(
        &state.open_request_queue,
        &state.markdown_document_repository,
    )
    .map(|documents| documents.into_iter().map(Into::into).collect())
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_pending_markdown_open_requests(state: State<'_, AppState>) -> Result<(), String> {
    clear_pending_markdown_open_requests_usecase(&state.open_request_queue)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_markdown_document(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    write_markdown_document_usecase(&state.markdown_document_repository, &file_path, &content)
        .map_err(|error| error.to_string())
}