mod desktop_layout;
mod editor_state;
mod editor_draft;
mod editor_preferences;
mod markdown_document;
mod markdown_document_error;
mod preview_preferences;
mod preview_window_state;
mod render_markdown_preview;
mod theme;

pub use desktop_layout::{
    DesktopLayoutPreferences, DEFAULT_DESKTOP_SPLIT_RATIO, MAX_DESKTOP_SPLIT_RATIO,
    MIN_DESKTOP_SPLIT_RATIO,
};
pub use editor_state::{
    create_blank_editor_state, create_initial_editor_state, create_startup_editor_state,
    derive_editor_stats, reduce_editor_state, EditorState, EditorStateAction, EditorStats,
    DEFAULT_MARKDOWN,
};
pub use editor_draft::StoredEdit;
pub use editor_draft::{ensure_markdown_file_name, DEFAULT_FILE_NAME};
pub use editor_preferences::{
    resolve_app_font_family, resolve_edit_font_family, sanitize_font_preference, AppFontId,
    EditFontId, EditorPreferences, MultiCursorModifier, StartupEditMode,
    DEFAULT_EDIT_FONT_SIZE_PX, MAX_EDIT_FONT_SIZE_PX, MIN_EDIT_FONT_SIZE_PX,
};
pub use markdown_document::{is_supported_markdown_path, MarkdownDocument};
pub use markdown_document_error::MarkdownDocumentError;
pub use preview_preferences::{PreviewDisplayMode, PreviewPreferences};
pub use preview_window_state::{
    PreviewWindowEditJumpRequest, PreviewWindowSnapshot, PreviewWindowState,
};
pub use render_markdown_preview::{render_markdown_preview, RenderedMarkdownPreview};
pub use theme::{AppThemeId, ThemePreferences};
