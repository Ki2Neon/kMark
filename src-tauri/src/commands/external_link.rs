use std::{
    fs,
    io::ErrorKind,
    path::PathBuf,
    sync::atomic::Ordering,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{Color, DownloadEvent, NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Rect, Runtime, Size, Url,
    Webview, WebviewBuilder, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
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
const SANDBOX_BROWSER_ADDITIONAL_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --enable-smooth-scrolling --enable-features=SmoothScrolling";
const SANDBOX_BROWSER_SMOOTH_SCROLL_SCRIPT: &str = r##"
(() => {
  const STYLE_ID = "kmark-sandbox-smooth-scroll-style";

  const installStyle = () => {
    const doc = window.document;
    if (doc.getElementById(STYLE_ID) !== null) {
      return;
    }

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html,
      body,
      * {
        scroll-behavior: smooth !important;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  };

  installStyle();
  window.document.addEventListener("DOMContentLoaded", installStyle, { once: true });
})();
"##;
const SUB_WINDOW_BROWSER_HORIZONTAL_GAP_LOGICAL_PX: f64 = 100.0;
const SUB_WINDOW_BROWSER_VERTICAL_GAP_RATIO: f64 = 0.05;
const SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE: f64 = 1.0;
const SUB_WINDOW_BROWSER_HOST_EVENT: &str = "subwindow-browser-host-event";
const SUB_WINDOW_BROWSER_CLOSE_REQUESTED_EVENT: &str = "closeRequested";
const SUB_WINDOW_BROWSER_LOADED_EVENT: &str = "loaded";
const SUB_WINDOW_BROWSER_REVEAL_STARTED_EVENT: &str = "revealStarted";
const SUB_WINDOW_BROWSER_MIN_ZOOM_SCALE: f64 = 0.2;
const SUB_WINDOW_BROWSER_MAX_ZOOM_SCALE: f64 = 5.0;
const SUB_WINDOW_BROWSER_MAX_FADE_MS: u32 = 5_000;
const SUB_WINDOW_BROWSER_BEGIN_CLOSE_SCRIPT: &str = r#"
try {
  if (typeof window.__KMARK_SANDBOX_BROWSER_BEGIN_CLOSE__ === "function") {
    window.__KMARK_SANDBOX_BROWSER_BEGIN_CLOSE__();
  }
} catch (_) {}
"#;
const SUB_WINDOW_BROWSER_BEGIN_REVEAL_SCRIPT: &str = r#"
try {
  if (typeof window.__KMARK_SANDBOX_BROWSER_BEGIN_REVEAL__ === "function") {
    window.__KMARK_SANDBOX_BROWSER_BEGIN_REVEAL__();
  }
} catch (_) {}
"#;
const SUB_WINDOW_BROWSER_PREPARE_REVEAL_SCRIPT: &str = r#"
try {
  if (typeof window.__KMARK_SANDBOX_BROWSER_PREPARE_REVEAL__ === "function") {
    window.__KMARK_SANDBOX_BROWSER_PREPARE_REVEAL__();
  }
} catch (_) {}
"#;
const SUB_WINDOW_BROWSER_INIT_SCRIPT: &str = r##"
(() => {
  const TOKEN = __KMARK_TOKEN__;
  const FADE_MS = __KMARK_FADE_MS__;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5.0;
  const ZOOM_STEP = 0.1;
  const REVEAL_SETTLE_MS = 180;
  const REVEAL_BACKGROUND_RESTORE_DELAY_MS = 80;
  const TRANSPARENT_BACKGROUND = "rgba(0, 0, 0, 0)";
  const DEFAULT_REVEAL_BACKGROUND = "#fff";
  const BACKGROUND_ELEMENT_ID = "kmark-sandbox-browser-background";
  const REVEAL_TRANSITION = `opacity ${FADE_MS}ms cubic-bezier(.22, .61, .36, 1)`;
  let zoomScale = 1;
  let zoomElement = null;
  let backgroundElement = null;
  let revealRestoreTimeoutId = null;

  const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  const isZoomed = () => Math.abs(zoomScale - 1) > 0.001;
  const setImportantStyle = (element, name, value) => {
    try {
      element.style.setProperty(name, value, "important");
    } catch (_) {}
  };
  const removeInlineStyle = (element, name) => {
    try {
      element.style.removeProperty(name);
    } catch (_) {}
  };
  const clearRevealRestoreTimeout = () => {
    if (revealRestoreTimeoutId === null) {
      return;
    }

    window.clearTimeout(revealRestoreTimeoutId);
    revealRestoreTimeoutId = null;
  };
  const isTransparentBackground = (value) => {
    if (typeof value !== "string") {
      return true;
    }

    const normalizedValue = value.trim().toLowerCase();
    return normalizedValue === ""
      || normalizedValue === "transparent"
      || normalizedValue === TRANSPARENT_BACKGROUND;
  };
  const resolveRevealBackground = () => {
    try {
      const doc = window.document;
      const candidates = [doc.body, doc.documentElement];

      for (const element of candidates) {
        if (element === null) {
          continue;
        }

        const backgroundColor = window.getComputedStyle(element).backgroundColor;
        if (!isTransparentBackground(backgroundColor)) {
          return backgroundColor;
        }
      }

      const retainedBackground = doc.documentElement.style
        .getPropertyValue("--kmark-sandbox-browser-background")
        .trim();
      if (!isTransparentBackground(retainedBackground)) {
        return retainedBackground;
      }
    } catch (_) {}

    return DEFAULT_REVEAL_BACKGROUND;
  };
  const syncRevealBackground = () => {
    try {
      window.document.documentElement.style.setProperty(
        "--kmark-sandbox-browser-background",
        resolveRevealBackground(),
      );
    } catch (_) {}
  };
  const holdCanvasBackground = () => {
    const doc = window.document;
    const root = doc.documentElement;

    root.setAttribute("data-kmark-sandbox-background-held", "true");
    setImportantStyle(root, "background", "transparent");

    if (doc.body !== null) {
      setImportantStyle(doc.body, "background", "transparent");
    }
  };
  const restoreCanvasBackground = () => {
    const doc = window.document;
    const root = doc.documentElement;

    root.removeAttribute("data-kmark-sandbox-background-held");
    removeInlineStyle(root, "background");

    if (doc.body !== null) {
      removeInlineStyle(doc.body, "background");
    }
  };
  const scheduleCanvasBackgroundRestore = () => {
    clearRevealRestoreTimeout();

    revealRestoreTimeoutId = window.setTimeout(() => {
      revealRestoreTimeoutId = null;

      const root = window.document.documentElement;
      if (
        root.getAttribute("data-kmark-sandbox-reveal") === "visible"
        && root.getAttribute("data-kmark-sandbox-closing") !== "true"
      ) {
        restoreCanvasBackground();
      }
    }, Math.max(0, FADE_MS + REVEAL_BACKGROUND_RESTORE_DELAY_MS));
  };
  const prepareReveal = () => {
    try {
      const doc = window.document;
      const root = doc.documentElement;

      clearRevealRestoreTimeout();
      syncRevealBackground();
      root.removeAttribute("data-kmark-sandbox-closing");
      root.setAttribute("data-kmark-sandbox-reveal", "pending");
      setImportantStyle(root, "transition", "none");
      setImportantStyle(root, "opacity", "0");
      holdCanvasBackground();
    } catch (_) {}
  };
  const finishReveal = () => {
    const doc = window.document;
    const root = doc.documentElement;

    root.setAttribute("data-kmark-sandbox-reveal", "visible");
    holdCanvasBackground();
    setImportantStyle(root, "transition", REVEAL_TRANSITION);
    setImportantStyle(root, "opacity", "1");
    bridge({ type: "revealStarted" });
    scheduleCanvasBackgroundRestore();
  };
  const afterPaintSettled = (callback) => {
    const runFrames = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.setTimeout(callback, REVEAL_SETTLE_MS);
          });
        });
      });
    };

    try {
      if (window.document.fonts && typeof window.document.fonts.ready?.then === "function") {
        window.document.fonts.ready.then(runFrames, runFrames);
        return;
      }
    } catch (_) {}

    runFrames();
  };
  const bridge = (event) => {
    try {
      const internals = window.__TAURI_INTERNALS__;
      if (internals === undefined || typeof internals.invoke !== "function") {
        return;
      }
      internals.invoke("sub_window_browser_event", { token: TOKEN, event }).catch(() => {});
    } catch (_) {}
  };

  const ensureUi = () => {
    const doc = window.document;
    const root = doc.documentElement;

    if (doc.getElementById("kmark-sandbox-browser-style") === null) {
      const style = doc.createElement("style");
      style.id = "kmark-sandbox-browser-style";
      style.textContent = `
        html,
        body,
        * {
          scroll-behavior: smooth !important;
        }
        html,
        body {
          scrollbar-color: transparent transparent !important;
          transition: scrollbar-color ${FADE_MS}ms cubic-bezier(.22, .61, .36, 1) !important;
        }
        html[data-kmark-sandbox-reveal="pending"] {
          opacity: 0 !important;
        }
        #${BACKGROUND_ELEMENT_ID} {
          position: fixed !important;
          inset: 0 !important;
          z-index: -1 !important;
          display: none !important;
          pointer-events: none !important;
          background: var(--kmark-sandbox-browser-background, #fff) !important;
          opacity: 1 !important;
        }
        html[data-kmark-sandbox-background-held="true"] #${BACKGROUND_ELEMENT_ID} {
          display: block !important;
        }
        html[data-kmark-sandbox-background-held="true"] body {
          isolation: isolate !important;
        }
        html[data-kmark-sandbox-reveal="pending"],
        html[data-kmark-sandbox-reveal="pending"] body,
        html[data-kmark-sandbox-closing="true"],
        html[data-kmark-sandbox-closing="true"] body {
          background: transparent !important;
        }
        html[data-kmark-sandbox-closing="true"] {
          opacity: 0 !important;
        }
        html[data-kmark-sandbox-reveal="visible"],
        html[data-kmark-sandbox-reveal="visible"] body {
          scrollbar-color: rgba(148, 163, 184, .55) transparent !important;
        }
        html::-webkit-scrollbar-thumb,
        body::-webkit-scrollbar-thumb {
          background-color: transparent !important;
          transition: background-color ${FADE_MS}ms cubic-bezier(.22, .61, .36, 1) !important;
        }
        html::-webkit-scrollbar-track,
        body::-webkit-scrollbar-track {
          background-color: transparent !important;
          transition: background-color ${FADE_MS}ms cubic-bezier(.22, .61, .36, 1) !important;
        }
        html[data-kmark-sandbox-reveal="visible"]::-webkit-scrollbar-thumb,
        html[data-kmark-sandbox-reveal="visible"] body::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, .55) !important;
        }
        html[data-kmark-sandbox-closing="true"]::-webkit-scrollbar-thumb,
        html[data-kmark-sandbox-closing="true"] body::-webkit-scrollbar-thumb {
          background-color: transparent !important;
        }
        #kmark-sandbox-browser-zoom {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483647;
          min-width: 58px;
          height: 32px;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 0 10px;
          border: 1px solid rgba(255, 255, 255, .18);
          border-radius: 8px;
          background: rgba(14, 17, 23, .82);
          color: #f7f9ff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, .24);
          font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0;
          user-select: none;
          cursor: pointer;
          backdrop-filter: blur(10px);
        }
        html[data-kmark-sandbox-zoomed="true"] #kmark-sandbox-browser-zoom {
          display: flex;
        }
      `;
      (doc.head || root).appendChild(style);
    }

    if (doc.body === null) {
      doc.addEventListener("DOMContentLoaded", ensureUi, { once: true });
      return;
    }

    if (backgroundElement === null || !doc.contains(backgroundElement)) {
      const existingBackgroundElement = doc.getElementById(BACKGROUND_ELEMENT_ID);
      if (existingBackgroundElement instanceof HTMLElement) {
        backgroundElement = existingBackgroundElement;
      } else {
        backgroundElement = doc.createElement("div");
        backgroundElement.id = BACKGROUND_ELEMENT_ID;
        backgroundElement.setAttribute("aria-hidden", "true");
      }
    }

    if (backgroundElement.parentElement !== doc.body) {
      doc.body.appendChild(backgroundElement);
    }

    if (zoomElement === null || !doc.contains(zoomElement)) {
      zoomElement = doc.createElement("button");
      zoomElement.id = "kmark-sandbox-browser-zoom";
      zoomElement.type = "button";
      zoomElement.title = "Reset zoom";
      zoomElement.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setZoom(1);
      }, true);
      doc.body.appendChild(zoomElement);
    }

    updateZoomBadge();
  };

  const updateZoomBadge = () => {
    const root = window.document.documentElement;
    if (isZoomed()) {
      root.setAttribute("data-kmark-sandbox-zoomed", "true");
    } else {
      root.removeAttribute("data-kmark-sandbox-zoomed");
    }
    if (zoomElement !== null) {
      zoomElement.textContent = `${Math.round(zoomScale * 100)}%`;
    }
  };

  const setZoom = (nextZoom) => {
    const resolvedZoom = Math.round(clampZoom(nextZoom) * 100) / 100;
    if (Math.abs(resolvedZoom - zoomScale) < 0.001) {
      return;
    }
    zoomScale = resolvedZoom;
    ensureUi();
    updateZoomBadge();
    bridge({ type: "zoom", zoom: zoomScale });
  };

  const beginReveal = () => {
    ensureUi();

    if (window.document.documentElement.getAttribute("data-kmark-sandbox-reveal") !== "pending") {
      prepareReveal();
    }

    if (FADE_MS <= 0) {
      finishReveal();
      return;
    }

    afterPaintSettled(finishReveal);
  };

  const beginClose = () => {
    ensureUi();
    const root = window.document.documentElement;

    clearRevealRestoreTimeout();
    syncRevealBackground();
    holdCanvasBackground();
    root.setAttribute("data-kmark-sandbox-reveal", "visible");
    root.setAttribute("data-kmark-sandbox-closing", "true");
    setImportantStyle(root, "transition", REVEAL_TRANSITION);
    setImportantStyle(root, "opacity", "0");
  };

  try {
    Object.defineProperty(window, "__KMARK_SANDBOX_BROWSER_BEGIN_REVEAL__", {
      value: beginReveal,
      configurable: false,
      writable: false,
    });
  } catch (_) {
    window.__KMARK_SANDBOX_BROWSER_BEGIN_REVEAL__ = beginReveal;
  }

  try {
    Object.defineProperty(window, "__KMARK_SANDBOX_BROWSER_PREPARE_REVEAL__", {
      value: prepareReveal,
      configurable: false,
      writable: false,
    });
  } catch (_) {
    window.__KMARK_SANDBOX_BROWSER_PREPARE_REVEAL__ = prepareReveal;
  }

  try {
    Object.defineProperty(window, "__KMARK_SANDBOX_BROWSER_BEGIN_CLOSE__", {
      value: beginClose,
      configurable: false,
      writable: false,
    });
  } catch (_) {
    window.__KMARK_SANDBOX_BROWSER_BEGIN_CLOSE__ = beginClose;
  }

  const requestClose = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    bridge({ type: "close" });
  };

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      requestClose(event);
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setZoom(1);
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setZoom(zoomScale + ZOOM_STEP);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setZoom(zoomScale - ZOOM_STEP);
    }
  }, true);

  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    setZoom(zoomScale + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { capture: true, passive: false });

  prepareReveal();
  ensureUi();
  bridge({ type: "zoom", zoom: 1 });
})();
"##;

