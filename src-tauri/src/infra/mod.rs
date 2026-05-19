mod desktop_layout_preferences_store;
mod editor_draft_store;
mod editor_preferences_store;
mod file_system_asset_repository;
mod file_system_markdown_document_repository;
mod in_memory_open_request_queue;
mod json_state_store;
mod preview_preferences_store;
mod recent_files_store;
mod sub_window_registry;
mod theme_preferences_store;
mod tray_coordinator;
mod window_state;

pub(crate) use desktop_layout_preferences_store::{
    load_desktop_layout_preferences, persist_desktop_layout_preferences,
};
pub(crate) use editor_draft_store::{load_editor_draft, persist_editor_draft};
pub(crate) use editor_preferences_store::{load_editor_preferences, persist_editor_preferences};
pub(crate) use file_system_asset_repository::FileSystemAssetRepository;
pub(crate) use file_system_markdown_document_repository::FileSystemMarkdownDocumentRepository;
pub(crate) use in_memory_open_request_queue::InMemoryOpenRequestQueue;
pub(crate) use json_state_store::JsonStateStoreError;
pub(crate) use preview_preferences_store::{load_preview_preferences, persist_preview_preferences};
pub(crate) use recent_files_store::{load_recent_files, persist_recent_files};
pub(crate) use sub_window_registry::{
    activate_sub_window_registry_source, get_sub_window_registry_source_state,
    get_sub_window_registry_sources, publish_sub_window_registry_source_state,
    push_sub_window_registry_line_selection_request, register_sub_window_registry_source,
    remove_sub_window_registry_source, take_sub_window_registry_line_selection_requests,
    touch_sub_window_registry_sources, SubWindowRegistryError,
    SUB_WINDOW_REGISTRY_HEARTBEAT_INTERVAL,
};
pub(crate) use theme_preferences_store::{load_theme_preferences, persist_theme_preferences};
pub(crate) use tray_coordinator::{
    broadcast_command, TrayCommandKind, TrayCoordinator, TrayCoordinatorError,
    TRAY_COORDINATOR_POLL_INTERVAL,
};
pub(crate) use window_state::{persist_window_state, restore_window_state};
