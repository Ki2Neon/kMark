use std::{
    collections::HashMap,
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc, Mutex},
    time::Duration,
};

use kmark_application::ApplicationService;
use kmark_contract::{MarkdownDocumentPayload, SavedMarkdownDocumentPayload};
use kmark_core::{is_supported_markdown_path, normalize_editor_text, MarkdownDocument};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State, Window};
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
const MARKDOWN_DOCUMENT_EXTERNAL_CHANGE_EVENT: &str = "markdown-document-external-change";
const MARKDOWN_DOCUMENT_WATCH_INTERVAL: Duration = Duration::from_millis(500);
const MARKDOWN_DOCUMENT_STABILITY_DELAY: Duration = Duration::from_millis(180);

#[derive(Clone)]
pub(crate) struct WatchedMarkdownDocument {
    path: PathBuf,
    version: String,
    generation: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentDiskStatePayload {
    path: String,
    content: String,
    version: String,
    changed: bool,
    generation: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentExternalChangePayload {
    path: String,
    content: String,
    version: String,
}

fn disk_version(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn content_changed(known_content: Option<&str>, disk_content: &str) -> bool {
    known_content.is_some_and(|known| {
        normalize_editor_text(known).text != normalize_editor_text(disk_content).text
    })
}

fn read_disk_content(path: &Path) -> Result<String, CommandErrorPayload> {
    if !is_supported_markdown_path(path) {
        return Err(CommandErrorPayload::with_detail(
            "unsupported_markdown_path",
            "unsupported markdown file path",
            path.to_string_lossy(),
        ));
    }
    std::fs::read_to_string(path).map_err(|error| {
        CommandErrorPayload::with_detail(
            "markdown_document_read_failed",
            "failed to read markdown document",
            error.to_string(),
        )
    })
}

fn check_disk_version(
    path: &Path,
    expected_disk_version: Option<&str>,
    overwrite_expected_version: Option<&str>,
) -> Result<(), CommandErrorPayload> {
    let expected = overwrite_expected_version
        .or(expected_disk_version)
        .ok_or_else(|| {
            CommandErrorPayload::new(
                "missing_disk_version",
                "a disk version is required before saving an open document",
            )
        })?;
    let current_content = read_disk_content(path)?;
    if disk_version(&current_content) != expected {
        return Err(CommandErrorPayload::new(
            "external_document_changed",
            "the markdown document was changed by another process",
        ));
    }
    Ok(())
}

fn lock_watches(
    watches: &Mutex<HashMap<String, WatchedMarkdownDocument>>,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, WatchedMarkdownDocument>>, CommandErrorPayload>
{
    watches
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("markdown document watches"))
}

pub(crate) fn remove_markdown_document_watch(state: &AppState, window_label: &str) {
    if let Ok(mut watches) = state.markdown_document_watches.lock() {
        watches.remove(window_label);
    }
}

#[tauri::command]
pub fn unwatch_markdown_document(
    window: Window,
    state: State<'_, AppState>,
    path: String,
    generation: u64,
) {
    if let Ok(mut watches) = state.markdown_document_watches.lock() {
        if watches.get(window.label()).is_some_and(|watch| {
            watch.path == PathBuf::from(path.trim()) && watch.generation == generation
        }) {
            watches.remove(window.label());
        }
    }
}

#[tauri::command]
pub fn watch_markdown_document(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    path: String,
    known_content: Option<String>,
) -> Result<MarkdownDocumentDiskStatePayload, CommandErrorPayload> {
    let path_buf = PathBuf::from(path.trim());
    let content = read_disk_content(&path_buf)?;
    let version = disk_version(&content);
    let changed = content_changed(known_content.as_deref(), &content);
    let generation = state
        .next_markdown_document_watch_generation
        .fetch_add(1, Ordering::Relaxed);
    let window_label = window.label().to_owned();
    {
        let mut watches = lock_watches(&state.markdown_document_watches)?;
        watches.insert(
            window_label.clone(),
            WatchedMarkdownDocument {
                path: path_buf.clone(),
                version: version.clone(),
                generation,
            },
        );
    }

    let watches = Arc::clone(&state.markdown_document_watches);
    let io_gate = Arc::clone(&state.markdown_document_io_gate);
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(MARKDOWN_DOCUMENT_WATCH_INTERVAL).await;
            let current = match watches.lock() {
                Ok(guard) => guard.get(&window_label).cloned(),
                Err(_) => break,
            };
            let Some(current) = current.filter(|watch| watch.generation == generation) else {
                break;
            };
            let read_path = current.path.clone();
            let read_gate = Arc::clone(&io_gate);
            let first_read = tauri::async_runtime::spawn_blocking(move || {
                let _gate = read_gate.lock().ok()?;
                read_disk_content(&read_path).ok()
            })
            .await
            .ok()
            .flatten();
            let Some(first_content) = first_read else {
                continue;
            };
            let first_version = disk_version(&first_content);
            if first_version == current.version {
                continue;
            }

            tokio::time::sleep(MARKDOWN_DOCUMENT_STABILITY_DELAY).await;
            let reread_path = current.path.clone();
            let reread_gate = Arc::clone(&io_gate);
            let second_read = tauri::async_runtime::spawn_blocking(move || {
                let _gate = reread_gate.lock().ok()?;
                read_disk_content(&reread_path).ok()
            })
            .await
            .ok()
            .flatten();
            let Some(content) = second_read.filter(|value| value == &first_content) else {
                continue;
            };
            let version = first_version;
            let should_emit = match watches.lock() {
                Ok(mut guard) => match guard.get_mut(&window_label) {
                    Some(watch) if watch.generation == generation && watch.version != version => {
                        watch.version = version.clone();
                        true
                    }
                    _ => false,
                },
                Err(_) => break,
            };
            if should_emit {
                let _ = app.emit_to(
                    &window_label,
                    MARKDOWN_DOCUMENT_EXTERNAL_CHANGE_EVENT,
                    MarkdownDocumentExternalChangePayload {
                        path: current.path.to_string_lossy().into_owned(),
                        content,
                        version,
                    },
                );
            }
        }
    });

