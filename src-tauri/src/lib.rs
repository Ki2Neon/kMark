mod commands;
mod domain;
mod infra;
mod usecase;

use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use infra::{
    FileSystemMarkdownDocumentRepository, InMemoryOpenRequestQueue,
    persist_window_state, restore_window_state,
};
use usecase::{collect_markdown_file_paths, enqueue_markdown_open_requests};

const MAIN_WINDOW_LABEL: &str = "main";
const MARKDOWN_OPEN_REQUESTED_EVENT: &str = "markdown-open-requested";
const TRAY_ICON_ID: &str = "main-tray";
const TRAY_SHOW_MENU_ITEM_ID: &str = "tray-show";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const AUTOSTART_HIDDEN_ARG: &str = "--autostart-hidden";

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) markdown_document_repository: FileSystemMarkdownDocumentRepository,
    pub(crate) open_request_queue: InMemoryOpenRequestQueue,
    pub(crate) should_exit: AtomicBool,
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.show();
        let _ = main_window.unminimize();
        let _ = main_window.set_focus();
    }
}

fn hide_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.hide();
    }
}

fn should_start_hidden() -> bool {
    env::args_os()
        .skip(1)
        .any(|arg| arg == OsStr::new(AUTOSTART_HIDDEN_ARG))
}

#[cfg(desktop)]
fn create_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_SHOW_MENU_ITEM_ID, "Show kMark", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_MENU_ITEM_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?
        .clone();

    let _ = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .icon(icon)
        .tooltip("kMark")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_SHOW_MENU_ITEM_ID => {
                focus_main_window(app);
            }
            TRAY_QUIT_MENU_ITEM_ID => {
                app.state::<AppState>()
                    .should_exit
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon<R>, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
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

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_autostart::Builder::new()
            .args([AUTOSTART_HIDDEN_ARG])
            .app_name("kMark")
            .build(),
    );

    let builder = builder
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            match event {
                tauri::WindowEvent::Resized(_) => {
                    if let Err(error) = persist_window_state(window.app_handle(), window) {
                        eprintln!("failed to persist main window state: {error}");
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if let Err(error) = persist_window_state(window.app_handle(), window) {
                        eprintln!("failed to persist main window state: {error}");
                    }

                    if !window
                        .app_handle()
                        .state::<AppState>()
                        .should_exit
                        .load(Ordering::SeqCst)
                    {
                        api.prevent_close();
                        hide_main_window(window.app_handle());
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

            #[cfg(desktop)]
            create_tray(&app_handle)?;

            handle_startup_markdown_open_requests(&app_handle);

            if !should_start_hidden() {
                focus_main_window(&app_handle);
            }

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
