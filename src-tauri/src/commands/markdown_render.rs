use crate::dto::RenderedMarkdownPreviewPayload;
use kmark_core::render_markdown_preview_with_file_path;

fn render_markdown_preview_payload(
    content: String,
    file_path: Option<String>,
) -> RenderedMarkdownPreviewPayload {
    let rendered_preview = render_markdown_preview_with_file_path(&content, file_path.as_deref());

    RenderedMarkdownPreviewPayload::from(rendered_preview)
}

#[tauri::command]
pub async fn render_markdown_preview(
    content: String,
    file_path: Option<String>,
) -> Result<RenderedMarkdownPreviewPayload, String> {
    tauri::async_runtime::spawn_blocking(move || render_markdown_preview_payload(content, file_path))
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::render_markdown_preview_payload;

    #[test]
    fn tauri_command_payload_matches_core_renderer() {
        let markdown = "| Left | Right |\n| :--- | ----: |\n| ~~a~~ | b |\n\n- [x] done\n\nNote[^alpha].\n\n[^alpha]: Footnote";
        let core_output = kmark_core::render_markdown_preview(markdown);
        let payload = render_markdown_preview_payload(markdown.to_owned(), None);

        assert_eq!(payload.html, core_output.html);
        assert_eq!(payload.page_htmls, core_output.page_htmls);
    }
}
