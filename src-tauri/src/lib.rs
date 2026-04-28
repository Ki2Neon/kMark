mod commands;
mod domain;
mod infra;
mod usecase;

use std::{
    env,
    ffi::OsStr,
    path::PathBuf,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
};

use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use infra::{
    FileSystemMarkdownDocumentRepository, InMemoryOpenRequestQueue,
    TRAY_COORDINATOR_POLL_INTERVAL, TrayCommandKind, TrayCoordinator, TrayCoordinatorError,
    broadcast_command, persist_window_state, restore_window_state,
};
use usecase::{collect_markdown_file_paths, enqueue_markdown_open_requests};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ICON_ID: &str = "main-tray";
const TRAY_SHOW_MENU_ITEM_ID: &str = "tray-show";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const AUTOSTART_HIDDEN_ARG: &str = "--autostart-hidden";

#[derive(Debug, thiserror::Error)]
enum TrayRuntimeError {
    #[error(transparent)]
    Coordinator(#[from] TrayCoordinatorError),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) markdown_document_repository: FileSystemMarkdownDocumentRepository,
    pub(crate) open_request_queue: InMemoryOpenRequestQueue,
    pub(crate) should_exit: AtomicBool,
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.show();
        let _ = main_window.unminimize();
    }
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    show_main_window(app);

    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
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
    let show_item =
        MenuItem::with_id(app, TRAY_SHOW_MENU_ITEM_ID, "Show All kMark", true, None::<&str>)?;
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
                if let Err(error) = broadcast_command(app, TrayCommandKind::ShowAll) {
                    eprintln!("failed to broadcast tray show-all command: {error}");
                }
                focus_main_window(app);
            }
            TRAY_QUIT_MENU_ITEM_ID => {
                if let Err(error) = broadcast_command(app, TrayCommandKind::QuitAll) {
                    eprintln!("failed to broadcast tray quit-all command: {error}");
                }
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
                if let Err(error) = broadcast_command(tray.app_handle(), TrayCommandKind::ShowAll) {
                    eprintln!("failed to broadcast tray show-all command: {error}");
                }
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn queue_markdown_open_requests<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    file_paths: Vec<PathBuf>,
) {
    if file_paths.is_empty() {
        return;
    }

    let state = app.state::<AppState>();

    if enqueue_markdown_open_requests(&state.open_request_queue, file_paths).is_err() {
        return;
    }

    focus_main_window(app);
}

fn handle_startup_markdown_open_requests<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let current_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let file_paths = collect_markdown_file_paths(env::args_os(), &current_dir);

    queue_markdown_open_requests(app, file_paths);
}

#[cfg(desktop)]
fn handle_tray_command<R: tauri::Runtime>(app: &tauri::AppHandle<R>, command: TrayCommandKind) {
    match command {
        TrayCommandKind::ShowAll => {
            show_main_window(app);
        }
        TrayCommandKind::QuitAll => {
            app.state::<AppState>()
                .should_exit
                .store(true, Ordering::SeqCst);
            app.exit(0);
        }
    }
}

#[cfg(desktop)]
fn lock_tray_coordinator<'a>(
    coordinator: &'a Arc<Mutex<TrayCoordinator>>,
) -> MutexGuard<'a, TrayCoordinator> {
    match coordinator.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[cfg(desktop)]
fn maybe_register_tray<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    coordinator: &Arc<Mutex<TrayCoordinator>>,
) -> Result<(), TrayRuntimeError> {
    let needs_tray_registration = {
        let mut coordinator = lock_tray_coordinator(coordinator);
        let _ = coordinator.try_claim_ownership(app)?;
        coordinator.needs_tray_registration()
    };

    if !needs_tray_registration {
        return Ok(());
    }

    create_tray(app)?;
    lock_tray_coordinator(coordinator).mark_tray_registered();

    Ok(())
}

#[cfg(desktop)]
fn start_tray_coordinator<R: tauri::Runtime + 'static>(
    app: &tauri::AppHandle<R>,
) -> Result<(), TrayRuntimeError> {
    let coordinator = Arc::new(Mutex::new(TrayCoordinator::initialize(app)?));

    maybe_register_tray(app, &coordinator)?;

    let worker_app = app.clone();
    let worker_coordinator = Arc::clone(&coordinator);
    std::thread::spawn(move || loop {
        if worker_app
            .state::<AppState>()
            .should_exit
            .load(Ordering::SeqCst)
        {
            break;
        }

        if let Err(error) = maybe_register_tray(&worker_app, &worker_coordinator) {
            eprintln!("failed to register tray owner: {error}");
        }

        let pending_command = {
            let mut coordinator = lock_tray_coordinator(&worker_coordinator);
            match coordinator.take_pending_command(&worker_app) {
                Ok(command) => command,
                Err(error) => {
                    eprintln!("failed to poll tray command: {error}");
                    None
                }
            }
        };

        if let Some(command) = pending_command {
            handle_tray_command(&worker_app, command);
        }

        std::thread::sleep(TRAY_COORDINATOR_POLL_INTERVAL);
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(AppState::default());

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
            start_tray_coordinator(&app_handle)?;

            handle_startup_markdown_open_requests(&app_handle);

            if !should_start_hidden() {
                focus_main_window(&app_handle);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_instance::current_app_instance_id,
            commands::file_open::clear_pending_markdown_open_requests,
            commands::markdown_render::render_markdown_preview,
            commands::file_open::take_pending_markdown_open_requests,
            commands::file_open::write_markdown_document,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
