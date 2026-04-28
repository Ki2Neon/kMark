use serde::Serialize;

use crate::usecase::render_markdown_preview as render_markdown_preview_usecase;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedMarkdownPreviewPayload {
    html: String,
    page_htmls: Vec<String>,
}

#[tauri::command]
pub fn render_markdown_preview(content: String) -> RenderedMarkdownPreviewPayload {
    let rendered_preview = render_markdown_preview_usecase(&content);

    RenderedMarkdownPreviewPayload {
        html: rendered_preview.html,
        page_htmls: rendered_preview.page_htmls,
    }
}
