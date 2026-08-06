mod desktop_layout;
mod editor_draft;
mod editor_preferences;
mod editor_state;
mod generated_svg;
mod kmark_param_schema;
mod markdown_document;
mod markdown_document_error;
mod math_render;
mod plantuml;
mod preview_preferences;
mod recent_files;
mod render_markdown_preview;
pub mod table_format;
mod theme;

pub use desktop_layout::{
    DesktopLayoutPreferences, DEFAULT_DESKTOP_SPLIT_RATIO, MAX_DESKTOP_SPLIT_RATIO,
    MIN_DESKTOP_SPLIT_RATIO,
};
pub use editor_draft::StoredEdit;
pub use editor_draft::{ensure_markdown_file_name, DEFAULT_FILE_NAME};
pub use editor_preferences::{
    resolve_app_font_family, resolve_edit_font_family, sanitize_font_preference, AppFontId,
    EditFontId, EditorPreferences, MultiCursorModifier, StartupEditMode, DEFAULT_EDIT_FONT_SIZE_PX,
    DEFAULT_LINE_WRAPPING_ENABLED, DEFAULT_SYSTEM_FONT_SIZE_PX, MAX_EDIT_FONT_SIZE_PX,
    MAX_SYSTEM_FONT_SIZE_PX, MIN_EDIT_FONT_SIZE_PX, MIN_SYSTEM_FONT_SIZE_PX,
};
pub use editor_state::{
    create_blank_editor_state, create_initial_editor_state, create_startup_editor_state,
    derive_editor_stats, reduce_editor_state, EditorState, EditorStateAction, EditorStats,
    DEFAULT_MARKDOWN,
};
pub use generated_svg::{
    finalize_generated_svg, GeneratedSvgError, GeneratedSvgPresentation, MAX_GENERATED_SVG_BYTES,
};
pub use kmark_param_schema::{kmark_param_schema_json, KMARK_PARAM_SCHEMA_VERSION};
pub use markdown_document::{is_supported_markdown_path, MarkdownDocument};
pub use markdown_document_error::MarkdownDocumentError;
pub use plantuml::{normalize_plantuml_source, PlantUmlSourceError, MAX_PLANTUML_SOURCE_BYTES};
pub use preview_preferences::{
    normalize_plantuml_https_hosts, PreviewDisplayMode, PreviewPreferences,
};
pub use recent_files::{RecentFile, RecentFiles, MAX_RECENT_FILES};
pub use render_markdown_preview::{
    render_markdown_preview, render_markdown_preview_with_file_path,
    render_markdown_preview_with_file_path_and_model_assets, CssLength, KmarkModelAssetError,
    KmarkModelAssetResolution, PageChromeConfig, PageChromeRegionConfig, PageNumberConfig,
    PageNumberPosition, PageNumberStyle, PageStyle, PreviewTextStyle, RenderedMarkdownPreview,
    RenderedPage,
};
pub use table_format::{
    format_markdown_tables, format_markdown_tables_in_line_ranges, format_table_block,
    visual_width, FormatResult, SourceRange, TableDiagnostic, TableDiagnosticKind,
    TableFormatError, TableFormatLineRange, TableFormatOptions,
};
pub use theme::{AppThemeId, ThemePreferences};
