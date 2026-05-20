use std::{fs, io::ErrorKind, path::PathBuf, sync::atomic::Ordering, thread, time::Duration};

use tauri::{
    webview::{DownloadEvent, NewWindowResponse},
    AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use super::error::CommandErrorPayload;
use crate::AppState;

pub(crate) const SANDBOX_BROWSER_LABEL_PREFIX: &str = "sandbox-browser-";
const SANDBOX_BROWSER_DATA_DIRECTORY_NAME: &str = "sandbox-browser";
const SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT: usize = 6;
const SANDBOX_BROWSER_DATA_REMOVAL_RETRY_DELAY_MS: u64 = 250;
const SANDBOX_BROWSER_TITLE_PREFIX: &str = "Sandbox Browser - ";
const SANDBOX_BROWSER_TITLE_URL_MAX_CHARS: usize = 160;

#[tauri::command]
pub async fn open_external_link(
    app: AppHandle,
    window: WebviewWindow,
    url: String,
) -> Result<(), CommandErrorPayload> {
    if is_sandbox_browser_window_label(window.label()) {
        return Err(CommandErrorPayload::with_detail(
            "sandbox_browser_ipc_forbidden",
            "sandbox browser windows cannot open external links through IPC",
            window.label(),
        ));
    }

    let parsed_url = parse_supported_external_link_url(&url)?;
    let label = next_sandbox_browser_label(&app);
    let data_directory = sandbox_browser_data_directory(&app, &label)?;

    fs::create_dir_all(&data_directory).map_err(|source| {
        CommandErrorPayload::with_detail(
            "sandbox_browser_data_dir_create_failed",
            "failed to create sandbox browser data directory",
            source.to_string(),
        )
    })?;

    let sandbox_window =
        WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed_url.clone()))
            .title(sandbox_browser_title(parsed_url.as_str()))
            .inner_size(1180.0, 820.0)
            .min_inner_size(480.0, 320.0)
            .visible(true)
            .focused(true)
            .incognito(true)
            .data_directory(data_directory)
            .on_navigation(is_supported_external_url)
            .on_new_window(|_url, _features| NewWindowResponse::Deny)
            .on_download(|_webview, event| {
                if let DownloadEvent::Requested { url, .. } = event {
                    eprintln!("blocked sandbox browser download: {url}");
                }

                false
            })
            .on_page_load(|window, payload| {
                let _ = window.set_title(&sandbox_browser_title(payload.url().as_str()));
            })
            .build()
            .map_err(|source| {
                CommandErrorPayload::with_detail(
                    "sandbox_browser_open_failed",
                    "failed to open sandbox browser window",
                    source.to_string(),
                )
            })?;

    let _ = sandbox_window.set_focus();

    Ok(())
}

pub(crate) fn clear_sandbox_browser_browsing_data<R: Runtime>(window: &WebviewWindow<R>) {
    if !is_sandbox_browser_window_label(window.label()) {
        return;
    }

    if let Err(error) = window.clear_all_browsing_data() {
        eprintln!("failed to clear sandbox browser browsing data: {error}");
    }
}

pub(crate) fn remove_sandbox_browser_data_directory<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if !is_sandbox_browser_window_label(label) {
        return;
    }

    let data_directory = match sandbox_browser_data_directory(app, label) {
        Ok(path) => path,
        Err(error) => {
            eprintln!(
                "failed to resolve sandbox browser data directory: {}",
                error.message()
            );
            return;
        }
    };

    thread::spawn(move || {
        for attempt in 0..SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT {
            match fs::remove_dir_all(&data_directory) {
                Ok(()) => return,
                Err(error) if error.kind() == ErrorKind::NotFound => return,
                Err(error) if attempt + 1 < SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT => {
                    eprintln!("retrying sandbox browser data directory removal: {error}");
                    thread::sleep(Duration::from_millis(
                        SANDBOX_BROWSER_DATA_REMOVAL_RETRY_DELAY_MS,
                    ));
                }
                Err(error) => {
                    eprintln!("failed to remove sandbox browser data directory: {error}");
                    return;
                }
            }
        }
    });
}

fn parse_supported_external_link_url(url: &str) -> Result<Url, CommandErrorPayload> {
    let normalized_url = url.trim();

    if normalized_url.is_empty() {
        return Err(CommandErrorPayload::new(
            "invalid_external_link",
            "external link must not be empty",
        ));
    }

    let parsed_url = Url::parse(normalized_url).map_err(|source| {
        CommandErrorPayload::with_detail(
            "invalid_external_link",
            "external link URL is invalid",
            source.to_string(),
        )
    })?;

    if !is_supported_external_url(&parsed_url) {
        return Err(CommandErrorPayload::with_detail(
            "unsupported_external_link",
            "unsupported external link scheme",
            normalized_url,
        ));
    }

    Ok(parsed_url)
}

fn is_supported_external_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

fn next_sandbox_browser_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_sandbox_browser_sequence
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    format!("{SANDBOX_BROWSER_LABEL_PREFIX}{next_sequence}")
}

fn is_sandbox_browser_window_label(label: &str) -> bool {
    let Some(sequence) = label.strip_prefix(SANDBOX_BROWSER_LABEL_PREFIX) else {
        return false;
    };

    !sequence.is_empty() && sequence.bytes().all(|byte| byte.is_ascii_digit())
}

fn sandbox_browser_data_directory<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
) -> Result<PathBuf, CommandErrorPayload> {
    if !is_sandbox_browser_window_label(label) {
        return Err(CommandErrorPayload::with_detail(
            "invalid_sandbox_browser_label",
            "sandbox browser label is invalid",
            label,
        ));
    }

    let mut path = app.path().app_cache_dir().map_err(|source| {
        CommandErrorPayload::with_detail(
            "sandbox_browser_data_dir_unavailable",
            "failed to resolve sandbox browser data directory",
            source.to_string(),
        )
    })?;

    path.push(SANDBOX_BROWSER_DATA_DIRECTORY_NAME);
    path.push(label);

    Ok(path)
}

fn sandbox_browser_title(url: &str) -> String {
    let mut shortened_url = String::new();

    for (index, character) in url.chars().enumerate() {
        if index >= SANDBOX_BROWSER_TITLE_URL_MAX_CHARS {
            shortened_url.push_str("...");
            return format!("{SANDBOX_BROWSER_TITLE_PREFIX}{shortened_url}");
        }

        shortened_url.push(character);
    }

    format!("{SANDBOX_BROWSER_TITLE_PREFIX}{shortened_url}")
}

#[cfg(test)]
mod tests {
    use super::{is_supported_external_url, parse_supported_external_link_url};

    #[test]
    fn accepts_only_http_and_https_urls() {
        for url in ["https://example.com", "http://example.com/path"] {
            let parsed = parse_supported_external_link_url(url).expect("url should be supported");
            assert!(is_supported_external_url(&parsed));
        }

        for url in [
            "",
            "mailto:user@example.com",
            "tel:123",
            "file:///tmp/a.md",
            "app://localhost/index.html",
            "tauri://localhost/index.html",
            "javascript:alert(1)",
            "data:text/html,hello",
            "blob:https://example.com/id",
            "about:blank",
            "chrome://settings",
            "edge://settings",
            "/relative/path",
        ] {
            assert!(
                parse_supported_external_link_url(url).is_err(),
                "url should be rejected: {url}"
            );
        }
    }
}
