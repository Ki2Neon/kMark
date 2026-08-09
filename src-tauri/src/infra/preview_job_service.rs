use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use kmark_application::{
    ApplicationError, ApplicationErrorCode, DocumentSnapshot, PreviewArtifact, PreviewFormat,
    PreviewFuture, PreviewJob, PreviewJobPort, PreviewJobStatus, PreviewRequest,
};
use serde::Deserialize;
use tauri::{AppHandle, Listener};

const MAX_PREVIEW_JOBS: usize = 32;
const MAX_ACTIVE_PREVIEW_JOBS: usize = 2;
const MAX_PREVIEW_ARTIFACT_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone)]
struct StoredPreviewJob {
    job: PreviewJob,
    artifact: Option<PreviewArtifact>,
}

#[derive(Default)]
pub(crate) struct TauriPreviewJobService {
    app: Mutex<Option<AppHandle>>,
    jobs: Arc<Mutex<HashMap<String, StoredPreviewJob>>>,
    next_id: Mutex<u64>,
}

impl TauriPreviewJobService {
    pub(crate) fn set_app(&self, app: &AppHandle) {
        *self
            .app
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(app.clone());
    }

    fn update_job(
        jobs: &Mutex<HashMap<String, StoredPreviewJob>>,
        job_id: &str,
        status: PreviewJobStatus,
        artifact: Option<PreviewArtifact>,
        error: Option<String>,
    ) {
        let mut jobs = jobs.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(stored) = jobs.get_mut(job_id) {
            stored.job.status = status;
            stored.job.media_type = artifact.as_ref().map(|value| value.media_type.clone());
            stored.job.error = error;
            stored.artifact = artifact;
        }
    }
}

impl PreviewJobPort for TauriPreviewJobService {
    fn create<'a>(
        &'a self,
        document: DocumentSnapshot,
        request: PreviewRequest,
    ) -> PreviewFuture<'a, PreviewJob> {
        Box::pin(async move {
            let app = self
                .app
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
                .ok_or_else(|| {
                    ApplicationError::new(
                        ApplicationErrorCode::InvalidState,
                        "preview runtime is not initialized",
                    )
                })?;
            let id = {
                let mut sequence = self
                    .next_id
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                *sequence = sequence.saturating_add(1);
                format!("{}-preview-{}", document.instance_id, *sequence)
            };
            let job = PreviewJob {
                id: id.clone(),
                session_id: document.session_id.clone(),
                revision: document.revision,
                format: request.format,
                status: PreviewJobStatus::Queued,
                media_type: None,
                error: None,
            };
            {
                let mut jobs = self
                    .jobs
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let active = jobs
                    .values()
                    .filter(|stored| {
                        matches!(
                            stored.job.status,
                            PreviewJobStatus::Queued | PreviewJobStatus::Running
                        )
                    })
                    .count();
                if active >= MAX_ACTIVE_PREVIEW_JOBS {
                    return Err(ApplicationError::new(
                        ApplicationErrorCode::InvalidState,
                        "too many preview jobs are active",
                    ));
                }
                while jobs.len() >= MAX_PREVIEW_JOBS {
                    let removable = jobs
                        .iter()
                        .find(|(_, stored)| {
                            matches!(
                                stored.job.status,
                                PreviewJobStatus::Completed | PreviewJobStatus::Failed
                            )
                        })
                        .map(|(id, _)| id.clone());
                    let Some(removable) = removable else {
                        return Err(ApplicationError::new(
                            ApplicationErrorCode::InvalidState,
                            "preview job capacity is exhausted",
                        ));
                    };
                    jobs.remove(&removable);
                }
                jobs.insert(
                    id.clone(),
                    StoredPreviewJob {
                        job: job.clone(),
                        artifact: None,
                    },
                );
            }

            let jobs = self.jobs.clone();
            tauri::async_runtime::spawn(async move {
                Self::update_job(&jobs, &id, PreviewJobStatus::Running, None, None);
                let output = render_preview_job(app, document, request, &id).await;
                match output {
                    Ok(artifact) if artifact.bytes.len() <= MAX_PREVIEW_ARTIFACT_BYTES => {
                        Self::update_job(
                            &jobs,
                            &id,
                            PreviewJobStatus::Completed,
                            Some(artifact),
                            None,
                        )
                    }
                    Ok(_) => Self::update_job(
                        &jobs,
                        &id,
                        PreviewJobStatus::Failed,
                        None,
                        Some("preview artifact exceeds the 32 MiB limit".to_owned()),
                    ),
                    Err(error) => {
                        Self::update_job(&jobs, &id, PreviewJobStatus::Failed, None, Some(error))
                    }
                }
            });
            Ok(job)
        })
    }

    fn get<'a>(&'a self, job_id: &'a str) -> PreviewFuture<'a, PreviewJob> {
        Box::pin(async move {
            self.jobs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .get(job_id)
                .map(|stored| stored.job.clone())
                .ok_or_else(preview_job_not_found)
        })
    }

    fn artifact<'a>(&'a self, job_id: &'a str) -> PreviewFuture<'a, PreviewArtifact> {
        Box::pin(async move {
            let jobs = self
                .jobs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let stored = jobs.get(job_id).ok_or_else(preview_job_not_found)?;
            stored.artifact.clone().ok_or_else(|| {
                ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    stored
                        .job
                        .error
                        .clone()
                        .unwrap_or_else(|| "preview job is not completed".to_owned()),
                )
            })
        })
    }
}

