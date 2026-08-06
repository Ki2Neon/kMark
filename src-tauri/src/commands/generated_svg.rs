use tauri::State;

use super::error::CommandErrorPayload;
use crate::{
    dto::{FinalizeGeneratedSvgRequestPayload, FinalizeGeneratedSvgResultPayload},
    AppState,
};
use kmark_core::{
    finalize_generated_svg as finalize_svg, normalize_plantuml_https_hosts,
    GeneratedSvgPresentation,
};

#[tauri::command]
pub async fn finalize_generated_svg(
    state: State<'_, AppState>,
    request: FinalizeGeneratedSvgRequestPayload,
) -> Result<FinalizeGeneratedSvgResultPayload, CommandErrorPayload> {
    let requested_https_hosts = normalize_plantuml_https_hosts(&request.https_hosts)
        .map_err(|message| CommandErrorPayload::new("generated_svg_invalid_hosts", message))?;
    let configured_https_hosts = state
        .preview_preferences
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("preview preferences"))?
        .plantuml_https_hosts()
        .to_vec();
    let https_hosts =
        authorized_requested_https_hosts(&requested_https_hosts, &configured_https_hosts);
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

fn authorized_requested_https_hosts(requested: &[String], configured: &[String]) -> Vec<String> {
    requested
        .iter()
        .filter(|host| configured.contains(host))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::authorized_requested_https_hosts;

    #[test]
    fn limits_generated_svg_host_policy_to_requested_and_configured_hosts() {
        let requested = vec![
            "b.example.test".to_owned(),
            "evil.example.test".to_owned(),
            "a.example.test".to_owned(),
        ];
        let configured = vec!["a.example.test".to_owned(), "b.example.test".to_owned()];

        assert_eq!(
            authorized_requested_https_hosts(&requested, &configured),
            vec!["b.example.test".to_owned(), "a.example.test".to_owned()]
        );
    }
}
