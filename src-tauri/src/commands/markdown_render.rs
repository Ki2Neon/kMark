use serde::Serialize;

use kmark_core::render_markdown_preview_with_file_path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedMarkdownPreviewPayload {
    html: String,
    page_htmls: Vec<String>,
}

#[tauri::command]
pub fn render_markdown_preview(
    content: String,
    file_path: Option<String>,
) -> RenderedMarkdownPreviewPayload {
    let rendered_preview =
        render_markdown_preview_with_file_path(&content, file_path.as_deref());

    RenderedMarkdownPreviewPayload {
        html: rendered_preview.html,
        page_htmls: rendered_preview.page_htmls,
    }
}

#[cfg(test)]
mod tests {
    use super::render_markdown_preview;

    #[test]
    fn tauri_command_payload_matches_core_renderer() {
        let markdown = "| Left | Right |\n| :--- | ----: |\n| ~~a~~ | b |\n\n- [x] done\n\nNote[^alpha].\n\n[^alpha]: Footnote";
        let core_output = kmark_core::render_markdown_preview(markdown);
        let payload = render_markdown_preview(markdown.to_owned(), None);

        assert_eq!(payload.html, core_output.html);
        assert_eq!(payload.page_htmls, core_output.page_htmls);
    }
}