async fn render_preview_job(
    app: AppHandle,
    document: DocumentSnapshot,
    request: PreviewRequest,
    job_id: &str,
) -> Result<PreviewArtifact, String> {
    match request.format {
        PreviewFormat::Html => {
            let (window, fragment) =
                hydrate_preview(&app, &document, request.width, request.height, job_id).await?;
            let _ = window.close();
            Ok(PreviewArtifact {
                media_type: "text/html; charset=utf-8".to_owned(),
                bytes: preview_document(&fragment).into_bytes(),
            })
        }
        PreviewFormat::Png => {
            let bytes = capture_png(&app, &document, request.width, request.height, job_id).await?;
            Ok(PreviewArtifact {
                media_type: "image/png".to_owned(),
                bytes,
            })
        }
    }
}

fn preview_document(fragment: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: asset: tauri: http://asset.localhost\"><meta name=\"color-scheme\" content=\"light dark\"><style>{}</style></head><body><main class=\"kmark-preview\">{fragment}</main></body></html>",
        PREVIEW_CSS
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureReadyPayload {
    ok: bool,
    html: Option<String>,
    error: Option<String>,
}

async fn hydrate_preview(
    app: &AppHandle,
    document: &DocumentSnapshot,
    width: u32,
    height: u32,
    job_id: &str,
) -> Result<(tauri::WebviewWindow, String), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let label = format!("preview-capture-{job_id}");
    let ready_event = format!("kmark-preview-capture-ready-{job_id}");
    let file_path = document.file_path.clone();
    let script = format!(
        concat!(
            "window.__KMARK_CAPTURE_CONTENT__={};",
            "window.__KMARK_CAPTURE_CSS__={};",
            "window.__KMARK_CAPTURE_DOCUMENT_KEY__={};",
            "window.__KMARK_CAPTURE_FILE_PATH__={};",
            "window.__KMARK_CAPTURE_READY_EVENT__={};",
            "window.__KMARK_CAPTURE_REVISION__={};"
        ),
        serde_json::to_string(&document.content).map_err(|error| error.to_string())?,
        serde_json::to_string(PREVIEW_CSS).map_err(|error| error.to_string())?,
        serde_json::to_string(job_id).map_err(|error| error.to_string())?,
        serde_json::to_string(&file_path).map_err(|error| error.to_string())?,
        serde_json::to_string(&ready_event).map_err(|error| error.to_string())?,
        document.revision,
    );
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let listener_id = app.once(ready_event, move |event| {
        let result = serde_json::from_str::<CaptureReadyPayload>(event.payload())
            .map_err(|error| format!("invalid preview ready event: {error}"))
            .and_then(|payload| {
                if payload.ok {
                    payload
                        .html
                        .ok_or_else(|| "preview ready event omitted rendered HTML".to_owned())
                } else {
                    Err(payload
                        .error
                        .unwrap_or_else(|| "preview hydration failed".to_owned()))
                }
            });
        let _ = sender.send(result);
    });
    let window =
        match WebviewWindowBuilder::new(app, label, WebviewUrl::App("preview-capture.html".into()))
            .title("Kmark Preview Capture")
            .inner_size(f64::from(width), f64::from(height))
            .decorations(false)
            .resizable(false)
            .visible(false)
            .initialization_script(&script)
            .build()
        {
            Ok(window) => window,
            Err(error) => {
                app.unlisten(listener_id);
                return Err(format!("failed to create preview WebView: {error}"));
            }
        };
    let fragment = match tokio::time::timeout(std::time::Duration::from_secs(15), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("preview ready event was canceled".to_owned()),
        Err(_) => {
            app.unlisten(listener_id);
            Err("preview hydration timed out".to_owned())
        }
    };
    match fragment {
        Ok(fragment) => Ok((window, fragment)),
        Err(error) => {
            let _ = window.close();
            Err(error)
        }
    }
}

#[cfg(windows)]
async fn capture_png(
    app: &AppHandle,
    document: &DocumentSnapshot,
    width: u32,
    height: u32,
    job_id: &str,
) -> Result<Vec<u8>, String> {
    let (window, _) = hydrate_preview(app, document, width, height, job_id).await?;
    let result = capture_webview2(&window).await;
    let _ = window.close();
    result
}

