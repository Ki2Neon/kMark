use crate::usecase::prepare_markdown_model_assets;
use kmark_contract::RenderedPreviewPayload;
use kmark_core::{render_markdown_preview_with_file_path_and_model_assets, PreviewDisplayMode};

fn render_markdown_preview_payload(
    content: String,
    file_path: Option<String>,
    display_mode: PreviewDisplayMode,
) -> RenderedPreviewPayload {
    let model_assets = prepare_markdown_model_assets(file_path.as_deref(), &content);
    let rendered_preview = render_markdown_preview_with_file_path_and_model_assets(
        &content,
        file_path.as_deref(),
        &model_assets,
    );

    RenderedPreviewPayload::from_pages(
        display_mode,
        rendered_preview.pages,
        rendered_preview.default_page_style,
        rendered_preview.default_text_style,
    )
}

#[tauri::command]
pub async fn render_markdown_preview(
    content: String,
    file_path: Option<String>,
    display_mode: String,
) -> Result<RenderedPreviewPayload, String> {
    let display_mode = PreviewDisplayMode::from_str(&display_mode)
        .ok_or_else(|| format!("unsupported preview display mode: {display_mode}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        render_markdown_preview_payload(content, file_path, display_mode)
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
        let payload = render_markdown_preview_payload(
            markdown.to_owned(),
            None,
            kmark_core::PreviewDisplayMode::Standard,
        );

        let kmark_contract::RenderedPreviewPayload::Standard { html, .. } = payload else {
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
    fn tauri_command_renders_saved_model_viewpoint_with_multibyte_alt_text() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let model_path = sandbox.join("gear.glb");
        fs::write(&markdown_path, "# note").expect("failed to create markdown");
        fs::write(&model_path, b"glTF\x02\0\0\0\x0c\0\0\0").expect("failed to create model");

        let payload = render_markdown_preview_payload(
            "<!-- kmark 3d_projection:perspective 3d_fov:45 3d_camera_position:1,2,3 3d_camera_target:0,0,0 3d_camera_zoom:1.5 -->\n![基板写真](./gear.glb)".to_owned(),
            Some(markdown_path.to_string_lossy().into_owned()),
            kmark_core::PreviewDisplayMode::Standard,
        );

        let kmark_contract::RenderedPreviewPayload::Standard { html, .. } = payload else {
            panic!("expected standard payload");
        };

        assert!(html.contains("data-kmark-model-source=\""));
        assert!(html.contains("data-kmark-model-display-src=\""));
        assert!(html.contains("gear.glb"));
        assert!(html.contains("aria-label=\"基板写真\""));
        assert!(html.contains("data-kmark-model-camera-position=\"1,2,3\""));
    }

    #[test]
    fn tauri_command_renders_saved_model_viewpoints_in_three_column_scope() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("test_3d.md");
        fs::write(&markdown_path, "# note").expect("failed to create markdown");
        for file_name in [
            "3x3フック-Body.stl",
            "dcdcps_buckle-Body.stl",
            "poop_shooter-Body.stl",
        ] {
            fs::write(
                sandbox.join(file_name),
                "solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a\n",
            )
            .expect("failed to create model");
        }

        let payload = render_markdown_preview_payload(
            "<!--k{ layout:row -->\n<!-- kmark 3d_projection:perspective 3d_fov:45 3d_camera_position:69.42524,69.42524,56.685471 3d_camera_target:0,0,0 -->\n<!-- kmark 3d_projection:perspective 3d_fov:45 3d_camera_position:69.42524,69.42524,56.685471 3d_camera_target:0,0,0 -->\n![1](3x3フック-Body.stl)\n<!-- kmark 3d_projection:perspective 3d_fov:45 3d_camera_position:56.209225,58.217715,44.846884 3d_camera_target:0,0,0 -->\n![](dcdcps_buckle-Body.stl)\n<!-- kmark 3d_projection:perspective 3d_fov:45 3d_camera_position:194.335673,194.335673,158.674412 3d_camera_target:0,0,0 -->\n![](poop_shooter-Body.stl)\n<!--k}-->".to_owned(),
            Some(markdown_path.to_string_lossy().into_owned()),
            kmark_core::PreviewDisplayMode::Standard,
        );

        let kmark_contract::RenderedPreviewPayload::Standard { html, .. } = payload else {
            panic!("expected standard payload");
        };

        assert_eq!(
            html.matches("<span class=\"kmark-model-viewer\"").count(),
            3
        );
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
