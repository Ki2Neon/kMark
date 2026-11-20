use tauri::WebviewWindow;

use super::error::CommandErrorPayload;

/// Opens the platform print UI for the calling WebView's prepared top-level document.
/// Success acknowledges opening the UI, not completing or accepting a print job.
#[tauri::command]
pub async fn show_print_dialog(window: WebviewWindow) -> Result<(), CommandErrorPayload> {
    show_platform_print_dialog(&window).await
}

#[cfg(windows)]
async fn show_platform_print_dialog(window: &WebviewWindow) -> Result<(), CommandErrorPayload> {
    use std::time::Duration;

    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER,
    };
    use windows::core::Interface;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |platform| {
            if sender.is_closed() {
                return;
            }

            // WebView2 COM calls must run on the WebView's UI thread.
            let result = unsafe {
                platform
                    .controller()
                    .CoreWebView2()
                    .and_then(|webview| webview.cast::<ICoreWebView2_16>())
                    .and_then(|webview| webview.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER))
            }
            .map_err(|error| {
                CommandErrorPayload::with_detail(
                    "print_dialog_failed",
                    "印刷メニューを開けませんでした。",
                    error.to_string(),
                )
            });
            let _ = sender.send(result);
        })
        .map_err(|error| {
            CommandErrorPayload::with_detail(
                "print_webview_unavailable",
                "印刷用の画面に接続できませんでした。",
                error.to_string(),
            )
        })?;

    tokio::time::timeout(Duration::from_secs(10), receiver)
        .await
        .map_err(|_| {
            CommandErrorPayload::new(
                "print_dialog_timeout",
                "印刷メニューの表示に時間がかかりすぎています。",
            )
        })?
        .map_err(|_| {
            CommandErrorPayload::new(
                "print_dialog_canceled",
                "印刷メニューの表示処理が中断されました。",
            )
        })?
}

#[cfg(not(windows))]
async fn show_platform_print_dialog(window: &WebviewWindow) -> Result<(), CommandErrorPayload> {
    window.print().map_err(|error| {
        CommandErrorPayload::with_detail(
            "print_dialog_failed",
            "印刷メニューを開けませんでした。",
            error.to_string(),
        )
    })
}
