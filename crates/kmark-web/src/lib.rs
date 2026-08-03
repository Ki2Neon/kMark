use kmark_contract::{
    DesktopLayoutPreferencesPayload, EditorDraftPayload, EditorPreferencesPayload,
    EditorStateActionPayload, EditorStateInput, EditorStatePayload, EditorStatsPayload,
    FormatMarkdownTablesPayload, PreviewPreferencesPayload, RecentFilePayload,
    RenderedPreviewPayload, TableDiagnosticPayload, ThemePreferencesPayload,
};
use kmark_core::{
    create_startup_editor_state, derive_editor_stats, ensure_markdown_file_name,
    format_markdown_tables, format_markdown_tables_in_line_ranges, reduce_editor_state,
    render_markdown_preview_with_file_path, resolve_app_font_family, resolve_edit_font_family,
    DesktopLayoutPreferences, EditorPreferences, EditorState, EditorStateAction,
    PreviewDisplayMode, PreviewPreferences, RecentFile, RecentFiles, StoredEdit,
    TableFormatLineRange, TableFormatOptions, ThemePreferences,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemePreferencesInput {
    app_theme_id: Option<String>,
    preview_theme_id: Option<String>,
    preview_uses_app_theme_colors: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLayoutPreferencesInput {
    desktop_split_ratio: Option<u32>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableFormatOptionsInput {
    infer_numeric_alignment: Option<bool>,
    min_separator_width: Option<usize>,
    tab_width: Option<usize>,
    preserve_line_ending: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableFormatLineRangeInput {
    start_line: usize,
    end_line: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewPreferencesInput {
    preview_display_mode: Option<String>,
    is_preview_visible: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorDraftInput {
    file_name: Option<String>,
    content: Option<String>,
    file_path: Option<String>,
    saved_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentFileInput {
    file_name: Option<String>,
    file_path: Option<String>,
}

#[wasm_bindgen]
pub fn render_markdown_preview_json(
    content: String,
    file_path: Option<String>,
    display_mode: String,
) -> String {
    let rendered_preview = render_markdown_preview_with_file_path(&content, file_path.as_deref());
    let display_mode = PreviewDisplayMode::from_str(&display_mode).unwrap_or_default();
    stringify(&RenderedPreviewPayload::from_pages(
        display_mode,
        rendered_preview.pages,
        rendered_preview.default_page_style,
        rendered_preview.default_text_style,
    ))
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
    let action = parse_json::<EditorStateActionPayload>(Some(action_input))
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
pub fn format_markdown_tables_json(content: String, options_input: Option<String>) -> String {
    let options = parse_json::<TableFormatOptionsInput>(options_input)
        .map(TableFormatOptions::from)
        .unwrap_or_default();
    let result = format_markdown_tables(&content, options);

    stringify_format_result(result)
}

#[wasm_bindgen]
pub fn format_markdown_tables_in_line_ranges_json(
    content: String,
    line_ranges_input: String,
    options_input: Option<String>,
) -> String {
    let line_ranges = parse_json::<Vec<TableFormatLineRangeInput>>(Some(line_ranges_input))
        .unwrap_or_default()
        .into_iter()
        .map(TableFormatLineRange::from)
        .collect::<Vec<_>>();
    let options = parse_json::<TableFormatOptionsInput>(options_input)
        .map(TableFormatOptions::from)
        .unwrap_or_default();
    let result = format_markdown_tables_in_line_ranges(&content, &line_ranges, options);

    stringify_format_result(result)
}

fn stringify_format_result(result: kmark_core::FormatResult) -> String {
    stringify(&FormatMarkdownTablesPayload {
        text: result.text,
        diagnostics: result
            .diagnostics
            .iter()
            .map(TableDiagnosticPayload::from)
            .collect(),
    })
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

#[wasm_bindgen]
pub fn normalize_recent_files_json(input: Option<String>) -> String {
    let recent_files = RecentFiles::new(
        parse_json::<Vec<RecentFileInput>>(input)
            .unwrap_or_default()
            .into_iter()
            .filter_map(recent_file_from_input),
    );

    stringify_recent_files(&recent_files)
}

#[wasm_bindgen]
pub fn record_recent_file_json(current_input: Option<String>, recent_file_input: String) -> String {
    let recent_files = RecentFiles::new(
        parse_json::<Vec<RecentFileInput>>(current_input)
            .unwrap_or_default()
            .into_iter()
            .filter_map(recent_file_from_input),
    );
    let recent_file = parse_json::<RecentFileInput>(Some(recent_file_input))
        .and_then(recent_file_from_input);

    match recent_file {
        Some(recent_file) => stringify_recent_files(&recent_files.record(recent_file)),
        None => stringify_recent_files(&recent_files),
    }
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

fn stringify_recent_files(recent_files: &RecentFiles) -> String {
    stringify(
        &recent_files
            .files()
            .iter()
            .map(RecentFilePayload::from)
            .collect::<Vec<_>>(),
    )
}

fn recent_file_from_input(input: RecentFileInput) -> Option<RecentFile> {
    RecentFile::new(input.file_name.unwrap_or_default(), input.file_path?)
}

impl From<TableFormatOptionsInput> for TableFormatOptions {
    fn from(input: TableFormatOptionsInput) -> Self {
        let default_options = TableFormatOptions::default();

        Self {
            infer_numeric_alignment: input
                .infer_numeric_alignment
                .unwrap_or(default_options.infer_numeric_alignment),
            min_separator_width: input
                .min_separator_width
                .unwrap_or(default_options.min_separator_width),
            tab_width: input.tab_width.unwrap_or(default_options.tab_width),
            preserve_line_ending: input
                .preserve_line_ending
                .unwrap_or(default_options.preserve_line_ending),
        }
    }
}

impl From<TableFormatLineRangeInput> for TableFormatLineRange {
    fn from(input: TableFormatLineRangeInput) -> Self {
        Self {
            start_line: input.start_line,
            end_line: input.end_line,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        format_markdown_tables_in_line_ranges_json, format_markdown_tables_json,
        render_markdown_preview_json, FormatMarkdownTablesPayload,
    };

    #[test]
    fn wasm_render_output_matches_core_renderer() {
        let markdown = "| Left | Right |\n| :--- | ----: |\n| ~~a~~ | [x] |\n\n- [x] done\n\nNote[^alpha].\n\n[^alpha]: Footnote";
        let core_output = kmark_core::render_markdown_preview(markdown);
        let wasm_output = serde_json::from_str::<kmark_contract::RenderedPreviewPayload>(
            &render_markdown_preview_json(markdown.to_owned(), None, "standard".to_owned()),
        )
        .expect("wasm render payload parse failed");

        let kmark_contract::RenderedPreviewPayload::Standard { html, .. } = wasm_output else {
            panic!("expected standard payload");
        };
        assert_eq!(
            html,
            core_output
                .pages
                .iter()
                .map(|page| page.html.as_str())
                .collect::<String>()
        );
    }

    #[test]
    fn wasm_table_formatter_returns_core_format_result() {
        let output = serde_json::from_str::<FormatMarkdownTablesPayload>(
            &format_markdown_tables_json("|名前|年齢|\n|-|-|\n|山田|20|".to_owned(), None),
        )
        .expect("wasm table format payload parse failed");

        assert_eq!(
            output.text,
            "| 名前 | 年齢 |\n| ---- | ---: |\n| 山田 |   20 |"
        );
        assert!(output.diagnostics.is_empty());
    }

    #[test]
    fn wasm_table_formatter_can_limit_target_line_ranges() {
        let output = serde_json::from_str::<FormatMarkdownTablesPayload>(
            &format_markdown_tables_in_line_ranges_json(
                "|a|b|\n|-|-|\n|x|y|\n\n|c|d|\n|-|-|\n|1|2|".to_owned(),
                r#"[{"startLine":5,"endLine":5}]"#.to_owned(),
                None,
            ),
        )
        .expect("wasm table format payload parse failed");

        assert_eq!(
            output.text,
            "|a|b|\n|-|-|\n|x|y|\n\n|    c |    d |\n| ---: | ---: |\n|    1 |    2 |"
        );
        assert!(output.diagnostics.is_empty());
    }
}
