use std::sync::{atomic::Ordering, MutexGuard};

use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

use super::error::CommandErrorPayload;
use crate::{
    infra::{broadcast_command, TrayCommandKind},
    usecase::{AppExitAction, AppExitCoordinator},
    AppState, MAIN_WINDOW_LABEL, TRAY_UNTITLED_WINDOW_LABEL_PREFIX,
};

const APP_EXIT_REQUESTED_EVENT: &str = "app-exit-requested";

fn lock_exit_coordinator(state: &AppState) -> MutexGuard<'_, AppExitCoordinator> {
    match state.app_exit_coordinator.lock() {
        Ok(coordinator) => coordinator,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn is_editor_window_label(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL || label.starts_with(TRAY_UNTITLED_WINDOW_LABEL_PREFIX)
}

fn finalize_app_exit<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>()
        .should_exit
        .store(true, Ordering::SeqCst);

    if let Err(error) = broadcast_command(app, TrayCommandKind::QuitAll) {
        eprintln!("failed to broadcast tray quit-all command: {error}");
    }

    app.exit(0);
}

fn drive_app_exit<R: Runtime>(app: &AppHandle<R>, mut action: AppExitAction) {
    loop {
        match action {
            AppExitAction::None => return,
            AppExitAction::Exit => {
                finalize_app_exit(app);
                return;
            }
            AppExitAction::RequestWindow(window_label) => {
                if let Some(window) = app.get_webview_window(&window_label) {
                    if window
                        .emit_to(&window_label, APP_EXIT_REQUESTED_EVENT, ())
                        .is_ok()
                    {
                        return;
                    }
                }

                eprintln!("skipping unavailable app-exit window: {window_label}");
                action =
                    lock_exit_coordinator(&app.state::<AppState>()).complete_window(&window_label);
            }
        }
    }
}

pub(crate) fn request_app_exit<R: Runtime>(app: &AppHandle<R>) {
    let editor_window_labels = app
        .webview_windows()
        .into_keys()
        .filter(|label| is_editor_window_label(label))
        .collect::<Vec<_>>();
    let action = lock_exit_coordinator(&app.state::<AppState>()).begin(editor_window_labels);

    drive_app_exit(app, action);
}

pub(crate) fn is_app_exit_in_progress<R: Runtime>(app: &AppHandle<R>) -> bool {
    lock_exit_coordinator(&app.state::<AppState>()).is_in_progress()
}

#[tauri::command]
pub fn complete_window_close<R: Runtime>(window: Window<R>) -> Result<(), CommandErrorPayload> {
    super::sub_window::remove_sub_window_source_for_window_label(
        window.app_handle(),
        window.label(),
    );

    window.destroy().map_err(|error| {
        CommandErrorPayload::with_detail(
            "window_close_failed",
            "failed to close window",
            error.to_string(),
        )
    })
}

#[tauri::command]
pub fn complete_app_exit<R: Runtime>(app: AppHandle<R>, window: Window<R>) {
    let action = lock_exit_coordinator(&app.state::<AppState>()).complete_window(window.label());
    drive_app_exit(&app, action);
}

#[tauri::command]
pub fn cancel_app_exit<R: Runtime>(app: AppHandle<R>, window: Window<R>) {
    lock_exit_coordinator(&app.state::<AppState>()).cancel(window.label());
}

#[tauri::command]
pub fn reveal_app_exit_confirmation<R: Runtime>(
    window: Window<R>,
) -> Result<(), CommandErrorPayload> {
    window.show().map_err(|error| {
        CommandErrorPayload::with_detail(
            "window_show_failed",
            "failed to show app exit confirmation window",
            error.to_string(),
        )
    })?;
    window.unminimize().map_err(|error| {
        CommandErrorPayload::with_detail(
            "window_unminimize_failed",
            "failed to restore app exit confirmation window",
            error.to_string(),
        )
    })?;
    window.set_focus().map_err(|error| {
        CommandErrorPayload::with_detail(
            "window_focus_failed",
            "failed to focus app exit confirmation window",
            error.to_string(),
        )
    })
}
