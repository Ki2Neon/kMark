mod commands;
mod dto;
mod infra;
mod ports;
mod usecase;

use std::{
    collections::HashMap,
    env,
    ffi::OsStr,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

use infra::{
    load_desktop_layout_preferences, load_editor_draft, load_editor_preferences,
    load_preview_preferences, load_recent_files, load_theme_preferences, persist_window_state,
    restore_window_state, FileSystemAssetRepository, FileSystemMarkdownDocumentRepository,
    InMemoryOpenRequestQueue, TrayCommandKind, TrayCoordinator, TrayCoordinatorError,
    SUB_WINDOW_REGISTRY_HEARTBEAT_INTERVAL, TRAY_COORDINATOR_POLL_INTERVAL,
};
use kmark_core::{
    DesktopLayoutPreferences, EditorPreferences, PreviewPreferences, RecentFiles, StoredEdit,
    ThemePreferences,
};
use usecase::{collect_markdown_file_paths, enqueue_markdown_open_requests};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ICON_ID: &str = "main-tray";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const TRAY_UNTITLED_WINDOW_LABEL_PREFIX: &str = "tray-untitled";
pub(crate) const SUB_WINDOW_LABEL_PREFIX: &str = "subwindow-";
const TRAY_UNTITLED_WINDOW_URL: &str = "index.html?kmarkInitialDocument=new-untitled";
const AUTOSTART_HIDDEN_ARG: &str = "--autostart-hidden";
const APP_EXIT_REQUESTED_EVENT: &str = "app-exit-requested";
const WINDOW_CLOSE_REQUESTED_EVENT: &str = "window-close-requested";

#[derive(Debug, thiserror::Error)]
enum TrayRuntimeError {
    #[error(transparent)]
    Coordinator(#[from] TrayCoordinatorError),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) asset_repository: FileSystemAssetRepository,
    pub(crate) markdown_document_repository: FileSystemMarkdownDocumentRepository,
    pub(crate) open_request_queue: InMemoryOpenRequestQueue,
    pub(crate) theme_preferences: Mutex<ThemePreferences>,
    pub(crate) desktop_layout_preferences: Mutex<DesktopLayoutPreferences>,
    pub(crate) editor_preferences: Mutex<EditorPreferences>,
    pub(crate) editor_draft: Mutex<Option<StoredEdit>>,
    pub(crate) preview_preferences: Mutex<PreviewPreferences>,
    pub(crate) recent_files: Mutex<RecentFiles>,
    pub(crate) sub_window_sources: Mutex<HashMap<String, dto::SubWindowStatePayload>>,
    pub(crate) sub_window_browser_tokens: Mutex<HashMap<String, String>>,
    pub(crate) should_exit: AtomicBool,
    pub(crate) next_untitled_window_sequence: AtomicU64,
    pub(crate) next_sub_window_sequence: AtomicU64,
    pub(crate) next_sandbox_browser_sequence: AtomicU64,
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

fn should_start_hidden() -> bool {
    env::args_os()
        .skip(1)
        .any(|arg| arg == OsStr::new(AUTOSTART_HIDDEN_ARG))
}

fn create_new_untitled_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let label = next_untitled_window_label(app);
    let window =
        WebviewWindowBuilder::new(app, label, WebviewUrl::App(TRAY_UNTITLED_WINDOW_URL.into()))
            .title("untitled.md - kMark")
            .inner_size(1280.0, 860.0)
            .min_inner_size(50.0, 50.0)
            .visible(true)
            .focused(true)
            .build()?;

    let _ = window.set_focus();

    Ok(())
}

fn next_untitled_window_label<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_untitled_window_sequence
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    format!("{TRAY_UNTITLED_WINDOW_LABEL_PREFIX}-{next_sequence}")
}

fn request_new_untitled_window<R: tauri::Runtime + 'static>(app: &tauri::AppHandle<R>) {
    let app_handle = app.clone();

    std::thread::spawn(move || {
        if let Err(error) = create_new_untitled_window(&app_handle) {
            eprintln!("failed to create tray untitled window: {error}");
        }
    });
}

fn request_app_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    focus_main_window(app);

    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = main_window.emit_to(MAIN_WINDOW_LABEL, APP_EXIT_REQUESTED_EVENT, ()) {
            eprintln!("failed to request app exit confirmation: {error}");
        }
    }
}

