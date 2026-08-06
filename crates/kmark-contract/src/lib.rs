use kmark_core::{
    DesktopLayoutPreferences, EditorPreferences, EditorState, EditorStateAction, EditorStats,
    MarkdownDocumentError, PageChromeConfig, PageChromeRegionConfig, PageNumberConfig, PageStyle,
    PreviewDisplayMode, PreviewPreferences, PreviewTextStyle, RecentFile, RecentFiles,
    RenderedPage, StoredEdit, TableDiagnostic, TableDiagnosticKind, ThemePreferences,
};
use serde::{Deserialize, Serialize};

pub const STATE_SCHEMA_VERSION: u32 = 1;
pub const MAX_JAVASCRIPT_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct StateEnvelope<T> {
    pub schema_version: u32,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub revision: u64,
    pub payload: T,
}

impl<T> StateEnvelope<T> {
    pub fn new(revision: u64, payload: T) -> Self {
        Self {
            schema_version: STATE_SCHEMA_VERSION,
            revision,
            payload,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct CommandErrorPayload {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

impl CommandErrorPayload {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(code: &str, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn state_poisoned(context: &str) -> Self {
        Self::new(
            "state_poisoned",
            format!("failed to access {context} state"),
        )
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct GeneratedSvgPresentationPayload {
    pub root_style: Option<String>,
    pub position: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct FinalizeGeneratedSvgRequestPayload {
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub revision: u64,
    pub render_id: String,
    pub raw_svg: String,
    pub presentation: GeneratedSvgPresentationPayload,
    #[serde(default)]
    pub https_hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct FinalizeGeneratedSvgResultPayload {
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub revision: u64,
    pub render_id: String,
    pub svg: String,
}

impl From<MarkdownDocumentError> for CommandErrorPayload {
    fn from(error: MarkdownDocumentError) -> Self {
        match error {
            MarkdownDocumentError::UnsupportedPath(path) => Self::with_detail(
                "unsupported_markdown_path",
                "unsupported markdown file path",
                path,
            ),
            MarkdownDocumentError::NotFound(path) => Self::with_detail(
                "markdown_document_not_found",
                "markdown document not found",
                path,
            ),
            MarkdownDocumentError::ReadFailed { path, source } => Self::with_detail(
                "markdown_document_read_failed",
                format!("failed to read markdown document: {path}"),
                source.to_string(),
            ),
            MarkdownDocumentError::WriteFailed { path, source } => Self::with_detail(
                "markdown_document_write_failed",
                format!("failed to write markdown document: {path}"),
                source.to_string(),
            ),
            MarkdownDocumentError::OpenRequestQueuePoisoned => Self::new(
                "open_request_queue_poisoned",
                "failed to access pending markdown open request queue",
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct MarkdownDocumentPayload {
    pub file_name: String,
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SavedMarkdownDocumentPayload {
    pub file_name: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct ImportedMarkdownAssetPayload {
    pub original_path: String,
    pub copied_path: String,
    pub relative_path: String,
    pub markdown_text: String,
    pub asset_kind: ImportedAssetKindPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct MarkdownAssetDataPayload {
    pub file_name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum ImportedAssetKindPayload {
    Image,
    Video,
    Model,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum MarkdownPathSuggestionFilterPayload {
    All,
    Extensions { extensions: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum MarkdownPathSuggestionEntryKindPayload {
    Directory,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct MarkdownPathSuggestionPayload {
    pub label: String,
    pub insert_text: String,
    pub relative_path: String,
    pub entry_kind: MarkdownPathSuggestionEntryKindPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct OpenSubWindowExternalBrowserResponsePayload {
    pub browser_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowBrowserBoundsPayload {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowBrowserEventPayload {
    #[serde(default)]
    pub background_color: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub zoom: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct FormatMarkdownTablesPayload {
    pub text: String,
    pub diagnostics: Vec<TableDiagnosticPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct TableDiagnosticPayload {
    pub kind: TableDiagnosticKindPayload,
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
    pub range: Option<SourceRangePayload>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum TableDiagnosticKindPayload {
    InvalidLeftMerge,
    InvalidUpMerge,
    NonRectangularMerge,
    ColumnCountMismatch,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SourceRangePayload {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct PageStylePayload {
    pub width: String,
    pub height: String,
    pub margin_top: String,
    pub margin_right: String,
    pub margin_bottom: String,
    pub margin_left: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct PreviewTextStylePayload {
    pub font_size: String,
    pub font_family: String,
    pub heading_font_family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct PageNumberConfigPayload {
    pub position: String,
    pub format: String,
    pub start: u32,
    pub reset: bool,
    pub count: bool,
    pub visible: bool,
    pub style: String,
    pub font_size: String,
    pub color: String,
    pub margin_top: String,
    pub margin_bottom: String,
    pub margin_left: String,
    pub margin_right: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct PageChromeRegionConfigPayload {
    pub enabled: bool,
    pub left: Option<String>,
    pub center: Option<String>,
    pub right: Option<String>,
    pub opacity: String,
    pub offset: Option<String>,
    pub border_size: Option<String>,
    pub border_color: Option<String>,
    pub border_style: Option<String>,
    pub font_size: Option<String>,
    pub font_family: Option<String>,
    pub font_color: Option<String>,
    pub padding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct PageChromeConfigPayload {
    pub header: PageChromeRegionConfigPayload,
    pub footer: PageChromeRegionConfigPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct RenderedPagePayload {
    pub html: String,
    pub page_style: PageStylePayload,
    pub text_style: PreviewTextStylePayload,
    pub page_number_config: PageNumberConfigPayload,
    pub page_chrome_config: PageChromeConfigPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "mode",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum RenderedPreviewPayload {
    Standard {
        html: String,
        default_page_style: PageStylePayload,
        default_text_style: PreviewTextStylePayload,
    },
    #[serde(rename = "a4")]
    A4 {
        pages: Vec<RenderedPagePayload>,
        default_page_style: PageStylePayload,
        default_text_style: PreviewTextStylePayload,
    },
}

impl RenderedPreviewPayload {
    pub fn from_pages(
        mode: PreviewDisplayMode,
        pages: Vec<RenderedPage>,
        default_page_style: PageStyle,
        default_text_style: PreviewTextStyle,
    ) -> Self {
        match mode {
            PreviewDisplayMode::Standard => Self::Standard {
                html: pages.iter().map(|page| page.html.as_str()).collect(),
                default_page_style: default_page_style.into(),
                default_text_style: default_text_style.into(),
            },
            PreviewDisplayMode::A4 => Self::A4 {
                pages: pages.into_iter().map(Into::into).collect(),
                default_page_style: default_page_style.into(),
                default_text_style: default_text_style.into(),
            },
        }
    }
}

impl From<RenderedPage> for RenderedPagePayload {
    fn from(page: RenderedPage) -> Self {
        Self {
            html: page.html,
            page_style: page.page_style.into(),
            text_style: page.text_style.into(),
            page_number_config: page.page_number_config.into(),
            page_chrome_config: page.page_chrome_config.into(),
        }
    }
}

impl From<PageStyle> for PageStylePayload {
    fn from(value: PageStyle) -> Self {
        Self {
            width: value.width.as_str().to_owned(),
            height: value.height.as_str().to_owned(),
            margin_top: value.margin_top.as_str().to_owned(),
            margin_right: value.margin_right.as_str().to_owned(),
            margin_bottom: value.margin_bottom.as_str().to_owned(),
            margin_left: value.margin_left.as_str().to_owned(),
        }
    }
}

impl From<PreviewTextStyle> for PreviewTextStylePayload {
    fn from(value: PreviewTextStyle) -> Self {
        Self {
            font_size: value.font_size.as_str().to_owned(),
            font_family: value.font_family,
            heading_font_family: value.heading_font_family,
        }
    }
}

impl From<PageNumberConfig> for PageNumberConfigPayload {
    fn from(value: PageNumberConfig) -> Self {
        Self {
            position: value.position.as_str().to_owned(),
            format: value.format,
            start: value.start,
            reset: value.reset,
            count: value.count,
            visible: value.visible,
            style: value.style.as_str().to_owned(),
            font_size: value.font_size.as_str().to_owned(),
            color: value.color,
            margin_top: value.margin_top.as_str().to_owned(),
            margin_bottom: value.margin_bottom.as_str().to_owned(),
            margin_left: value.margin_left.as_str().to_owned(),
            margin_right: value.margin_right.as_str().to_owned(),
        }
    }
}

impl From<PageChromeConfig> for PageChromeConfigPayload {
    fn from(value: PageChromeConfig) -> Self {
        Self {
            header: value.header.into(),
            footer: value.footer.into(),
        }
    }
}

impl From<PageChromeRegionConfig> for PageChromeRegionConfigPayload {
    fn from(value: PageChromeRegionConfig) -> Self {
        Self {
            enabled: value.enabled,
            left: value.left,
            center: value.center,
            right: value.right,
            opacity: value.opacity,
            offset: value.offset.map(|item| item.as_str().to_owned()),
            border_size: value.border_size,
            border_color: value.border_color,
            border_style: value.border_style,
            font_size: value.font_size,
            font_family: value.font_family,
            font_color: value.font_color,
            padding: value.padding,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct ThemePreferencesPayload {
    pub app_theme_id: String,
    pub preview_theme_id: Option<String>,
    pub preview_uses_app_theme_colors: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct DesktopLayoutPreferencesPayload {
    pub desktop_split_ratio: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct EditorPreferencesPayload {
    pub app_font_id: String,
    pub edit_font_id: String,
    #[serde(default = "default_system_font_size_px")]
    pub system_font_size_px: u32,
    pub edit_font_size_px: u32,
    pub multi_cursor_modifier: String,
    #[serde(default = "default_line_wrapping_enabled")]
    pub line_wrapping_enabled: bool,
    pub show_line_numbers: bool,
    pub startup_edit_mode: String,
    pub windows_startup_tray_resident_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct PreviewPreferencesPayload {
    pub preview_display_mode: String,
    pub is_preview_visible: bool,
    #[serde(default)]
    pub plantuml_https_hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct EditorDraftPayload {
    pub file_name: String,
    pub content: String,
    pub file_path: Option<String>,
    #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
    pub saved_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct RecentFilePayload {
    pub file_name: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct EditorStatePayload {
    pub content: String,
    pub file_name: String,
    pub file_path: Option<String>,
    pub is_dirty: bool,
    #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
    pub last_saved_at: Option<u64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct EditorStateInput {
    pub content: Option<String>,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub is_dirty: Option<bool>,
    #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
    pub last_saved_at: Option<u64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum EditorStateActionPayload {
    #[serde(rename = "editor/bootstrapLoaded")]
    BootstrapLoaded { state: EditorStateInput },
    #[serde(rename = "editor/contentChanged")]
    ContentChanged { content: String },
    #[serde(rename = "editor/documentLoaded")]
    DocumentLoaded {
        file_name: String,
        file_path: Option<String>,
        content: String,
        #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
        loaded_at: Option<u64>,
    },
    #[serde(rename = "editor/documentReset")]
    DocumentReset,
    #[serde(rename = "editor/saveSucceeded")]
    SaveSucceeded {
        file_name: String,
        file_path: Option<String>,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        saved_at: u64,
    },
    #[serde(rename = "editor/errorRaised")]
    ErrorRaised { message: String },
    #[serde(rename = "editor/errorCleared")]
    ErrorCleared,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct EditorStatsPayload {
    pub words: usize,
    pub characters: usize,
    pub lines: usize,
    pub reading_minutes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowStatePayload {
    pub version: u32,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub revision: u64,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub updated_at_epoch_ms: u64,
    pub title: String,
    pub preview: RenderedPreviewPayload,
    pub browser_fade_ms: u32,
    pub page_transition_fade_ms: u32,
    pub active_source_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowSourceLineSelectionRequestPayload {
    pub line_number: u32,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub request_id: u64,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub requested_at_epoch_ms: u64,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct RegisterSubWindowSourceResponsePayload {
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "mode",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub enum SubWindowSelectionPayload {
    Auto,
    Source { source_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowSourceSummaryPayload {
    pub id: String,
    pub is_active: bool,
    pub title: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowSourcesSnapshotPayload {
    pub active_source_id: Option<String>,
    pub sources: Vec<SubWindowSourceSummaryPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowResolvedSourceStatePayload {
    pub source_id: Option<String>,
    pub state: Option<SubWindowStatePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SubWindowSourceStateChangedPayload {
    pub source_id: String,
    pub state: SubWindowStatePayload,
}

impl From<ThemePreferencesPayload> for ThemePreferences {
    fn from(value: ThemePreferencesPayload) -> Self {
        Self::new(
            Some(&value.app_theme_id),
            value.preview_theme_id.as_deref(),
            Some(value.preview_uses_app_theme_colors),
        )
    }
}

impl From<&ThemePreferences> for ThemePreferencesPayload {
    fn from(value: &ThemePreferences) -> Self {
        Self {
            app_theme_id: value.app_theme_id().as_str().to_owned(),
            preview_theme_id: value.preview_theme_id().map(ToOwned::to_owned),
            preview_uses_app_theme_colors: value.preview_uses_app_theme_colors(),
        }
    }
}

impl From<DesktopLayoutPreferencesPayload> for DesktopLayoutPreferences {
    fn from(value: DesktopLayoutPreferencesPayload) -> Self {
        Self::new(Some(value.desktop_split_ratio))
    }
}

impl From<&DesktopLayoutPreferences> for DesktopLayoutPreferencesPayload {
    fn from(value: &DesktopLayoutPreferences) -> Self {
        Self {
            desktop_split_ratio: value.desktop_split_ratio(),
        }
    }
}

impl From<EditorPreferencesPayload> for EditorPreferences {
    fn from(value: EditorPreferencesPayload) -> Self {
        Self::new(
            Some(&value.app_font_id),
            Some(&value.edit_font_id),
            Some(value.system_font_size_px),
            Some(value.edit_font_size_px),
            Some(&value.multi_cursor_modifier),
            Some(value.line_wrapping_enabled),
            Some(value.show_line_numbers),
            Some(&value.startup_edit_mode),
            Some(value.windows_startup_tray_resident_enabled),
        )
    }
}

impl From<&EditorPreferences> for EditorPreferencesPayload {
    fn from(value: &EditorPreferences) -> Self {
        Self {
            app_font_id: value.app_font_id().to_owned(),
            edit_font_id: value.edit_font_id().to_owned(),
            system_font_size_px: value.system_font_size_px(),
            edit_font_size_px: value.edit_font_size_px(),
            multi_cursor_modifier: value.multi_cursor_modifier().as_str().to_owned(),
            line_wrapping_enabled: value.line_wrapping_enabled(),
            show_line_numbers: value.show_line_numbers(),
            startup_edit_mode: value.startup_edit_mode().as_str().to_owned(),
            windows_startup_tray_resident_enabled: value.windows_startup_tray_resident_enabled(),
        }
    }
}

impl From<PreviewPreferencesPayload> for PreviewPreferences {
    fn from(value: PreviewPreferencesPayload) -> Self {
        Self::new(
            Some(&value.preview_display_mode),
            Some(value.is_preview_visible),
            Some(&value.plantuml_https_hosts),
        )
    }
}

impl From<&PreviewPreferences> for PreviewPreferencesPayload {
    fn from(value: &PreviewPreferences) -> Self {
        Self {
            preview_display_mode: value.preview_display_mode().as_str().to_owned(),
            is_preview_visible: value.is_preview_visible(),
            plantuml_https_hosts: value.plantuml_https_hosts().to_vec(),
        }
    }
}

impl From<EditorDraftPayload> for StoredEdit {
    fn from(value: EditorDraftPayload) -> Self {
        Self::new(
            value.file_name,
            value.content,
            value.file_path,
            value.saved_at,
        )
    }
}

impl From<&StoredEdit> for EditorDraftPayload {
    fn from(value: &StoredEdit) -> Self {
        Self {
            file_name: value.file_name().to_owned(),
            content: value.content().to_owned(),
            file_path: value.file_path().map(ToOwned::to_owned),
            saved_at: value.saved_at(),
        }
    }
}

impl From<&RecentFile> for RecentFilePayload {
    fn from(value: &RecentFile) -> Self {
        Self {
            file_name: value.file_name().to_owned(),
            file_path: value.file_path().to_owned(),
        }
    }
}

pub fn recent_file_from_payload(value: RecentFilePayload) -> Option<RecentFile> {
    RecentFile::new(value.file_name, value.file_path)
}

pub fn recent_files_from_payloads(values: Vec<RecentFilePayload>) -> RecentFiles {
    RecentFiles::new(values.into_iter().filter_map(recent_file_from_payload))
}

pub fn recent_file_payloads_from_recent_files(value: &RecentFiles) -> Vec<RecentFilePayload> {
    value.files().iter().map(Into::into).collect()
}

impl From<&EditorState> for EditorStatePayload {
    fn from(value: &EditorState) -> Self {
        Self {
            content: value.content().to_owned(),
            file_name: value.file_name().to_owned(),
            file_path: value.file_path().map(ToOwned::to_owned),
            is_dirty: value.is_dirty(),
            last_saved_at: value.last_saved_at(),
            error_message: value.error_message().map(ToOwned::to_owned),
        }
    }
}

impl From<EditorStateInput> for EditorState {
    fn from(value: EditorStateInput) -> Self {
        Self::new(
            value.content.unwrap_or_default(),
            value.file_name.unwrap_or_default(),
            value.file_path,
            value.is_dirty.unwrap_or(false),
            value.last_saved_at,
            value.error_message,
        )
    }
}

impl From<EditorStateActionPayload> for EditorStateAction {
    fn from(value: EditorStateActionPayload) -> Self {
        match value {
            EditorStateActionPayload::BootstrapLoaded { state } => {
                Self::BootstrapLoaded(state.into())
            }
            EditorStateActionPayload::ContentChanged { content } => Self::ContentChanged(content),
            EditorStateActionPayload::DocumentLoaded {
                file_name,
                file_path,
                content,
                loaded_at,
            } => Self::DocumentLoaded {
                file_name,
                file_path,
                content,
                loaded_at,
            },
            EditorStateActionPayload::DocumentReset => Self::DocumentReset,
            EditorStateActionPayload::SaveSucceeded {
                file_name,
                file_path,
                saved_at,
            } => Self::SaveSucceeded {
                file_name,
                file_path,
                saved_at,
            },
            EditorStateActionPayload::ErrorRaised { message } => Self::ErrorRaised(message),
            EditorStateActionPayload::ErrorCleared => Self::ErrorCleared,
        }
    }
}

impl From<&EditorStats> for EditorStatsPayload {
    fn from(value: &EditorStats) -> Self {
        Self {
            words: value.words(),
            characters: value.characters(),
            lines: value.lines(),
            reading_minutes: value.reading_minutes(),
        }
    }
}

impl From<&TableDiagnostic> for TableDiagnosticPayload {
    fn from(diagnostic: &TableDiagnostic) -> Self {
        Self {
            kind: diagnostic.kind.into(),
            message: diagnostic.message.clone(),
            line: diagnostic.line,
            column: diagnostic.column,
            range: diagnostic.range.as_ref().map(|range| SourceRangePayload {
                start: range.start,
                end: range.end,
            }),
        }
    }
}

impl From<TableDiagnosticKind> for TableDiagnosticKindPayload {
    fn from(kind: TableDiagnosticKind) -> Self {
        match kind {
            TableDiagnosticKind::InvalidLeftMerge => Self::InvalidLeftMerge,
            TableDiagnosticKind::InvalidUpMerge => Self::InvalidUpMerge,
            TableDiagnosticKind::NonRectangularMerge => Self::NonRectangularMerge,
            TableDiagnosticKind::ColumnCountMismatch => Self::ColumnCountMismatch,
        }
    }
}

fn default_system_font_size_px() -> u32 {
    kmark_core::DEFAULT_SYSTEM_FONT_SIZE_PX
}

fn default_line_wrapping_enabled() -> bool {
    kmark_core::DEFAULT_LINE_WRAPPING_ENABLED
}