#[derive(Clone, Serialize)]
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubWindowBrowserHostEventPayload<'a> {
    browser_id: &'a str,
    event: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubWindowBrowserEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    zoom: Option<f64>,
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
            .additional_browser_args(SANDBOX_BROWSER_ADDITIONAL_BROWSER_ARGS)
            .initialization_script(SANDBOX_BROWSER_SMOOTH_SCROLL_SCRIPT)
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
    fade_ms: u32,
) -> Result<OpenSubWindowExternalBrowserResponsePayload, CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        open_sub_window_external_browser_on_blocking_thread(app, window, webview, url, fade_ms)
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
    fade_ms: u32,
) -> Result<OpenSubWindowExternalBrowserResponsePayload, CommandErrorPayload> {
    ensure_sub_window_browser_host(&window, &webview)?;

    let parsed_url = parse_supported_external_link_url(&url)?;
    let bounds = sub_window_browser_bounds_for_window(&window)?;
    let label = next_sub_window_browser_label(&app);
    let token = next_sub_window_browser_token(&label);
    let fade_ms = fade_ms.min(SUB_WINDOW_BROWSER_MAX_FADE_MS);
    let data_directory = sub_window_browser_data_directory(&app, &label)?;
    let bridge_app = app.clone();
    let bridge_window_label = window.label().to_string();
    let bridge_label = label.clone();

    fs::create_dir_all(&data_directory).map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_data_dir_create_failed",
            "failed to create subwindow browser data directory",
            source.to_string(),
        )
    })?;
    remember_sub_window_browser_token(&app, &label, token.clone());

    let browser_webview =
        WebviewBuilder::new(label.clone(), WebviewUrl::External(parsed_url.clone()))
            .incognito(true)
            .focused(false)
            .transparent(true)
            .background_color(Color(0, 0, 0, 0))
            .additional_browser_args(SANDBOX_BROWSER_ADDITIONAL_BROWSER_ARGS)
            .data_directory(data_directory)
            .initialization_script(SANDBOX_BROWSER_SMOOTH_SCROLL_SCRIPT)
            .initialization_script(sub_window_browser_initialization_script(&token, fade_ms))
            .on_page_load(move |_webview, payload| {
                if payload.event() != PageLoadEvent::Finished {
                    return;
                }

                emit_sub_window_browser_host_event(
                    &bridge_app,
                    &bridge_window_label,
                    &bridge_label,
                    SUB_WINDOW_BROWSER_LOADED_EVENT,
                );
            })
            .on_navigation(|url| is_supported_external_url(url))
            .on_new_window(|_url, _features| NewWindowResponse::Deny)
            .on_download(|_webview, event| {
                if let DownloadEvent::Requested { url, .. } = event {
                    eprintln!("blocked subwindow browser download: {url}");
                }

                false
            });

    let browser_webview = window
        .add_child(browser_webview, bounds.position, bounds.size)
        .map_err(|source| {
            forget_sub_window_browser_token(&app, &label);
            CommandErrorPayload::with_detail(
                "subwindow_browser_open_failed",
                "failed to open subwindow browser",
                source.to_string(),
            )
        })?;
    let _ = browser_webview.hide();

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
pub async fn begin_sub_window_external_browser_close(
    app: AppHandle,
    window: Window,
    webview: Webview,
    browser_id: String,
) -> Result<(), CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_sub_window_browser_host(&window, &webview)?;
        let browser_webview =
            resolve_sub_window_browser_webview(&app, window.label(), &browser_id)?;

        browser_webview
            .eval(SUB_WINDOW_BROWSER_BEGIN_CLOSE_SCRIPT)
            .map_err(|source| {
                CommandErrorPayload::with_detail(
                    "subwindow_browser_close_animation_failed",
                    "failed to start subwindow browser close animation",
                    source.to_string(),
                )
            })
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser close animation task",
            source.to_string(),
        )
    })?
}