#[cfg(desktop)]
fn create_tray<R: tauri::Runtime + 'static>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_MENU_ITEM_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_item])?;

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
            TRAY_QUIT_MENU_ITEM_ID => {
                request_app_exit(app);
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
                request_new_untitled_window(tray.app_handle());
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
            // Keep stale commands from older versions inert instead of restoring hidden windows.
        }
        TrayCommandKind::QuitAll => {
            request_app_exit(app);
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
fn maybe_register_tray<R: tauri::Runtime + 'static>(
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

fn start_sub_window_registry_worker<R: tauri::Runtime + 'static>(app: &tauri::AppHandle<R>) {
    let worker_app = app.clone();

    std::thread::spawn(move || loop {
        if worker_app
            .state::<AppState>()
            .should_exit
            .load(Ordering::SeqCst)
        {
            break;
        }

        commands::sub_window::heartbeat_sub_window_sources(&worker_app);

        std::thread::sleep(SUB_WINDOW_REGISTRY_HEARTBEAT_INTERVAL);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(AppState::default());

    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(
        tauri_plugin_autostart::Builder::new()
            .args([AUTOSTART_HIDDEN_ARG])
            .app_name("kMark")
            .build(),
    );

    let builder = builder.plugin(tauri_plugin_dialog::init());

    let builder = builder
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_) => {
                if window.label() != MAIN_WINDOW_LABEL {
                    return;
                }

                if let Err(error) = persist_window_state(window.app_handle(), window) {
                    eprintln!("failed to persist main window state: {error}");
                }
            }
            tauri::WindowEvent::Focused(true) => {
                if window.label().starts_with(SUB_WINDOW_LABEL_PREFIX) {
                    return;
                }

                if let Err(error) =
                    commands::sub_window::set_active_sub_window_source_for_window_label(
                        window.app_handle(),
                        window.label(),
                    )
                {
                    eprintln!("failed to activate subwindow source: {}", error.message());
                }
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window
                    .label()
                    .starts_with(commands::external_link::SANDBOX_BROWSER_LABEL_PREFIX)
                {
                    if let Some(webview_window) =
                        window.app_handle().get_webview_window(window.label())
                    {
                        commands::external_link::clear_sandbox_browser_browsing_data(
                            &webview_window,
                        );
                    }
                    return;
                }

                if window.label().starts_with(SUB_WINDOW_LABEL_PREFIX) {
                    commands::sub_window::remove_sub_window_state(
                        window.app_handle(),
                        window.label(),
                    );
                    return;
                }

                if window.label() == MAIN_WINDOW_LABEL {
                    if let Err(error) = persist_window_state(window.app_handle(), window) {
                        eprintln!("failed to persist main window state: {error}");
                    }
                }

                if !window
                    .app_handle()
                    .state::<AppState>()
                    .should_exit
                    .load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    if let Err(error) =
                        window.emit_to(window.label(), WINDOW_CLOSE_REQUESTED_EVENT, ())
                    {
                        eprintln!("failed to request window close confirmation: {error}");
                    }
                }
            }
            tauri::WindowEvent::Destroyed => {
                if window
                    .label()
                    .starts_with(commands::external_link::SANDBOX_BROWSER_LABEL_PREFIX)
                {
                    commands::external_link::remove_sandbox_browser_data_directory(
                        window.app_handle(),
                        window.label(),
                    );
                    return;
                }

                if window.label().starts_with(SUB_WINDOW_LABEL_PREFIX) {
                    commands::external_link::close_sub_window_external_browsers_for_window_label(
                        window.app_handle(),
                        window.label(),
                    );
                    return;
                }

                commands::sub_window::remove_sub_window_source_for_window_label(
                    window.app_handle(),
                    window.label(),
                );
            }
            _ => {}
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Err(error) = restore_window_state(&app_handle, &main_window) {
                    eprintln!("failed to restore main window state: {error}");
                }
            }

            match load_preview_preferences(&app_handle) {
                Ok(Some(preview_preferences)) => {
                    if let Ok(mut current_preview_preferences) =
                        app_handle.state::<AppState>().preview_preferences.lock()
                    {
                        *current_preview_preferences = preview_preferences;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load preview preferences: {error}");
                }
            }

            match load_theme_preferences(&app_handle) {
                Ok(Some(theme_preferences)) => {
                    if let Ok(mut current_theme_preferences) =
                        app_handle.state::<AppState>().theme_preferences.lock()
                    {
                        *current_theme_preferences = theme_preferences;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load theme preferences: {error}");
                }
            }

            match load_desktop_layout_preferences(&app_handle) {
                Ok(Some(desktop_layout_preferences)) => {
                    if let Ok(mut current_desktop_layout_preferences) = app_handle
                        .state::<AppState>()
                        .desktop_layout_preferences
                        .lock()
                    {
                        *current_desktop_layout_preferences = desktop_layout_preferences;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load desktop layout preferences: {error}");
                }
            }

            match load_editor_preferences(&app_handle) {
                Ok(Some(editor_preferences)) => {
                    if let Ok(mut current_editor_preferences) =
                        app_handle.state::<AppState>().editor_preferences.lock()
                    {
                        *current_editor_preferences = editor_preferences.clone();
                    }

                    if let Err(error) = commands::editor_preferences::sync_autostart_preference(
                        &app_handle,
                        &editor_preferences,
                    ) {
                        eprintln!("failed to sync autostart preference: {}", error.message());
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load editor preferences: {error}");
                }
            }

            match load_editor_draft(&app_handle) {
                Ok(Some(editor_draft)) => {
                    if let Ok(mut current_editor_draft) =
                        app_handle.state::<AppState>().editor_draft.lock()
                    {
                        *current_editor_draft = Some(editor_draft);
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load editor draft: {error}");
                }
            }

            match load_recent_files(&app_handle) {
                Ok(Some(recent_files)) => {
                    if let Ok(mut current_recent_files) =
                        app_handle.state::<AppState>().recent_files.lock()
                    {
                        *current_recent_files = recent_files;
                    }
                }
                Ok(None) => {}
                Err(error) => {
                    eprintln!("failed to load recent files: {error}");
                }
            }

            #[cfg(desktop)]
            start_tray_coordinator(&app_handle)?;

            start_sub_window_registry_worker(&app_handle);

            handle_startup_markdown_open_requests(&app_handle);

            if !should_start_hidden() {
                focus_main_window(&app_handle);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_exit::complete_app_exit,
            commands::app_exit::complete_window_close,
            commands::asset_import::import_markdown_asset_data,
            commands::asset_import::import_markdown_asset_files,
            commands::asset_import::list_markdown_path_suggestions,
            commands::desktop_layout_preferences::get_desktop_layout_preferences,
            commands::desktop_layout_preferences::set_desktop_layout_preferences,
            commands::editor_draft::get_editor_draft,
            commands::editor_draft::set_editor_draft,
            commands::editor_preferences::get_editor_preferences,
            commands::editor_preferences::set_editor_preferences,
            commands::external_link::open_external_link,
            commands::external_link::open_sub_window_external_browser,
            commands::external_link::resize_sub_window_external_browser,
            commands::external_link::begin_sub_window_external_browser_close,
            commands::external_link::show_sub_window_external_browser,
            commands::external_link::close_sub_window_external_browser,
            commands::external_link::sub_window_browser_event,
            commands::file_open::clear_pending_markdown_open_requests,
            commands::file_open::open_markdown_document_dialog,
            commands::file_open::open_markdown_document_folder,
            commands::markdown_render::render_markdown_preview,
            commands::preview_preferences::get_preview_preferences,
            commands::preview_preferences::set_preview_preferences,
            commands::recent_files::get_recent_files,
            commands::recent_files::record_recent_file,
            commands::sub_window::activate_sub_window_source,
            commands::sub_window::get_sub_window_source_state,
            commands::sub_window::get_sub_window_sources,
            commands::sub_window::open_sub_window,
            commands::sub_window::publish_sub_window_source_state,
            commands::sub_window::register_sub_window_source,
            commands::sub_window::request_sub_window_source_line_selection,
            commands::sub_window::take_sub_window_source_line_selection_requests,
            commands::sub_window::unregister_sub_window_source,
            commands::file_open::read_markdown_document_at_path,
            commands::file_open::save_markdown_document_as_dialog,
            commands::system_fonts::list_system_font_families,
            commands::file_open::take_pending_markdown_open_requests,
            commands::file_open::write_markdown_document,
            commands::theme_preferences::get_theme_preferences,
            commands::theme_preferences::set_theme_preferences,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
