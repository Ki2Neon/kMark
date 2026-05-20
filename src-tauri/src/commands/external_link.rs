use std::{fs, io::ErrorKind, path::PathBuf, sync::atomic::Ordering, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{DownloadEvent, NewWindowResponse},
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Rect, Runtime, Size, Url, Webview,
    WebviewBuilder, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
};

use super::error::CommandErrorPayload;
use crate::{AppState, SUB_WINDOW_LABEL_PREFIX};

pub(crate) const SANDBOX_BROWSER_LABEL_PREFIX: &str = "sandbox-browser-";
const SUB_WINDOW_BROWSER_LABEL_PREFIX: &str = "subwindow-browser-";
const SANDBOX_BROWSER_DATA_DIRECTORY_NAME: &str = "sandbox-browser";
const SUB_WINDOW_BROWSER_DATA_DIRECTORY_NAME: &str = "subwindow-browser";
const SANDBOX_BROWSER_DATA_REMOVAL_INITIAL_DELAY_MS: u64 = 1_000;
const SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT: usize = 60;
const SANDBOX_BROWSER_DATA_REMOVAL_RETRY_DELAY_MS: u64 = 500;
const SANDBOX_BROWSER_TITLE_PREFIX: &str = "Sandbox Browser - ";
const SANDBOX_BROWSER_TITLE_URL_MAX_CHARS: usize = 160;
const SUB_WINDOW_BROWSER_GAP_LOGICAL_PX: f64 = 100.0;
const SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE: f64 = 1.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSubWindowExternalBrowserResponsePayload {
    browser_id: String,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubWindowBrowserBoundsPayload {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

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

#[tauri::command]
pub async fn open_sub_window_external_browser(
    app: AppHandle,
    window: Window,
    webview: Webview,
    url: String,
) -> Result<OpenSubWindowExternalBrowserResponsePayload, CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        open_sub_window_external_browser_on_blocking_thread(app, window, webview, url)
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser open task",
            source.to_string(),
        )
    })?
}

fn open_sub_window_external_browser_on_blocking_thread(
    app: AppHandle,
    window: Window,
    webview: Webview,
    url: String,
) -> Result<OpenSubWindowExternalBrowserResponsePayload, CommandErrorPayload> {
    ensure_sub_window_browser_host(&window, &webview)?;

    let parsed_url = parse_supported_external_link_url(&url)?;
    let bounds = sub_window_browser_bounds_for_window(&window)?;
    let label = next_sub_window_browser_label(&app);
    let data_directory = sub_window_browser_data_directory(&app, &label)?;

    fs::create_dir_all(&data_directory).map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_data_dir_create_failed",
            "failed to create subwindow browser data directory",
            source.to_string(),
        )
    })?;

    let browser_webview =
        WebviewBuilder::new(label.clone(), WebviewUrl::External(parsed_url.clone()))
            .auto_resize()
            .incognito(true)
            .focused(false)
            .data_directory(data_directory)
            .on_navigation(is_supported_external_url)
            .on_new_window(|_url, _features| NewWindowResponse::Deny)
            .on_download(|_webview, event| {
                if let DownloadEvent::Requested { url, .. } = event {
                    eprintln!("blocked subwindow browser download: {url}");
                }

                false
            });

    window
        .add_child(browser_webview, bounds.position, bounds.size)
        .map_err(|source| {
            CommandErrorPayload::with_detail(
                "subwindow_browser_open_failed",
                "failed to open subwindow browser",
                source.to_string(),
            )
        })?;

    Ok(OpenSubWindowExternalBrowserResponsePayload { browser_id: label })
}

#[tauri::command]
pub async fn close_sub_window_external_browser(
    app: AppHandle,
    window: Window,
    webview: Webview,
    browser_id: String,
) -> Result<(), CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_sub_window_browser_host(&window, &webview)?;
        close_sub_window_browser_by_label(&app, window.label(), &browser_id)
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser close task",
            source.to_string(),
        )
    })?
}

