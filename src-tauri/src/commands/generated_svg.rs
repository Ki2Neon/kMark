use tauri::State;

use super::error::CommandErrorPayload;
use crate::{
    dto::{FinalizeGeneratedSvgRequestPayload, FinalizeGeneratedSvgResultPayload},
    AppState,
};
use kmark_core::{finalize_generated_svg as finalize_svg, GeneratedSvgPresentation};

#[tauri::command]
pub async fn finalize_generated_svg(
    state: State<'_, AppState>,
    request: FinalizeGeneratedSvgRequestPayload,
) -> Result<FinalizeGeneratedSvgResultPayload, CommandErrorPayload> {
    let https_hosts = state
        .preview_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?
        .plantuml_https_hosts()
        .to_vec();
    let revision = request.revision;
    let render_id = request.render_id;
    let worker_render_id = render_id.clone();
    let presentation = GeneratedSvgPresentation {
        root_style: request.presentation.root_style,
        position: request.presentation.position,
    };

    let svg = tauri::async_runtime::spawn_blocking(move || {
        finalize_svg(
            &request.raw_svg,
            &worker_render_id,
            &presentation,
            &https_hosts,
        )
    })
    .await
    .map_err(|error| {
        CommandErrorPayload::with_detail(
            "generated_svg_worker_failed",
            "generated SVG finalizer worker failed",
            error.to_string(),
        )
    })?
    .map_err(|error| CommandErrorPayload::new(error.code(), error.to_string()))?;

    Ok(FinalizeGeneratedSvgResultPayload {
        revision,
        render_id,
        svg,
    })
}
