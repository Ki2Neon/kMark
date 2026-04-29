mod file_system_markdown_document_repository;
mod in_memory_open_request_queue;
mod preview_preferences_store;
mod preview_window_runtime;
mod tray_coordinator;
mod window_state;

pub(crate) use file_system_markdown_document_repository::FileSystemMarkdownDocumentRepository;
pub(crate) use in_memory_open_request_queue::InMemoryOpenRequestQueue;
pub(crate) use preview_preferences_store::{
    load_preview_preferences, persist_preview_preferences, PreviewPreferencesStoreError,
};
pub(crate) use preview_window_runtime::{
    emit_main_window_preview_jump_request, emit_preview_window_state_updated,
    show_or_create_preview_window, PREVIEW_PREFERENCES_UPDATED_EVENT,
};
pub(crate) use tray_coordinator::{
    broadcast_command, TrayCommandKind, TrayCoordinator, TrayCoordinatorError,
    TRAY_COORDINATOR_POLL_INTERVAL,
};
pub(crate) use window_state::{persist_window_state, restore_window_state};