#[tauri::command]
pub async fn resize_sub_window_external_browser(
    app: AppHandle,
    window: Window,
    webview: Webview,
    browser_id: String,
    bounds: SubWindowBrowserBoundsPayload,
) -> Result<(), CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_sub_window_browser_host(&window, &webview)?;
        let bounds = validate_sub_window_browser_bounds(bounds)?;
        let browser_webview = resolve_sub_window_browser_webview(&app, window.label(), &browser_id)?;

        browser_webview.set_bounds(bounds).map_err(|source| {
            CommandErrorPayload::with_detail(
                "subwindow_browser_resize_failed",
                "failed to resize subwindow browser",
                source.to_string(),
            )
        })
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser resize task",
            source.to_string(),
        )
    })?
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

    remove_browser_data_directory(data_directory, "sandbox browser");
}

pub(crate) fn close_sub_window_external_browsers_for_window_label<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
) {
    if !window_label.starts_with(SUB_WINDOW_LABEL_PREFIX) {
        return;
    }

    for (label, webview) in app.webviews() {
        if !is_sub_window_browser_label(&label) || webview.window().label() != window_label {
            continue;
        }

        clear_sub_window_browser_browsing_data(&webview);
        if let Err(error) = webview.close() {
            eprintln!("failed to close subwindow browser webview: {error}");
        }
        remove_sub_window_browser_data_directory(app, &label);
    }
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

fn next_sub_window_browser_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let state = app.state::<AppState>();
    let next_sequence = state
        .next_sandbox_browser_sequence
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    format!("{SUB_WINDOW_BROWSER_LABEL_PREFIX}{next_sequence}")
}

fn is_sandbox_browser_window_label(label: &str) -> bool {
    let Some(sequence) = label.strip_prefix(SANDBOX_BROWSER_LABEL_PREFIX) else {
        return false;
    };

    !sequence.is_empty() && sequence.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_sub_window_browser_label(label: &str) -> bool {
    let Some(sequence) = label.strip_prefix(SUB_WINDOW_BROWSER_LABEL_PREFIX) else {
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

fn sub_window_browser_data_directory<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
) -> Result<PathBuf, CommandErrorPayload> {
    if !is_sub_window_browser_label(label) {
        return Err(CommandErrorPayload::with_detail(
            "invalid_subwindow_browser_label",
            "subwindow browser label is invalid",
            label,
        ));
    }

    let mut path = app.path().app_cache_dir().map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_data_dir_unavailable",
            "failed to resolve subwindow browser data directory",
            source.to_string(),
        )
    })?;

    path.push(SUB_WINDOW_BROWSER_DATA_DIRECTORY_NAME);
    path.push(label);

    Ok(path)
}

fn remove_sub_window_browser_data_directory<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if !is_sub_window_browser_label(label) {
        return;
    }

    let data_directory = match sub_window_browser_data_directory(app, label) {
        Ok(path) => path,
        Err(error) => {
            eprintln!(
                "failed to resolve subwindow browser data directory: {}",
                error.message()
            );
            return;
        }
    };

    remove_browser_data_directory(data_directory, "subwindow browser");
}

fn remove_browser_data_directory(data_directory: PathBuf, context: &'static str) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(
            SANDBOX_BROWSER_DATA_REMOVAL_INITIAL_DELAY_MS,
        ));

        for attempt in 0..SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT {
            match fs::remove_dir_all(&data_directory) {
                Ok(()) => return,
                Err(error) if error.kind() == ErrorKind::NotFound => return,
                Err(_) if attempt + 1 < SANDBOX_BROWSER_DATA_REMOVAL_RETRY_COUNT => thread::sleep(
                    Duration::from_millis(SANDBOX_BROWSER_DATA_REMOVAL_RETRY_DELAY_MS),
                ),
                Err(error) => {
                    eprintln!("failed to remove {context} data directory: {error}");
                    return;
                }
            }
        }
    });
}

