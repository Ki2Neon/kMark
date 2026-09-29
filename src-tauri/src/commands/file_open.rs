use std::{ffi::OsStr, path::PathBuf, sync::Arc};

use kmark_application::ApplicationService;
use kmark_contract::{MarkdownDocumentPayload, SavedMarkdownDocumentPayload};
use kmark_core::{is_supported_markdown_path, MarkdownDocument};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::CommandErrorPayload;
use crate::{
    infra::FileSystemMarkdownDocumentRepository,
    usecase::{
        clear_pending_markdown_open_requests as clear_pending_markdown_open_requests_usecase,
        read_markdown_document, take_pending_markdown_documents, write_editor_document_snapshot,
        write_markdown_document as write_markdown_document_usecase,
    },
    AppState,
};

const MARKDOWN_DIALOG_FILTER_NAME: &str = "Markdown";
const MARKDOWN_DIALOG_FILTER_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

fn markdown_document_payload(document: MarkdownDocument) -> MarkdownDocumentPayload {
    MarkdownDocumentPayload {
        file_name: document.file_name().to_owned(),
        file_path: document.file_path().to_string_lossy().into_owned(),
        content: document.content().to_owned(),
    }
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

async fn persist_editor_session_snapshot(
    application: Arc<ApplicationService>,
    repository: FileSystemMarkdownDocumentRepository,
    session_id: String,
    expected_revision: u64,
    file_path: PathBuf,
) -> Result<SavedMarkdownDocumentPayload, CommandErrorPayload> {
    let snapshot = application
        .editor_document_persistence_snapshot(&session_id, expected_revision)
        .map_err(CommandErrorPayload::from)?;
    let write_path = file_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        write_editor_document_snapshot(&repository, &write_path, &snapshot)
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "markdown_save_task_failed",
            "failed to join markdown save task",
            error.to_string(),
        )
    })?
    .map_err(CommandErrorPayload::from)?;

    let saved = saved_markdown_document_payload(&file_path);
    application
        .mark_frontend_session_saved_at_revision(
            &session_id,
            expected_revision,
            saved.file_name.clone(),
            Some(saved.file_path.clone()),
        )
        .map_err(CommandErrorPayload::from)?;
    Ok(saved)
}

#[tauri::command]
pub fn take_pending_markdown_open_requests(
    state: State<'_, AppState>,
) -> Result<Vec<MarkdownDocumentPayload>, CommandErrorPayload> {
    take_pending_markdown_documents(
        &state.open_request_queue,
        &state.markdown_document_repository,
    )
    .map(|documents| {
        documents
            .into_iter()
            .map(markdown_document_payload)
            .collect()
    })
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
            .add_filter(
                MARKDOWN_DIALOG_FILTER_NAME,
                MARKDOWN_DIALOG_FILTER_EXTENSIONS,
            )
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
        .map(markdown_document_payload)
        .map(Some)
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn read_markdown_document_at_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<MarkdownDocumentPayload, CommandErrorPayload> {
    let file_path = PathBuf::from(path.trim());

    read_markdown_document(&state.markdown_document_repository, &file_path)
        .map(markdown_document_payload)
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn open_markdown_document_folder(path: String) -> Result<(), CommandErrorPayload> {
    let file_path = PathBuf::from(path.trim());

    if !is_supported_markdown_path(&file_path) {
        return Err(CommandErrorPayload::with_detail(
            "unsupported_markdown_path",
            "unsupported markdown file path",
            file_path.to_string_lossy(),
        ));
    }

    let Some(folder_path) = file_path.parent() else {
        return Err(CommandErrorPayload::with_detail(
            "markdown_folder_not_found",
            "markdown document folder not found",
            file_path.to_string_lossy(),
        ));
    };

    if !folder_path.is_dir() {
        return Err(CommandErrorPayload::with_detail(
            "markdown_folder_not_found",
            "markdown document folder not found",
            folder_path.to_string_lossy(),
        ));
    }

    tauri_plugin_opener::open_path(folder_path, None::<&str>).map_err(|source| {
        CommandErrorPayload::with_detail(
            "markdown_folder_open_failed",
            "failed to open markdown document folder",
            source.to_string(),
        )
    })
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
pub async fn write_editor_session_markdown_document(
    state: State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    path: String,
) -> Result<SavedMarkdownDocumentPayload, CommandErrorPayload> {
    eprintln!(
        "[kmark:ipc] begin command=write_editor_session_markdown_document session={} op=save-{} rev={}",
        session_id, expected_revision, expected_revision
    );
    let trace_session_id = session_id.clone();
    let result = persist_editor_session_snapshot(
        Arc::clone(&state.application),
        state.markdown_document_repository,
        session_id,
        expected_revision,
        PathBuf::from(path),
    )
    .await;
    eprintln!(
        "[kmark:ipc] {} command=write_editor_session_markdown_document session={} op=save-{} rev={}",
        if result.is_ok() { "end" } else { "error" },
        trace_session_id,
        expected_revision,
        expected_revision
    );
    result
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
            .add_filter(
                MARKDOWN_DIALOG_FILTER_NAME,
                MARKDOWN_DIALOG_FILTER_EXTENSIONS,
            )
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

#[tauri::command]
pub async fn save_editor_session_markdown_document_as_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    file_name: String,
) -> Result<Option<SavedMarkdownDocumentPayload>, CommandErrorPayload> {
    let app_handle = app.clone();
    let selected_file = tauri::async_runtime::spawn_blocking(move || {
        app_handle
            .dialog()
            .file()
            .add_filter(
                MARKDOWN_DIALOG_FILTER_NAME,
                MARKDOWN_DIALOG_FILTER_EXTENSIONS,
            )
            .set_file_name(file_name)
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
    persist_editor_session_snapshot(
        Arc::clone(&state.application),
        state.markdown_document_repository,
        session_id,
        expected_revision,
        file_path,
    )
    .await
    .map(Some)
}
