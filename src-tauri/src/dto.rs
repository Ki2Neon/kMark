use kmark_core::{
    DesktopLayoutPreferences, EditorPreferences, PageNumberConfig, PageStyle, PreviewPreferences,
    PreviewTextStyle, RenderedMarkdownPreview, RenderedPage, StoredEdit, ThemePreferences,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedMarkdownPreviewPayload {
    pub html: String,
    pub page_htmls: Vec<String>,
    pub pages: Vec<RenderedPagePayload>,
    pub default_page_style: PageStylePayload,
    pub default_text_style: PreviewTextStylePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedPagePayload {
    pub html: String,
    pub page_style: PageStylePayload,
    pub text_style: PreviewTextStylePayload,
    pub page_number_config: PageNumberConfigPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageStylePayload {
    pub width: String,
    pub height: String,
    pub margin_top: String,
    pub margin_right: String,
    pub margin_bottom: String,
    pub margin_left: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTextStylePayload {
    pub font_size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

impl From<RenderedMarkdownPreview> for RenderedMarkdownPreviewPayload {
    fn from(rendered_preview: RenderedMarkdownPreview) -> Self {
        Self {
            html: rendered_preview.html,
            page_htmls: rendered_preview.page_htmls,
            pages: rendered_preview
                .pages
                .into_iter()
                .map(RenderedPagePayload::from)
                .collect(),
            default_page_style: PageStylePayload::from(rendered_preview.default_page_style),
            default_text_style: PreviewTextStylePayload::from(rendered_preview.default_text_style),
        }
    }
}

impl From<RenderedPage> for RenderedPagePayload {
    fn from(page: RenderedPage) -> Self {
        Self {
            html: page.html,
            page_style: PageStylePayload::from(page.page_style),
            text_style: PreviewTextStylePayload::from(page.text_style),
            page_number_config: PageNumberConfigPayload::from(page.page_number_config),
        }
    }
}

impl From<PageStyle> for PageStylePayload {
    fn from(page_style: PageStyle) -> Self {
        Self {
            width: page_style.width.as_str().to_owned(),
            height: page_style.height.as_str().to_owned(),
            margin_top: page_style.margin_top.as_str().to_owned(),
            margin_right: page_style.margin_right.as_str().to_owned(),
            margin_bottom: page_style.margin_bottom.as_str().to_owned(),
            margin_left: page_style.margin_left.as_str().to_owned(),
        }
    }
}

impl From<PreviewTextStyle> for PreviewTextStylePayload {
    fn from(text_style: PreviewTextStyle) -> Self {
        Self {
            font_size: text_style.font_size.as_str().to_owned(),
        }
    }
}

impl From<PageNumberConfig> for PageNumberConfigPayload {
    fn from(config: PageNumberConfig) -> Self {
        Self {
            position: config.position.as_str().to_owned(),
            format: config.format,
            start: config.start,
            reset: config.reset,
            count: config.count,
            visible: config.visible,
            style: config.style.as_str().to_owned(),
            font_size: config.font_size.as_str().to_owned(),
            color: config.color,
            margin_top: config.margin_top.as_str().to_owned(),
            margin_bottom: config.margin_bottom.as_str().to_owned(),
            margin_left: config.margin_left.as_str().to_owned(),
            margin_right: config.margin_right.as_str().to_owned(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreferencesPayload {
    pub app_theme_id: String,
    pub preview_theme_id: Option<String>,
    pub preview_uses_app_theme_colors: bool,
}

impl From<ThemePreferencesPayload> for ThemePreferences {
    fn from(payload: ThemePreferencesPayload) -> Self {
        ThemePreferences::new(
            Some(&payload.app_theme_id),
            payload.preview_theme_id.as_deref(),
            Some(payload.preview_uses_app_theme_colors),
        )
    }
}

impl From<&ThemePreferences> for ThemePreferencesPayload {
    fn from(theme_preferences: &ThemePreferences) -> Self {
        Self {
            app_theme_id: theme_preferences.app_theme_id().as_str().to_owned(),
            preview_theme_id: theme_preferences.preview_theme_id().map(ToOwned::to_owned),
            preview_uses_app_theme_colors: theme_preferences.preview_uses_app_theme_colors(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLayoutPreferencesPayload {
    pub desktop_split_ratio: u32,
}

impl From<DesktopLayoutPreferencesPayload> for DesktopLayoutPreferences {
    fn from(payload: DesktopLayoutPreferencesPayload) -> Self {
        DesktopLayoutPreferences::new(Some(payload.desktop_split_ratio))
    }
}

impl From<&DesktopLayoutPreferences> for DesktopLayoutPreferencesPayload {
    fn from(desktop_layout_preferences: &DesktopLayoutPreferences) -> Self {
        Self {
            desktop_split_ratio: desktop_layout_preferences.desktop_split_ratio(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPreferencesPayload {
    pub app_font_id: String,
    pub edit_font_id: String,
    #[serde(default = "default_system_font_size_px")]
    pub system_font_size_px: u32,
    pub edit_font_size_px: u32,
    pub multi_cursor_modifier: String,
    pub show_line_numbers: bool,
    pub startup_edit_mode: String,
    pub windows_startup_tray_resident_enabled: bool,
}

impl From<EditorPreferencesPayload> for EditorPreferences {
    fn from(payload: EditorPreferencesPayload) -> Self {
        EditorPreferences::new(
            Some(&payload.app_font_id),
            Some(&payload.edit_font_id),
            Some(payload.system_font_size_px),
            Some(payload.edit_font_size_px),
            Some(&payload.multi_cursor_modifier),
            Some(payload.show_line_numbers),
            Some(&payload.startup_edit_mode),
            Some(payload.windows_startup_tray_resident_enabled),
        )
    }
}

impl From<&EditorPreferences> for EditorPreferencesPayload {
    fn from(editor_preferences: &EditorPreferences) -> Self {
        Self {
            app_font_id: editor_preferences.app_font_id().to_owned(),
            edit_font_id: editor_preferences.edit_font_id().to_owned(),
            system_font_size_px: editor_preferences.system_font_size_px(),
            edit_font_size_px: editor_preferences.edit_font_size_px(),
            multi_cursor_modifier: editor_preferences
                .multi_cursor_modifier()
                .as_str()
                .to_owned(),
            show_line_numbers: editor_preferences.show_line_numbers(),
            startup_edit_mode: editor_preferences.startup_edit_mode().as_str().to_owned(),
            windows_startup_tray_resident_enabled: editor_preferences
                .windows_startup_tray_resident_enabled(),
        }
    }
}

fn default_system_font_size_px() -> u32 {
    kmark_core::DEFAULT_SYSTEM_FONT_SIZE_PX
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDraftPayload {
    pub file_name: String,
    pub content: String,
    pub file_path: Option<String>,
    pub saved_at: Option<u64>,
}

impl From<EditorDraftPayload> for StoredEdit {
    fn from(payload: EditorDraftPayload) -> Self {
        StoredEdit::new(
            payload.file_name,
            payload.content,
            payload.file_path,
            payload.saved_at,
        )
    }
}

impl From<&StoredEdit> for EditorDraftPayload {
    fn from(stored_edit: &StoredEdit) -> Self {
        Self {
            file_name: stored_edit.file_name().to_owned(),
            content: stored_edit.content().to_owned(),
            file_path: stored_edit.file_path().map(ToOwned::to_owned),
            saved_at: stored_edit.saved_at(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPreferencesPayload {
    pub preview_display_mode: String,
    pub is_preview_visible: bool,
}

impl From<PreviewPreferencesPayload> for PreviewPreferences {
    fn from(payload: PreviewPreferencesPayload) -> Self {
        PreviewPreferences::new(
            Some(&payload.preview_display_mode),
            Some(payload.is_preview_visible),
        )
    }
}

impl From<&PreviewPreferences> for PreviewPreferencesPayload {
    fn from(preview_preferences: &PreviewPreferences) -> Self {
        Self {
            preview_display_mode: preview_preferences
                .preview_display_mode()
                .as_str()
                .to_owned(),
            is_preview_visible: preview_preferences.is_preview_visible(),
        }
    }
}