#[tauri::command]
pub async fn show_sub_window_external_browser(
    app: AppHandle,
    window: Window,
    webview: Webview,
    browser_id: String,
) -> Result<(), CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_sub_window_browser_host(&window, &webview)?;
        let browser_webview =
            resolve_sub_window_browser_webview(&app, window.label(), &browser_id)?;

        browser_webview
            .eval(SUB_WINDOW_BROWSER_PREPARE_REVEAL_SCRIPT)
            .map_err(|source| {
                CommandErrorPayload::with_detail(
                    "subwindow_browser_reveal_prepare_failed",
                    "failed to prepare subwindow browser reveal animation",
                    source.to_string(),
                )
            })?;

        browser_webview.show().map_err(|source| {
            CommandErrorPayload::with_detail(
                "subwindow_browser_show_failed",
                "failed to show subwindow browser",
                source.to_string(),
            )
        })?;

        browser_webview
            .eval(SUB_WINDOW_BROWSER_BEGIN_REVEAL_SCRIPT)
            .map_err(|source| {
                CommandErrorPayload::with_detail(
                    "subwindow_browser_reveal_animation_failed",
                    "failed to start subwindow browser reveal animation",
                    source.to_string(),
                )
            })
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser show task",
            source.to_string(),
        )
    })?
}