#[cfg(not(windows))]
async fn capture_png(
    _app: &AppHandle,
    _document: &DocumentSnapshot,
    _width: u32,
    _height: u32,
    _job_id: &str,
) -> Result<Vec<u8>, String> {
    Err("PNG preview capture is supported on Windows only in v1".to_owned())
}

#[cfg(windows)]
async fn capture_webview2(window: &tauri::WebviewWindow) -> Result<Vec<u8>, String> {
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::Win32::UI::Shell::SHCreateMemStream;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    window
        .with_webview(move |platform| {
            let failure_sender = sender.clone();
            let send_failure = |message: String| {
                if let Some(sender) = failure_sender
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .take()
                {
                    let _ = sender.send(Err(message));
                }
            };
            let result = unsafe {
                let controller = platform.controller();
                let webview = match controller.CoreWebView2() {
                    Ok(webview) => webview,
                    Err(error) => {
                        send_failure(format!("failed to access WebView2: {error}"));
                        return;
                    }
                };
                let Some(stream) = SHCreateMemStream(None) else {
                    send_failure("failed to allocate preview stream".to_owned());
                    return;
                };
                let callback_stream = stream.clone();
                let callback_sender = sender.clone();
                let handler = CapturePreviewCompletedHandler::create(Box::new(move |status| {
                    let result = status
                        .map_err(|error| format!("WebView2 capture failed: {error}"))
                        .and_then(|_| read_stream(&callback_stream));
                    if let Some(sender) = callback_sender
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .take()
                    {
                        let _ = sender.send(result);
                    }
                    Ok(())
                }));
                webview.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &handler,
                )
            };
            if let Err(error) = result {
                send_failure(format!("failed to start WebView2 capture: {error}"));
            }
        })
        .map_err(|error| format!("failed to access preview WebView: {error}"))?;
    tokio::time::timeout(std::time::Duration::from_secs(10), receiver)
        .await
        .map_err(|_| "preview capture timed out".to_owned())?
        .map_err(|_| "preview capture callback was canceled".to_owned())?
}

#[cfg(windows)]
fn read_stream(stream: &windows::Win32::System::Com::IStream) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::{STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET};
    let mut stat = STATSTG::default();
    unsafe {
        stream
            .Stat(&mut stat, STATFLAG_NONAME)
            .map_err(|error| format!("failed to inspect preview stream: {error}"))?;
        stream
            .Seek(0, STREAM_SEEK_SET, None)
            .map_err(|error| format!("failed to rewind preview stream: {error}"))?;
    }
    let length = usize::try_from(stat.cbSize)
        .map_err(|_| "preview image exceeds addressable memory".to_owned())?;
    let mut bytes = vec![0u8; length];
    let mut read = 0u32;
    unsafe {
        stream
            .Read(
                bytes.as_mut_ptr().cast(),
                u32::try_from(length).map_err(|_| "preview image exceeds 4 GiB".to_owned())?,
                Some(&mut read),
            )
            .ok()
            .map_err(|error| format!("failed to read preview stream: {error}"))?;
    }
    bytes.truncate(read as usize);
    Ok(bytes)
}

fn preview_job_not_found() -> ApplicationError {
    ApplicationError::new(ApplicationErrorCode::FileNotFound, "preview job not found")
}

const PREVIEW_CSS: &str = r#"
:root{font-family:"Segoe UI",sans-serif;color:#202124;background:#fff}*{box-sizing:border-box}body{margin:0;background:#fff;color:#202124}.kmark-preview{max-width:920px;margin:0 auto;padding:36px 44px;line-height:1.65;overflow-wrap:anywhere}.kmark-preview h1,.kmark-preview h2,.kmark-preview h3{line-height:1.3;color:#202124}.kmark-preview img{max-width:100%;height:auto}.kmark-preview pre{padding:14px;overflow:auto;background:#f4f5f6;border:1px solid #d9dcdf}.kmark-preview code{font-family:Consolas,monospace}.kmark-preview table{width:100%;border-collapse:collapse}.kmark-preview th,.kmark-preview td{padding:7px 9px;border:1px solid #c9cdd1}.kmark-preview blockquote{margin-left:0;padding-left:16px;border-left:3px solid #b8bec5;color:#555}@media(prefers-color-scheme:dark){:root,body,.kmark-preview,.kmark-preview h1,.kmark-preview h2,.kmark-preview h3{color:#e7e8ea;background:#1b1c1e}.kmark-preview pre{background:#25272a;border-color:#464a50}.kmark-preview th,.kmark-preview td{border-color:#4b5057}.kmark-preview blockquote{color:#bdc1c6}}
"#;