fn ensure_sub_window_browser_host<R: Runtime>(
    window: &Window<R>,
    webview: &Webview<R>,
) -> Result<(), CommandErrorPayload> {
    if !window.label().starts_with(SUB_WINDOW_LABEL_PREFIX) {
        return Err(CommandErrorPayload::with_detail(
            "not_subwindow",
            "current window is not a subwindow",
            window.label(),
        ));
    }

    if webview.label() != window.label() {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_ipc_forbidden",
            "only the subwindow host webview can control the embedded browser",
            webview.label(),
        ));
    }

    Ok(())
}

fn resolve_sub_window_browser_webview<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
    browser_id: &str,
) -> Result<Webview<R>, CommandErrorPayload> {
    if !is_sub_window_browser_label(browser_id) {
        return Err(CommandErrorPayload::with_detail(
            "invalid_subwindow_browser_label",
            "subwindow browser label is invalid",
            browser_id,
        ));
    }

    let Some(webview) = app.get_webview(browser_id) else {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_not_found",
            "subwindow browser is not open",
            browser_id,
        ));
    };

    if webview.window().label() != window_label {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_window_mismatch",
            "subwindow browser does not belong to current window",
            browser_id,
        ));
    }

    Ok(webview)
}

fn close_sub_window_browser_by_label<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
    browser_id: &str,
) -> Result<(), CommandErrorPayload> {
    let browser_webview = resolve_sub_window_browser_webview(app, window_label, browser_id)?;

    clear_sub_window_browser_browsing_data(&browser_webview);
    browser_webview.close().map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_close_failed",
            "failed to close subwindow browser",
            source.to_string(),
        )
    })?;
    remove_sub_window_browser_data_directory(app, browser_id);

    Ok(())
}

fn clear_sub_window_browser_browsing_data<R: Runtime>(webview: &Webview<R>) {
    if !is_sub_window_browser_label(webview.label()) {
        return;
    }

    if let Err(error) = webview.clear_all_browsing_data() {
        eprintln!("failed to clear subwindow browser browsing data: {error}");
    }
}

fn validate_sub_window_browser_bounds(
    bounds: SubWindowBrowserBoundsPayload,
) -> Result<Rect, CommandErrorPayload> {
    let values = [bounds.x, bounds.y, bounds.width, bounds.height];

    if !values.iter().all(|value| value.is_finite())
        || bounds.x < 0.0
        || bounds.y < 0.0
        || bounds.width < SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE
        || bounds.height < SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE
    {
        return Err(CommandErrorPayload::new(
            "invalid_subwindow_browser_bounds",
            "subwindow browser bounds are invalid",
        ));
    }

    Ok(Rect {
        position: Position::Logical(LogicalPosition::new(bounds.x, bounds.y)),
        size: Size::Logical(LogicalSize::new(bounds.width, bounds.height)),
    })
}

fn sub_window_browser_bounds_for_window<R: Runtime>(
    window: &Window<R>,
) -> Result<Rect, CommandErrorPayload> {
    let inner_size = window.inner_size().map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_bounds_unavailable",
            "failed to resolve subwindow browser host size",
            source.to_string(),
        )
    })?;
    let scale_factor = window.scale_factor().map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_bounds_unavailable",
            "failed to resolve subwindow browser host scale factor",
            source.to_string(),
        )
    })?;
    let host_width = inner_size.width as f64 / scale_factor;
    let host_height = inner_size.height as f64 / scale_factor;
    let (x, width) = resolve_sub_window_browser_axis(host_width);
    let (y, height) = resolve_sub_window_browser_axis(host_height);

    Ok(Rect {
        position: Position::Logical(LogicalPosition::new(x, y)),
        size: Size::Logical(LogicalSize::new(width, height)),
    })
}

fn resolve_sub_window_browser_axis(total_size: f64) -> (f64, f64) {
    if total_size
        > SUB_WINDOW_BROWSER_GAP_LOGICAL_PX.mul_add(2.0, SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE)
    {
        (
            SUB_WINDOW_BROWSER_GAP_LOGICAL_PX,
            total_size - SUB_WINDOW_BROWSER_GAP_LOGICAL_PX * 2.0,
        )
    } else {
        (0.0, total_size.max(SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE))
    }
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
