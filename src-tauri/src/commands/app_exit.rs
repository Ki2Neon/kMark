use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, Runtime, State, Window};

use super::error::CommandErrorPayload;
use crate::{
    infra::{broadcast_command, TrayCommandKind},
    AppState, MAIN_WINDOW_LABEL,
};

#[tauri::command]
pub fn complete_window_close<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
) -> Result<(), CommandErrorPayload> {
    if window.label() == MAIN_WINDOW_LABEL && !state.should_exit.load(Ordering::SeqCst) {
        super::sub_window::remove_sub_window_source_for_window_label(
            window.app_handle(),
            window.label(),
        );

        return window.hide().map_err(|error| {
            CommandErrorPayload::with_detail(
                "window_hide_failed",
                "failed to hide main window",
                error.to_string(),
            )
        });
    }

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
pub fn complete_app_exit<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) {
    state.should_exit.store(true, Ordering::SeqCst);

    if let Err(error) = broadcast_command(&app, TrayCommandKind::QuitAll) {
        eprintln!("failed to broadcast tray quit-all command: {error}");
    }

    app.exit(0);
}
