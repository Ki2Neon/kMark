mod commands;
mod domain;
mod infra;
mod usecase;

use std::{env, path::{Path, PathBuf}};

use tauri::{Emitter, Manager};

use infra::{
    FileSystemMarkdownDocumentRepository, InMemoryOpenRequestQueue,
    persist_window_state, restore_window_state,
};
use usecase::{collect_markdown_file_paths, enqueue_markdown_open_requests};

const MAIN_WINDOW_LABEL: &str = "main";
const MARKDOWN_OPEN_REQUESTED_EVENT: &str = "markdown-open-requested";

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) markdown_document_repository: FileSystemMarkdownDocumentRepository,
    pub(crate) open_request_queue: InMemoryOpenRequestQueue,
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.show();
        let _ = main_window.unminimize();
        let _ = main_window.set_focus();
    }
}

fn queue_markdown_open_requests<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    file_paths: Vec<PathBuf>,
    notify_frontend: bool,
) {
    if file_paths.is_empty() {
        return;
    }

    let state = app.state::<AppState>();

    if enqueue_markdown_open_requests(&state.open_request_queue, file_paths).is_err() {
        return;
    }

    focus_main_window(app);

    if notify_frontend {
        let _ = app.emit_to(MAIN_WINDOW_LABEL, MARKDOWN_OPEN_REQUESTED_EVENT, ());
    }
}

fn handle_startup_markdown_open_requests<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let current_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let file_paths = collect_markdown_file_paths(env::args_os(), &current_dir);

    queue_markdown_open_requests(app, file_paths, false);
}

fn handle_secondary_instance_markdown_open_requests<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    args: Vec<String>,
    cwd: String,
) {
    let current_dir = Path::new(&cwd);
    let file_paths = collect_markdown_file_paths(args, current_dir);

    queue_markdown_open_requests(app, file_paths, true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(AppState::default());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        handle_secondary_instance_markdown_open_requests(app, args, cwd);
    }));

    let builder = builder
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            match event {
                tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::CloseRequested { .. } => {
                    if let Err(error) = persist_window_state(window.app_handle(), window) {
                        eprintln!("failed to persist main window state: {error}");
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Err(error) = restore_window_state(&app_handle, &main_window) {
                    eprintln!("failed to restore main window state: {error}");
                }
            }

            handle_startup_markdown_open_requests(&app_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::file_open::clear_pending_markdown_open_requests,
            commands::file_open::take_pending_markdown_open_requests,
            commands::file_open::write_markdown_document,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
