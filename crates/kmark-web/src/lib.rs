use kmark_core::{
    create_startup_editor_state, derive_editor_stats, ensure_markdown_file_name,
    reduce_editor_state, render_markdown_preview_with_file_path, resolve_app_font_family,
    resolve_edit_font_family, DesktopLayoutPreferences, EditorPreferences, EditorState,
    EditorStateAction, EditorStats, PageNumberConfig, PageStyle, PreviewPreferences,
    PreviewTextStyle, RenderedPage, StoredEdit, ThemePreferences,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RenderedMarkdownPreviewPayload {
    html: String,
    page_htmls: Vec<String>,
    pages: Vec<RenderedPagePayload>,
    default_page_style: PageStylePayload,
    default_text_style: PreviewTextStylePayload,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RenderedPagePayload {
    html: String,
    page_style: PageStylePayload,
    text_style: PreviewTextStylePayload,
    page_number_config: PageNumberConfigPayload,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PageStylePayload {
    width: String,
    height: String,
    margin_top: String,
    margin_right: String,
    margin_bottom: String,
    margin_left: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PreviewTextStylePayload {
    font_size: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PageNumberConfigPayload {
    position: String,
    format: String,
    start: u32,
    reset: bool,
    count: bool,
    visible: bool,
    style: String,
    font_size: String,
    color: String,
    margin_top: String,
    margin_bottom: String,
    margin_left: String,
    margin_right: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemePreferencesPayload {
    app_theme_id: String,
    preview_theme_id: Option<String>,
    preview_uses_app_theme_colors: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemePreferencesInput {
    app_theme_id: Option<String>,
    preview_theme_id: Option<String>,
    preview_uses_app_theme_colors: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLayoutPreferencesPayload {
    desktop_split_ratio: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLayoutPreferencesInput {
    desktop_split_ratio: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorPreferencesPayload {
    app_font_id: String,
    edit_font_id: String,
    system_font_size_px: u32,
    edit_font_size_px: u32,
    multi_cursor_modifier: String,
    show_line_numbers: bool,
    startup_edit_mode: String,
    windows_startup_tray_resident_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorPreferencesInput {
    app_font_id: Option<String>,
    edit_font_id: Option<String>,
    system_font_size_px: Option<u32>,
    edit_font_size_px: Option<u32>,
    multi_cursor_modifier: Option<String>,
    show_line_numbers: Option<bool>,
    startup_edit_mode: Option<String>,
    windows_startup_tray_resident_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorStatePayload {
    content: String,
    file_name: String,
    is_dirty: bool,
    last_saved_at: Option<u64>,
    error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorStateInput {
    content: Option<String>,
    file_name: Option<String>,
    is_dirty: Option<bool>,
    last_saved_at: Option<u64>,
    error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorStatsPayload {
    words: usize,
    characters: usize,
    lines: usize,
    reading_minutes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
enum EditorStateActionInput {
    #[serde(rename = "editor/bootstrapLoaded")]
    BootstrapLoaded { state: EditorStateInput },
    #[serde(rename = "editor/contentChanged")]
    ContentChanged { content: String },
    #[serde(rename = "editor/documentLoaded")]
    DocumentLoaded {
        file_name: String,
        content: String,
        loaded_at: Option<u64>,
    },
    #[serde(rename = "editor/documentReset")]
    DocumentReset,
    #[serde(rename = "editor/saveSucceeded")]
    SaveSucceeded { file_name: String, saved_at: u64 },
    #[serde(rename = "editor/errorRaised")]
    ErrorRaised { message: String },
    #[serde(rename = "editor/errorCleared")]
    ErrorCleared,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewPreferencesPayload {
    preview_display_mode: String,
    is_preview_visible: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewPreferencesInput {
    preview_display_mode: Option<String>,
    is_preview_visible: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorDraftPayload {
    file_name: String,
    content: String,
    file_path: Option<String>,
    saved_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorDraftInput {
    file_name: Option<String>,
    content: Option<String>,
    file_path: Option<String>,
    saved_at: Option<u64>,
}

#[wasm_bindgen]
pub fn render_markdown_preview_json(content: String, file_path: Option<String>) -> String {
    let rendered_preview = render_markdown_preview_with_file_path(&content, file_path.as_deref());
    stringify(&RenderedMarkdownPreviewPayload {
        html: rendered_preview.html,
        page_htmls: rendered_preview.page_htmls,
        pages: rendered_preview
            .pages
            .into_iter()
            .map(RenderedPagePayload::from)
            .collect(),
        default_page_style: PageStylePayload::from(rendered_preview.default_page_style),
        default_text_style: PreviewTextStylePayload::from(rendered_preview.default_text_style),
    })
}

#[wasm_bindgen]
pub fn normalize_theme_preferences_json(input: Option<String>) -> String {
    let payload = parse_json::<ThemePreferencesInput>(input);
    let theme_preferences = ThemePreferences::new(
        payload
            .as_ref()
            .and_then(|value| value.app_theme_id.as_deref()),
        payload
            .as_ref()
            .and_then(|value| value.preview_theme_id.as_deref()),
        payload
            .as_ref()
            .and_then(|value| value.preview_uses_app_theme_colors),
    );
    stringify(&ThemePreferencesPayload::from(&theme_preferences))
}

#[wasm_bindgen]
pub fn normalize_desktop_layout_preferences_json(input: Option<String>) -> String {
    let payload = parse_json::<DesktopLayoutPreferencesInput>(input);
    let desktop_layout_preferences =
        DesktopLayoutPreferences::new(payload.as_ref().and_then(|value| value.desktop_split_ratio));
    stringify(&DesktopLayoutPreferencesPayload::from(
        &desktop_layout_preferences,
    ))
}

#[wasm_bindgen]
pub fn normalize_editor_preferences_json(input: Option<String>) -> String {
    let payload = parse_json::<EditorPreferencesInput>(input);
    let editor_preferences = EditorPreferences::new(
        payload
            .as_ref()
            .and_then(|value| value.app_font_id.as_deref()),
        payload
            .as_ref()
            .and_then(|value| value.edit_font_id.as_deref()),
        payload.as_ref().and_then(|value| value.system_font_size_px),
        payload.as_ref().and_then(|value| value.edit_font_size_px),
        payload
            .as_ref()
            .and_then(|value| value.multi_cursor_modifier.as_deref()),
        payload.as_ref().and_then(|value| value.show_line_numbers),
        payload
            .as_ref()
            .and_then(|value| value.startup_edit_mode.as_deref()),
        payload
            .as_ref()
            .and_then(|value| value.windows_startup_tray_resident_enabled),
    );
    stringify(&EditorPreferencesPayload::from(&editor_preferences))
}

#[wasm_bindgen]
pub fn create_startup_editor_state_json(
    startup_edit_mode: Option<String>,
    stored_edit_input: Option<String>,
) -> String {
    let payload = parse_json::<EditorDraftInput>(stored_edit_input);
    let stored_edit = payload.and_then(|value| {
        let file_name = value.file_name?;
        let content = value.content?;
        Some(StoredEdit::new(
            file_name,
            content,
            value.file_path,
            value.saved_at,
        ))
    });
    let editor_state = create_startup_editor_state(
        startup_edit_mode
            .as_deref()
            .and_then(kmark_core::StartupEditMode::from_str)
            .unwrap_or_default(),
        stored_edit.as_ref(),
    );
    stringify(&EditorStatePayload::from(&editor_state))
}

#[wasm_bindgen]
pub fn reduce_editor_state_json(current_state_input: String, action_input: String) -> String {
    let current_state = EditorState::from(
        parse_json::<EditorStateInput>(Some(current_state_input)).unwrap_or_default(),
    );
    let action = parse_json::<EditorStateActionInput>(Some(action_input))
        .map(EditorStateAction::from)
        .unwrap_or(EditorStateAction::BootstrapLoaded(current_state.clone()));
    let next_state = reduce_editor_state(&current_state, &action);

    stringify(&EditorStatePayload::from(&next_state))
}

#[wasm_bindgen]
pub fn normalize_markdown_file_name_json(file_name: String) -> String {
    ensure_markdown_file_name(&file_name)
}

#[wasm_bindgen]
pub fn resolve_app_font_family_json(app_font_id: String) -> String {
    resolve_app_font_family(&app_font_id)
}

#[wasm_bindgen]
pub fn resolve_edit_font_family_json(edit_font_id: String) -> String {
    resolve_edit_font_family(&edit_font_id)
}

#[wasm_bindgen]
pub fn derive_editor_stats_json(content: String) -> String {
    let editor_stats = derive_editor_stats(&content);
    stringify(&EditorStatsPayload::from(&editor_stats))
}

#[wasm_bindgen]
pub fn normalize_preview_preferences_json(input: Option<String>) -> String {
    let payload = parse_json::<PreviewPreferencesInput>(input);
    let preview_preferences = PreviewPreferences::new(
        payload
            .as_ref()
            .and_then(|value| value.preview_display_mode.as_deref()),
        payload.as_ref().and_then(|value| value.is_preview_visible),
    );
    stringify(&PreviewPreferencesPayload::from(&preview_preferences))
}

#[wasm_bindgen]
pub fn normalize_editor_draft_json(input: Option<String>) -> Option<String> {
    let payload = parse_json::<EditorDraftInput>(input)?;
    let file_name = payload.file_name?;
    let content = payload.content?;
    let stored_edit = StoredEdit::new(file_name, content, payload.file_path, payload.saved_at);
    Some(stringify(&EditorDraftPayload::from(&stored_edit)))
}

fn parse_json<T: for<'de> Deserialize<'de>>(input: Option<String>) -> Option<T> {
    let text = input?;

    if text.trim().is_empty() {
        return None;
    }

    serde_json::from_str(&text).ok()
}

fn stringify<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("json serialization failed")
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

impl From<&ThemePreferences> for ThemePreferencesPayload {
    fn from(theme_preferences: &ThemePreferences) -> Self {
        Self {
            app_theme_id: theme_preferences.app_theme_id().as_str().to_owned(),
            preview_theme_id: theme_preferences.preview_theme_id().map(ToOwned::to_owned),
            preview_uses_app_theme_colors: theme_preferences.preview_uses_app_theme_colors(),
        }
    }
}

impl From<&DesktopLayoutPreferences> for DesktopLayoutPreferencesPayload {
    fn from(desktop_layout_preferences: &DesktopLayoutPreferences) -> Self {
        Self {
            desktop_split_ratio: desktop_layout_preferences.desktop_split_ratio(),
        }
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

impl Default for EditorStateInput {
    fn default() -> Self {
        Self {
            content: Some(String::new()),
            file_name: Some(String::new()),
            is_dirty: Some(false),
            last_saved_at: None,
            error_message: None,
        }
    }
}

impl From<EditorStateInput> for EditorState {
    fn from(input: EditorStateInput) -> Self {
        EditorState::new(
            input.content.unwrap_or_default(),
            input.file_name.unwrap_or_default(),
            input.is_dirty.unwrap_or(false),
            input.last_saved_at,
            input.error_message,
        )
    }
}

impl From<&EditorState> for EditorStatePayload {
    fn from(editor_state: &EditorState) -> Self {
        Self {
            content: editor_state.content().to_owned(),
            file_name: editor_state.file_name().to_owned(),
            is_dirty: editor_state.is_dirty(),
            last_saved_at: editor_state.last_saved_at(),
            error_message: editor_state.error_message().map(ToOwned::to_owned),
        }
    }
}

impl From<&EditorStats> for EditorStatsPayload {
    fn from(editor_stats: &EditorStats) -> Self {
        Self {
            words: editor_stats.words(),
            characters: editor_stats.characters(),
            lines: editor_stats.lines(),
            reading_minutes: editor_stats.reading_minutes(),
        }
    }
}

impl From<EditorStateActionInput> for EditorStateAction {
    fn from(action: EditorStateActionInput) -> Self {
        match action {
            EditorStateActionInput::BootstrapLoaded { state } => {
                Self::BootstrapLoaded(EditorState::from(state))
            }
            EditorStateActionInput::ContentChanged { content } => Self::ContentChanged(content),
            EditorStateActionInput::DocumentLoaded {
                file_name,
                content,
                loaded_at,
            } => Self::DocumentLoaded {
                file_name,
                content,
                loaded_at,
            },
            EditorStateActionInput::DocumentReset => Self::DocumentReset,
            EditorStateActionInput::SaveSucceeded {
                file_name,
                saved_at,
            } => Self::SaveSucceeded {
                file_name,
                saved_at,
            },
            EditorStateActionInput::ErrorRaised { message } => Self::ErrorRaised(message),
            EditorStateActionInput::ErrorCleared => Self::ErrorCleared,
        }
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

#[cfg(test)]
mod tests {
    use super::{render_markdown_preview_json, RenderedMarkdownPreviewPayload};

    #[test]
    fn wasm_render_output_matches_core_renderer() {
        let markdown = "| Left | Right |\n| :--- | ----: |\n| ~~a~~ | [x] |\n\n- [x] done\n\nNote[^alpha].\n\n[^alpha]: Footnote";
        let core_output = kmark_core::render_markdown_preview(markdown);
        let wasm_output = serde_json::from_str::<RenderedMarkdownPreviewPayload>(
            &render_markdown_preview_json(markdown.to_owned(), None),
        )
        .expect("wasm render payload parse failed");

        assert_eq!(wasm_output.html, core_output.html);
        assert_eq!(wasm_output.page_htmls, core_output.page_htmls);
    }
}
