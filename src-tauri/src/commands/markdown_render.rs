use crate::dto::RenderedMarkdownPreviewPayload;
use crate::usecase::prepare_markdown_model_assets;
use kmark_core::render_markdown_preview_with_file_path_and_model_assets;

fn render_markdown_preview_payload(
    content: String,
    file_path: Option<String>,
) -> RenderedMarkdownPreviewPayload {
    let model_assets = prepare_markdown_model_assets(file_path.as_deref(), &content);
    let rendered_preview = render_markdown_preview_with_file_path_and_model_assets(
        &content,
        file_path.as_deref(),
        &model_assets,
    );

    RenderedMarkdownPreviewPayload::from(rendered_preview)
}

#[tauri::command]
pub async fn render_markdown_preview(
    content: String,
    file_path: Option<String>,
) -> Result<RenderedMarkdownPreviewPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        render_markdown_preview_payload(content, file_path)
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::render_markdown_preview_payload;

    #[test]
    fn tauri_command_payload_matches_core_renderer() {
        let markdown = "| Left | Right |\n| :--- | ----: |\n| ~~a~~ | b |\n\n- [x] done\n\nNote[^alpha].\n\n[^alpha]: Footnote";
        let core_output = kmark_core::render_markdown_preview(markdown);
        let payload = render_markdown_preview_payload(markdown.to_owned(), None);

        assert_eq!(payload.html, core_output.html);
        assert_eq!(payload.page_htmls, core_output.page_htmls);
    }

    #[test]
    fn tauri_command_renders_saved_model_viewpoint_with_multibyte_alt_text() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let model_path = sandbox.join("gear.glb");
        fs::write(&markdown_path, "# note").expect("failed to create markdown");
        fs::write(&model_path, b"glTF\x02\0\0\0\x0c\0\0\0").expect("failed to create model");

        let payload = render_markdown_preview_payload(
            "<!-- kmark model_projection:perspective model_fov:45 model_camera_position:1,2,3 model_camera_target:0,0,0 model_camera_zoom:1.5 -->\n![基板写真](./gear.glb)".to_owned(),
            Some(markdown_path.to_string_lossy().into_owned()),
        );

        assert!(payload.html.contains("data-kmark-model-source=\""));
        assert!(payload.html.contains("data-kmark-model-display-src=\""));
        assert!(payload.html.contains("gear.glb"));
        assert!(payload.html.contains("aria-label=\"基板写真\""));
        assert!(payload
            .html
            .contains("data-kmark-model-camera-position=\"1,2,3\""));
    }

    fn create_temp_test_directory() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("kmark-render-command-test-{suffix}"));
        fs::create_dir_all(&directory).expect("failed to create temp directory");
        directory
    }
}