#[tauri::command]
pub async fn sub_window_browser_event(
    app: AppHandle,
    webview: Webview,
    token: String,
    event: SubWindowBrowserEventPayload,
) -> Result<(), CommandErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_sub_window_browser_event_source(&app, &webview, &token)?;

        match event.event_type.as_str() {
            "close" => {
                emit_sub_window_browser_host_event(
                    &app,
                    webview.window().label(),
                    webview.label(),
                    SUB_WINDOW_BROWSER_CLOSE_REQUESTED_EVENT,
                );
            }
            "zoom" => {
                if let Some(zoom) = event.zoom.and_then(validate_sub_window_browser_zoom) {
                    webview.set_zoom(zoom).map_err(|source| {
                        CommandErrorPayload::with_detail(
                            "subwindow_browser_zoom_failed",
                            "failed to zoom subwindow browser",
                            source.to_string(),
                        )
                    })?;
                }
            }
            "revealStarted" => {
                emit_sub_window_browser_host_event(
                    &app,
                    webview.window().label(),
                    webview.label(),
                    SUB_WINDOW_BROWSER_REVEAL_STARTED_EVENT,
                );
            }
            _ => {}
        }

        Ok(())
    })
    .await
    .map_err(|source| {
        CommandErrorPayload::with_detail(
            "subwindow_browser_task_failed",
            "failed to run subwindow browser event task",
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
        let browser_webview =
            resolve_sub_window_browser_webview(&app, window.label(), &browser_id)?;

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
        forget_sub_window_browser_token(app, &label);
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

fn sub_window_browser_initialization_script(token: &str, fade_ms: u32) -> String {
    let token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string());

    SUB_WINDOW_BROWSER_INIT_SCRIPT
        .replace("__KMARK_TOKEN__", &token_json)
        .replace("__KMARK_FADE_MS__", &fade_ms.to_string())
}

fn validate_sub_window_browser_zoom(zoom: f64) -> Option<f64> {
    if !zoom.is_finite() {
        return None;
    }

    Some(zoom.clamp(
        SUB_WINDOW_BROWSER_MIN_ZOOM_SCALE,
        SUB_WINDOW_BROWSER_MAX_ZOOM_SCALE,
    ))
}

fn emit_sub_window_browser_host_event<R: Runtime>(
    app: &AppHandle<R>,
    window_label: &str,
    browser_label: &str,
    event: &'static str,
) {
    let payload = SubWindowBrowserHostEventPayload {
        browser_id: browser_label,
        event,
    };

    let _ = app.emit_to(window_label, SUB_WINDOW_BROWSER_HOST_EVENT, payload);
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

fn next_sub_window_browser_token(label: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    format!("{label}-{}-{timestamp}", std::process::id())
}

fn remember_sub_window_browser_token<R: Runtime>(app: &AppHandle<R>, label: &str, token: String) {
    if let Ok(mut tokens) = app.state::<AppState>().sub_window_browser_tokens.lock() {
        tokens.insert(label.to_string(), token);
    }
}

fn forget_sub_window_browser_token<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Ok(mut tokens) = app.state::<AppState>().sub_window_browser_tokens.lock() {
        tokens.remove(label);
    }
}

fn is_current_sub_window_browser_token<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    token: &str,
) -> bool {
    app.state::<AppState>()
        .sub_window_browser_tokens
        .lock()
        .ok()
        .and_then(|tokens| tokens.get(label).cloned())
        .is_some_and(|current_token| current_token == token)
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

fn ensure_sub_window_browser_event_source<R: Runtime>(
    app: &AppHandle<R>,
    webview: &Webview<R>,
    token: &str,
) -> Result<(), CommandErrorPayload> {
    if !is_sub_window_browser_label(webview.label()) {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_event_forbidden",
            "only subwindow browser webviews can send browser events",
            webview.label(),
        ));
    }

    if !webview
        .window()
        .label()
        .starts_with(SUB_WINDOW_LABEL_PREFIX)
    {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_event_forbidden",
            "subwindow browser event source window is invalid",
            webview.window().label(),
        ));
    }

    if !is_current_sub_window_browser_token(app, webview.label(), token) {
        return Err(CommandErrorPayload::with_detail(
            "subwindow_browser_event_forbidden",
            "subwindow browser event token is invalid",
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
    forget_sub_window_browser_token(app, browser_id);
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
    let (x, width) = resolve_sub_window_browser_fixed_gap_axis(
        host_width,
        SUB_WINDOW_BROWSER_HORIZONTAL_GAP_LOGICAL_PX,
    );
    let (y, height) = resolve_sub_window_browser_ratio_gap_axis(
        host_height,
        SUB_WINDOW_BROWSER_VERTICAL_GAP_RATIO,
    );

    Ok(Rect {
        position: Position::Logical(LogicalPosition::new(x, y)),
        size: Size::Logical(LogicalSize::new(width, height)),
    })
}

fn resolve_sub_window_browser_fixed_gap_axis(total_size: f64, gap: f64) -> (f64, f64) {
    if total_size > gap.mul_add(2.0, SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE) {
        (gap, total_size - gap * 2.0)
    } else {
        (0.0, total_size.max(SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE))
    }
}

fn resolve_sub_window_browser_ratio_gap_axis(total_size: f64, gap_ratio: f64) -> (f64, f64) {
    let gap = (total_size * gap_ratio).max(0.0);

    if total_size > gap.mul_add(2.0, SUB_WINDOW_BROWSER_MIN_LOGICAL_SIZE) {
        (gap, total_size - gap * 2.0)
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