    Ok(MarkdownDocumentDiskStatePayload {
        path: path_buf.to_string_lossy().into_owned(),
        content,
        version,
        changed,
        generation,
    })
}

#[tauri::command]
pub fn read_watched_markdown_document(
    window: Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<MarkdownDocumentExternalChangePayload, CommandErrorPayload> {
    let path_buf = PathBuf::from(path.trim());
    let _gate = state
        .markdown_document_io_gate
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("markdown document I/O"))?;
    let content = read_disk_content(&path_buf)?;
    let version = disk_version(&content);
    if let Ok(mut watches) = state.markdown_document_watches.lock() {
        if let Some(watch) = watches.get_mut(window.label()) {
            if watch.path == path_buf {
                watch.version = version.clone();
            }
        }
    }
    Ok(MarkdownDocumentExternalChangePayload {
        path: path_buf.to_string_lossy().into_owned(),
        content,
        version,
    })
}

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

fn saved_markdown_document_payload(
    path: &std::path::Path,
    version: String,
) -> SavedMarkdownDocumentPayload {
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    SavedMarkdownDocumentPayload {
        file_name,
        file_path: path.to_string_lossy().into_owned(),
        disk_version: version,
    }
}

async fn persist_editor_session_snapshot(
    application: Arc<ApplicationService>,
    repository: FileSystemMarkdownDocumentRepository,
    io_gate: Arc<Mutex<()>>,
    watches: Arc<Mutex<HashMap<String, WatchedMarkdownDocument>>>,
    window_label: String,
    session_id: String,
    expected_revision: u64,
    file_path: PathBuf,
    expected_disk_version: Option<String>,
    overwrite_expected_version: Option<String>,
    require_disk_version: bool,
) -> Result<SavedMarkdownDocumentPayload, CommandErrorPayload> {
    let snapshot = application
        .editor_document_persistence_snapshot(&session_id, expected_revision)
        .map_err(CommandErrorPayload::from)?;
    let write_path = file_path;
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = io_gate
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("markdown document I/O"))?;
        if require_disk_version {
            check_disk_version(
                &write_path,
                expected_disk_version.as_deref(),
                overwrite_expected_version.as_deref(),
            )?;
        }
        let mut expected_bytes = Vec::new();
        snapshot.write_to(&mut expected_bytes).map_err(|error| {
            CommandErrorPayload::with_detail(
                "markdown_snapshot_failed",
                "failed to prepare markdown document snapshot",
                error.to_string(),
            )
        })?;
        write_editor_document_snapshot(&repository, &write_path, &snapshot)
            .map_err(CommandErrorPayload::from)?;
        let content = read_disk_content(&write_path)?;
        if content.as_bytes() != expected_bytes {
            return Err(CommandErrorPayload::new(
                "external_document_changed",
                "the markdown document changed during saving",
            ));
        }
        let version = disk_version(&content);
        let saved = saved_markdown_document_payload(&write_path, version.clone());
        application
            .mark_frontend_session_saved_at_revision(
                &session_id,
                expected_revision,
                saved.file_name.clone(),
                Some(saved.file_path.clone()),
            )
            .map_err(CommandErrorPayload::from)?;
        if let Ok(mut guard) = watches.lock() {
            if let Some(watch) = guard.get_mut(&window_label) {
                if watch.path == write_path {
                    watch.version = version.clone();
                }
            }
        }
        Ok::<_, CommandErrorPayload>(saved)
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "markdown_save_task_failed",
            "failed to join markdown save task",
            error.to_string(),
        )
    })?
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
    window: Window,
    state: State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    path: String,
    expected_disk_version: Option<String>,
    overwrite_expected_version: Option<String>,
) -> Result<SavedMarkdownDocumentPayload, CommandErrorPayload> {
    eprintln!(
        "[kmark:ipc] begin command=write_editor_session_markdown_document session={} op=save-{} rev={}",
        session_id, expected_revision, expected_revision
    );
    let trace_session_id = session_id.clone();
    let result = persist_editor_session_snapshot(
        Arc::clone(&state.application),
        state.markdown_document_repository,
        Arc::clone(&state.markdown_document_io_gate),
        Arc::clone(&state.markdown_document_watches),
        window.label().to_owned(),
        session_id,
        expected_revision,
        PathBuf::from(path),
        expected_disk_version,
        overwrite_expected_version,
        true,
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

    let content = read_disk_content(&file_path)?;
    Ok(Some(saved_markdown_document_payload(
        &file_path,
        disk_version(&content),
    )))
}

#[tauri::command]
pub async fn save_editor_session_markdown_document_as_dialog(
    app: AppHandle,
    window: Window,
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
        Arc::clone(&state.markdown_document_io_gate),
        Arc::clone(&state.markdown_document_watches),
        window.label().to_owned(),
        session_id,
        expected_revision,
        file_path,
        None,
        None,
        false,
    )
    .await
    .map(Some)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };

    use super::{check_disk_version, content_changed, disk_version};

    static NEXT_TEST_FILE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn initial_watch_compares_canonical_text_but_versions_disk_bytes() {
        assert!(!content_changed(Some("one\ntwo\n"), "one\r\ntwo\r\n"));
        assert!(content_changed(Some("one\ntwo\n"), "one\r\nchanged\r\n"));
        assert!(!content_changed(None, "changed\n"));
        assert_ne!(disk_version("one\ntwo\n"), disk_version("one\r\ntwo\r\n"));
    }

    #[test]
    fn save_rejects_changed_disk_unless_matching_explicit_overwrite_version() {
        let sequence = NEXT_TEST_FILE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "kmark-external-save-{}-{sequence}.md",
            std::process::id()
        ));
        fs::write(&path, "original\n").expect("create document");
        let original = disk_version("original\n");
        fs::write(&path, "external\n").expect("external edit");
        let external = disk_version("external\n");

        let conflict =
            check_disk_version(&path, Some(&original), None).expect_err("stale save must fail");
        let conflict_code = serde_json::to_value(conflict).expect("serialize error");
        assert_eq!(conflict_code["code"], "external_document_changed");
        check_disk_version(&path, Some(&original), Some(&external))
            .expect("confirmed overwrite of observed version");
        fs::write(&path, "external-again\n").expect("another external edit");
        assert!(check_disk_version(&path, Some(&original), Some(&external)).is_err());

        fs::remove_file(&path).expect("remove document");
    }
}
