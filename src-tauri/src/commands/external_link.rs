use super::error::CommandErrorPayload;

#[tauri::command]
pub fn open_external_link(url: String) -> Result<(), CommandErrorPayload> {
    let normalized_url = url.trim();

    if normalized_url.is_empty() {
        return Err(CommandErrorPayload::new(
            "invalid_external_link",
            "external link must not be empty",
        ));
    }

    if !is_supported_external_link(normalized_url) {
        return Err(CommandErrorPayload::with_detail(
            "unsupported_external_link",
            "unsupported external link scheme",
            normalized_url,
        ));
    }

    tauri_plugin_opener::open_url(normalized_url, None::<&str>).map_err(|source| {
        CommandErrorPayload::with_detail(
            "external_link_open_failed",
            "failed to open external link",
            source.to_string(),
        )
    })
}

fn is_supported_external_link(url: &str) -> bool {
    let normalized_url = url.trim().to_ascii_lowercase();

    normalized_url.starts_with("https://")
        || normalized_url.starts_with("http://")
        || normalized_url.starts_with("mailto:")
        || normalized_url.starts_with("tel:")
}
