use std::{
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use kmark_api_contract::{
    ApiErrorDetails, ApiErrorResponse, CreateDocumentRequest, DiagnosticPayload,
    DiagnosticsPayload, DiagramPayload, DiagramValidationPayload, DiagramsPayload, DocumentPayload,
    DocumentSessionSummaryPayload, InstancePayload, OpenDocumentRequest, PreviewJobPayload,
    PreviewJobRequestPayload, ProposalPayload, SaveDocumentRequest, SaveDocumentResponse,
    SessionProposalRequest,
};
use kmark_application::{
    ApplicationError, ApplicationErrorCode, ApplicationService, PreviewFormat, PreviewJob,
    PreviewJobPort, PreviewRequest, SessionProposalInput, TextEdit,
};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use utoipa::{
    openapi::security::{Http, HttpAuthScheme, SecurityRequirement, SecurityScheme},
    Modify, OpenApi,
};

use crate::mapping;

const API_VERSION: &str = "v1";
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

/// UI boundary used only when an untitled session is saved through REST.
pub trait SavePathPicker: Send + Sync {
    fn pick_save_path(
        &self,
        suggested_file_name: &str,
    ) -> Result<Option<PathBuf>, ApplicationError>;
}

#[derive(Default)]
pub struct CancelSavePathPicker;

impl SavePathPicker for CancelSavePathPicker {
    fn pick_save_path(
        &self,
        _suggested_file_name: &str,
    ) -> Result<Option<PathBuf>, ApplicationError> {
        Ok(None)
    }
}

#[derive(Clone)]
struct RestState {
    application: Arc<ApplicationService>,
    preview_jobs: Arc<dyn PreviewJobPort>,
    save_path_picker: Arc<dyn SavePathPicker>,
    token: Arc<str>,
    expected_host: Arc<str>,
    next_request_id: Arc<AtomicU64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestServerInfo {
    pub address: SocketAddr,
    pub instance_id: String,
}

pub struct RestServerHandle {
    info: RestServerInfo,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<std::io::Result<()>>,
}

impl RestServerHandle {
    pub fn info(&self) -> &RestServerInfo {
        &self.info
    }

    pub async fn shutdown(mut self) -> std::io::Result<()> {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.task.await.unwrap_or_else(|error| {
            Err(std::io::Error::other(format!(
                "REST server task failed: {error}"
            )))
        })
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        openapi_document,
        get_instance,
        list_sessions,
        create_document,
        open_document,
        get_document,
        save_document,
        get_diagnostics,
        create_session_proposal,
        get_session_proposal,
        list_diagrams,
        validate_diagram,
        create_preview_job,
        get_preview_job,
        get_preview_result
    ),
    components(schemas(
        ApiErrorDetails,
        ApiErrorResponse,
        CreateDocumentRequest,
        DiagramPayload,
        DiagramValidationPayload,
        DiagramsPayload,
        DiagnosticPayload,
        DiagnosticsPayload,
        DocumentPayload,
        DocumentSessionSummaryPayload,
        InstancePayload,
        OpenDocumentRequest,
        PreviewJobPayload,
        PreviewJobRequestPayload,
        ProposalPayload,
        SaveDocumentRequest,
        SaveDocumentResponse,
        SessionProposalRequest
    )),
    tags((name = "Kmark External API", description = "Authenticated loopback API")),
    modifiers(&SecurityAddon)
)]
struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearerAuth",
                SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
            );
        }
        openapi.security = Some(vec![SecurityRequirement::new(
            "bearerAuth",
            Vec::<String>::new(),
        )]);
    }
}

pub async fn start_rest_server(
    application: Arc<ApplicationService>,
    preview_jobs: Arc<dyn PreviewJobPort>,
    save_path_picker: Arc<dyn SavePathPicker>,
    token: String,
) -> std::io::Result<RestServerHandle> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let address = listener.local_addr()?;
    let router = build_router_with_save_path(
        application.clone(),
        preview_jobs,
        save_path_picker,
        token,
        format!("{}:{}", address.ip(), address.port()),
    );
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
    });
    Ok(RestServerHandle {
        info: RestServerInfo {
            address,
            instance_id: application.instance_id().to_owned(),
        },
        shutdown: Some(shutdown_tx),
        task,
    })
}

pub fn build_router(
    application: Arc<ApplicationService>,
    preview_jobs: Arc<dyn PreviewJobPort>,
    token: String,
    expected_host: String,
) -> Router {
    build_router_with_save_path(
        application,
        preview_jobs,
        Arc::new(CancelSavePathPicker),
        token,
        expected_host,
    )
}

pub fn build_router_with_save_path(
    application: Arc<ApplicationService>,
    preview_jobs: Arc<dyn PreviewJobPort>,
    save_path_picker: Arc<dyn SavePathPicker>,
    token: String,
    expected_host: String,
) -> Router {
    let state = RestState {
        application,
        preview_jobs,
        save_path_picker,
        token: Arc::from(token),
        expected_host: Arc::from(expected_host),
        next_request_id: Arc::new(AtomicU64::new(0)),
    };
    Router::new()
        .route("/openapi.json", get(openapi_document))
        .route("/api/v1/instances/{instance_id}", get(get_instance))
        .route(
            "/api/v1/instances/{instance_id}/sessions",
            get(list_sessions).post(create_document),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/open",
            post(open_document),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/document",
            get(get_document),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/save",
            post(save_document),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/diagnostics",
            get(get_diagnostics),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/proposals",
            post(create_session_proposal),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/proposals/{proposal_id}",
            get(get_session_proposal),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/diagrams",
            get(list_diagrams),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/diagrams/{diagram_id}/validate",
            post(validate_diagram),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs",
            post(create_preview_job),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs/{job_id}",
            get(get_preview_job),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs/{job_id}/result",
            get(get_preview_result),
        )
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            authenticate_request,
        ))
        .with_state(state)
}

async fn authenticate_request(
    State(state): State<RestState>,
    headers: HeaderMap,
    request: Request<Body>,
    next: Next,
) -> Response {
    if headers.contains_key(header::ORIGIN) {
        return security_error(&state, StatusCode::FORBIDDEN, "origin_not_allowed");
    }
    let host_matches = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|host| constant_time_equal(host, &state.expected_host));
    if !host_matches {
        return security_error(&state, StatusCode::BAD_REQUEST, "invalid_host");
    }
    let expected_authorization = format!("Bearer {}", state.token);
    let authenticated = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| constant_time_equal(value, &expected_authorization));
    if !authenticated {
        return security_error(&state, StatusCode::UNAUTHORIZED, "unauthorized");
    }
    next.run(request).await
}

fn security_error(state: &RestState, status: StatusCode, code: &str) -> Response {
    (
        status,
        Json(ApiErrorResponse {
            code: code.to_owned(),
            message: code.replace('_', " "),
            request_id: next_request_id(state),
            details: None,
        }),
    )
        .into_response()
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    let left = left.as_bytes();
    let right = right.as_bytes();
    let mut difference = left.len() ^ right.len();
    let maximum = left.len().max(right.len());
    for index in 0..maximum {
        difference |= usize::from(
            left.get(index).copied().unwrap_or_default()
                ^ right.get(index).copied().unwrap_or_default(),
        );
    }
    difference == 0
}

#[utoipa::path(get, path = "/openapi.json", responses((status = 200, description = "OpenAPI 3.1 document")))]
async fn openapi_document() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}", params(("instance_id" = String, Path)), responses((status = 200, body = InstancePayload), (status = 404, body = ApiErrorResponse)))]
async fn get_instance(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
) -> ApiResult<InstancePayload> {
    require_instance(&state, &instance_id)?;
    Ok(Json(InstancePayload {
        instance_id,
        api_version: API_VERSION.to_owned(),
    }))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions", params(("instance_id" = String, Path)), responses((status = 200, body = [DocumentSessionSummaryPayload])))]
async fn list_sessions(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
) -> ApiResult<Vec<DocumentSessionSummaryPayload>> {
    require_instance(&state, &instance_id)?;
    Ok(Json(
        state
            .application
            .sessions()
            .iter()
            .map(mapping::session_summary)
            .collect(),
    ))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions", params(("instance_id" = String, Path)), request_body = CreateDocumentRequest, responses((status = 201, body = DocumentPayload)))]
async fn create_document(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
    Json(request): Json<CreateDocumentRequest>,
) -> Result<(StatusCode, Json<DocumentPayload>), ApiFailure> {
    require_instance(&state, &instance_id)?;
    let snapshot = state
        .application
        .create_session(request.suggested_file_name);
    Ok((StatusCode::CREATED, Json(mapping::document(snapshot))))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/open", params(("instance_id" = String, Path)), request_body = OpenDocumentRequest, responses((status = 200, body = DocumentPayload)))]
async fn open_document(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
    Json(request): Json<OpenDocumentRequest>,
) -> ApiResult<DocumentPayload> {
    require_instance(&state, &instance_id)?;
    let application = state.application.clone();
    let path = PathBuf::from(request.path);
    let snapshot = run_blocking(&state, move || application.open_session(&path)).await?;
    Ok(Json(mapping::document(snapshot)))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/document", params(("instance_id" = String, Path), ("session_id" = String, Path)), responses((status = 200, body = DocumentPayload)))]
async fn get_document(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
) -> ApiResult<DocumentPayload> {
    require_instance(&state, &instance_id)?;
    Ok(Json(mapping::document(
        state
            .application
            .session(&session_id)
            .map_err(|error| application_failure(&state, error))?,
    )))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/save", params(("instance_id" = String, Path), ("session_id" = String, Path)), request_body = SaveDocumentRequest, responses((status = 200, body = SaveDocumentResponse), (status = 409, body = ApiErrorResponse)))]
async fn save_document(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
    Json(request): Json<SaveDocumentRequest>,
) -> ApiResult<SaveDocumentResponse> {
    require_instance(&state, &instance_id)?;
    let current = state
        .application
        .session(&session_id)
        .map_err(|error| application_failure(&state, error))?;
    if current.revision != request.expected_revision {
        return Err(application_failure(
            &state,
            ApplicationError::revision_conflict(current.revision),
        ));
    }
    if current.pending_proposal_id.is_some() {
        return Err(application_failure(
            &state,
            ApplicationError::new(
                ApplicationErrorCode::ProposalPending,
                "document session has a pending proposal",
            ),
        ));
    }

    let destination = if current.file_path.is_none() {
        let picker = state.save_path_picker.clone();
        let suggested = current.file_name.clone();
        let selected = run_blocking(&state, move || picker.pick_save_path(&suggested)).await?;
        match selected {
            Some(path) => Some(path),
            None => {
                return Ok(Json(SaveDocumentResponse {
                    outcome: "cancelled".to_owned(),
                    document: mapping::document(current),
                }));
            }
        }
    } else {
        None
    };
    let application = state.application.clone();
    let snapshot = run_blocking(&state, move || {
        application.save_session(
            &session_id,
            request.expected_revision,
            destination.as_deref(),
        )
    })
    .await?;
    Ok(Json(SaveDocumentResponse {
        outcome: "saved".to_owned(),
        document: mapping::document(snapshot),
    }))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/diagnostics", params(("instance_id" = String, Path), ("session_id" = String, Path)), responses((status = 200, body = DiagnosticsPayload)))]
async fn get_diagnostics(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
) -> ApiResult<DiagnosticsPayload> {
    require_instance(&state, &instance_id)?;
    let document = state
        .application
        .session(&session_id)
        .map_err(|error| application_failure(&state, error))?;
    let diagnostics = kmark_core::extract_diagrams(&document.content)
        .iter()
        .flat_map(kmark_core::validate_diagram)
        .map(core_diagnostic)
        .collect();
    Ok(Json(DiagnosticsPayload {
        revision: document.revision,
        diagnostics,
    }))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/proposals", params(("instance_id" = String, Path), ("session_id" = String, Path)), request_body = SessionProposalRequest, responses((status = 201, body = ProposalPayload), (status = 409, body = ApiErrorResponse)))]
async fn create_session_proposal(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
    Json(request): Json<SessionProposalRequest>,
) -> Result<(StatusCode, Json<ProposalPayload>), ApiFailure> {
    require_instance(&state, &instance_id)?;
    let proposal = state
        .application
        .create_session_proposal(
            &session_id,
            SessionProposalInput {
                expected_revision: request.expected_revision,
                operations: request
                    .operations
                    .into_iter()
                    .map(|operation| TextEdit {
                        start: operation.start,
                        end: operation.end,
                        text: operation.text,
                    })
                    .collect(),
            },
        )
        .map_err(|error| application_failure(&state, error))?;
    Ok((
        StatusCode::CREATED,
        Json(mapping::session_proposal(&proposal)),
    ))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/proposals/{proposal_id}", params(("instance_id" = String, Path), ("session_id" = String, Path), ("proposal_id" = String, Path)), responses((status = 200, body = ProposalPayload)))]
async fn get_session_proposal(
    State(state): State<RestState>,
    Path((instance_id, session_id, proposal_id)): Path<(String, String, String)>,
) -> ApiResult<ProposalPayload> {
    require_instance(&state, &instance_id)?;
    let proposal = state
        .application
        .session_proposal(&proposal_id)
        .map_err(|error| application_failure(&state, error))?;
    if proposal.session_id != session_id {
        return Err(not_found(
            &state,
            "proposal_not_found",
            "proposal not found",
        ));
    }
    Ok(Json(mapping::session_proposal(&proposal)))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/diagrams", params(("instance_id" = String, Path), ("session_id" = String, Path)), responses((status = 200, body = DiagramsPayload)))]
async fn list_diagrams(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
) -> ApiResult<DiagramsPayload> {
    require_instance(&state, &instance_id)?;
    let document = state
        .application
        .session(&session_id)
        .map_err(|error| application_failure(&state, error))?;
    Ok(Json(DiagramsPayload {
        revision: document.revision,
        diagrams: kmark_core::extract_diagrams(&document.content)
            .into_iter()
            .map(|diagram| DiagramPayload {
                id: diagram.id,
                language: diagram.language.as_str().to_owned(),
                start_line: diagram.start_line,
                end_line: diagram.end_line,
                source: diagram.source,
            })
            .collect(),
    }))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/diagrams/{diagram_id}/validate", params(("instance_id" = String, Path), ("session_id" = String, Path), ("diagram_id" = String, Path)), responses((status = 200, body = DiagramValidationPayload)))]
async fn validate_diagram(
    State(state): State<RestState>,
    Path((instance_id, session_id, diagram_id)): Path<(String, String, String)>,
) -> ApiResult<DiagramValidationPayload> {
    require_instance(&state, &instance_id)?;
    let document = state
        .application
        .session(&session_id)
        .map_err(|error| application_failure(&state, error))?;
    let diagram = kmark_core::extract_diagrams(&document.content)
        .into_iter()
        .find(|diagram| diagram.id == diagram_id)
        .ok_or_else(|| not_found(&state, "diagram_not_found", "diagram not found"))?;
    let diagnostics = kmark_core::validate_diagram(&diagram)
        .into_iter()
        .map(core_diagnostic)
        .collect::<Vec<_>>();
    Ok(Json(DiagramValidationPayload {
        revision: document.revision,
        diagram_id,
        valid: diagnostics.is_empty(),
        diagnostics,
    }))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs", request_body = PreviewJobRequestPayload, responses((status = 202, body = PreviewJobPayload)))]
async fn create_preview_job(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
    Json(request): Json<PreviewJobRequestPayload>,
) -> Result<(StatusCode, Json<PreviewJobPayload>), ApiFailure> {
    require_instance(&state, &instance_id)?;
    let document = state
        .application
        .session(&session_id)
        .map_err(|error| application_failure(&state, error))?;
    if document.revision != request.expected_revision {
        return Err(application_failure(
            &state,
            ApplicationError::revision_conflict(document.revision),
        ));
    }
    let format = match request.format.as_str() {
        "html" => PreviewFormat::Html,
        "png" => PreviewFormat::Png,
        _ => {
            return Err(bad_request(
                &state,
                "unsupported_preview_format",
                "preview format must be html or png",
            ));
        }
    };
    if !(320..=4096).contains(&request.width) || !(240..=4096).contains(&request.height) {
        return Err(bad_request(
            &state,
            "invalid_preview_dimensions",
            "preview dimensions are outside the supported range",
        ));
    }
    let job = state
        .preview_jobs
        .create(
            document,
            PreviewRequest {
                format,
                width: request.width,
                height: request.height,
            },
        )
        .await
        .map_err(|error| application_failure(&state, error))?;
    Ok((
        StatusCode::ACCEPTED,
        Json(preview_job_payload(&job, &instance_id)),
    ))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs/{job_id}", responses((status = 200, body = PreviewJobPayload)))]
async fn get_preview_job(
    State(state): State<RestState>,
    Path((instance_id, session_id, job_id)): Path<(String, String, String)>,
) -> ApiResult<PreviewJobPayload> {
    require_instance(&state, &instance_id)?;
    let job = state
        .preview_jobs
        .get(&job_id)
        .await
        .map_err(|error| application_failure(&state, error))?;
    if job.session_id != session_id {
        return Err(not_found(
            &state,
            "preview_job_not_found",
            "preview job not found",
        ));
    }
    Ok(Json(preview_job_payload(&job, &instance_id)))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs/{job_id}/result", responses((status = 200, description = "Preview artifact"), (status = 409, body = ApiErrorResponse)))]
async fn get_preview_result(
    State(state): State<RestState>,
    Path((instance_id, session_id, job_id)): Path<(String, String, String)>,
) -> Result<Response, ApiFailure> {
    require_instance(&state, &instance_id)?;
    let job = state
        .preview_jobs
        .get(&job_id)
        .await
        .map_err(|error| application_failure(&state, error))?;
    if job.session_id != session_id {
        return Err(not_found(
            &state,
            "preview_job_not_found",
            "preview job not found",
        ));
    }
    let artifact = state
        .preview_jobs
        .artifact(&job_id)
        .await
        .map_err(|error| application_failure(&state, error))?;
    Response::builder()
        .header(header::CONTENT_TYPE, artifact.media_type)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(artifact.bytes))
        .map_err(|_| internal_failure(&state, "failed to build preview response".to_owned()))
}

fn preview_job_payload(job: &PreviewJob, instance_id: &str) -> PreviewJobPayload {
    PreviewJobPayload {
        job_id: job.id.clone(),
        session_id: job.session_id.clone(),
        revision: job.revision,
        format: job.format.as_str().to_owned(),
        status: job.status.as_str().to_owned(),
        media_type: job.media_type.clone(),
        error: job.error.clone(),
        result_path: (job.status == kmark_application::PreviewJobStatus::Completed).then(|| {
            format!(
                "/api/v1/instances/{instance_id}/sessions/{}/preview-jobs/{}/result",
                job.session_id, job.id,
            )
        }),
    }
}

type ApiResult<T> = Result<Json<T>, ApiFailure>;

struct ApiFailure(Response);

impl IntoResponse for ApiFailure {
    fn into_response(self) -> Response {
        self.0
    }
}

fn require_instance(state: &RestState, instance_id: &str) -> Result<(), ApiFailure> {
    if constant_time_equal(state.application.instance_id(), instance_id) {
        Ok(())
    } else {
        Err(not_found(
            state,
            "instance_not_found",
            "Kmark instance not found",
        ))
    }
}

fn application_failure(state: &RestState, error: ApplicationError) -> ApiFailure {
    let status = match error.code() {
        ApplicationErrorCode::RevisionConflict
        | ApplicationErrorCode::ProposalPending
        | ApplicationErrorCode::StaleProposal
        | ApplicationErrorCode::DiskFileChanged => StatusCode::CONFLICT,
        ApplicationErrorCode::SessionNotFound
        | ApplicationErrorCode::ProposalNotFound
        | ApplicationErrorCode::FileNotFound => StatusCode::NOT_FOUND,
        ApplicationErrorCode::UnsupportedEncoding | ApplicationErrorCode::UnsupportedFileType => {
            StatusCode::UNSUPPORTED_MEDIA_TYPE
        }
        ApplicationErrorCode::IoFailed => StatusCode::INTERNAL_SERVER_ERROR,
        ApplicationErrorCode::InvalidAbsolutePath => StatusCode::BAD_REQUEST,
        _ => StatusCode::UNPROCESSABLE_ENTITY,
    };
    ApiFailure(
        (
            status,
            Json(ApiErrorResponse {
                code: error.code().as_str().to_owned(),
                message: error.message().to_owned(),
                request_id: next_request_id(state),
                details: error
                    .current_revision()
                    .map(|current_revision| ApiErrorDetails {
                        current_revision: Some(current_revision),
                    }),
            }),
        )
            .into_response(),
    )
}

fn not_found(state: &RestState, code: &str, message: &str) -> ApiFailure {
    ApiFailure(
        (
            StatusCode::NOT_FOUND,
            Json(ApiErrorResponse {
                code: code.to_owned(),
                message: message.to_owned(),
                request_id: next_request_id(state),
                details: None,
            }),
        )
            .into_response(),
    )
}

fn bad_request(state: &RestState, code: &str, message: &str) -> ApiFailure {
    ApiFailure(
        (
            StatusCode::BAD_REQUEST,
            Json(ApiErrorResponse {
                code: code.to_owned(),
                message: message.to_owned(),
                request_id: next_request_id(state),
                details: None,
            }),
        )
            .into_response(),
    )
}

fn internal_failure(state: &RestState, message: String) -> ApiFailure {
    ApiFailure(
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiErrorResponse {
                code: "internal_error".to_owned(),
                message,
                request_id: next_request_id(state),
                details: None,
            }),
        )
            .into_response(),
    )
}

fn next_request_id(state: &RestState) -> String {
    let sequence = state.next_request_id.fetch_add(1, Ordering::Relaxed) + 1;
    format!("{}-request-{sequence}", state.application.instance_id())
}

async fn run_blocking<T, F>(state: &RestState, operation: F) -> Result<T, ApiFailure>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ApplicationError> + Send + 'static,
{
    tokio::task::spawn_blocking(operation)
        .await
        .map_err(|error| internal_failure(state, format!("blocking operation failed: {error}")))?
        .map_err(|error| application_failure(state, error))
}

fn core_diagnostic(diagnostic: kmark_core::DiagramDiagnostic) -> DiagnosticPayload {
    DiagnosticPayload {
        severity: "error".to_owned(),
        code: diagnostic.code,
        message: diagnostic.message,
        line: diagnostic.line,
        column: diagnostic.column,
    }
}

#[cfg(test)]
mod tests {
    use std::{path::Path, sync::Arc};

    use axum::{body::Body, http::Request};
    use kmark_application::{
        ApplicationError, ApplicationErrorCode, DocumentFileRepository, FileFingerprint,
        PreviewArtifact, PreviewFuture, PreviewJob, PreviewJobPort, PreviewRequest, ReadFileResult,
    };
    use tower::ServiceExt;
    use utoipa::OpenApi;

    use super::{build_router, ApiDoc, ApplicationService};

    struct EmptyRepository;
    struct EmptyPreviewJobs;

    impl PreviewJobPort for EmptyPreviewJobs {
        fn create<'a>(
            &'a self,
            _document: kmark_application::DocumentSnapshot,
            _request: PreviewRequest,
        ) -> PreviewFuture<'a, PreviewJob> {
            Box::pin(async {
                Err(ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "preview unavailable",
                ))
            })
        }

        fn get<'a>(&'a self, _job_id: &'a str) -> PreviewFuture<'a, PreviewJob> {
            Box::pin(async {
                Err(ApplicationError::new(
                    ApplicationErrorCode::FileNotFound,
                    "preview job not found",
                ))
            })
        }

        fn artifact<'a>(&'a self, _job_id: &'a str) -> PreviewFuture<'a, PreviewArtifact> {
            Box::pin(async {
                Err(ApplicationError::new(
                    ApplicationErrorCode::FileNotFound,
                    "preview job not found",
                ))
            })
        }
    }

    impl DocumentFileRepository for EmptyRepository {
        fn read_utf8(&self, _path: &Path) -> Result<ReadFileResult, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }

        fn fingerprint(&self, _path: &Path) -> Result<FileFingerprint, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }

        fn write_utf8(
            &self,
            _path: &Path,
            _content: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            unreachable!()
        }
    }

    fn router() -> axum::Router {
        let service = Arc::new(ApplicationService::new(
            "instance",
            Arc::new(EmptyRepository),
            Arc::new(kmark_application::NoopApplicationEventSink),
        ));
        build_router(
            service,
            Arc::new(EmptyPreviewJobs),
            "secret".to_owned(),
            "127.0.0.1:43121".to_owned(),
        )
    }

    fn authorized(path: &str) -> Request<Body> {
        Request::builder()
            .uri(path)
            .header("host", "127.0.0.1:43121")
            .header("authorization", "Bearer secret")
            .body(Body::empty())
            .unwrap()
    }

    #[test]
    fn openapi_declares_contract_and_omits_removed_routes() {
        let document = serde_json::to_value(ApiDoc::openapi()).expect("serialize OpenAPI");
        assert_eq!(
            document.pointer("/components/securitySchemes/bearerAuth/type"),
            Some(&serde_json::json!("http"))
        );
        let text = serde_json::to_string(&document).unwrap();
        for removed in [
            "/roots",
            "/sessions/current",
            "rename_document",
            "delete_document",
            "ReadFilePayload",
        ] {
            assert!(!text.contains(removed), "OpenAPI still contains {removed}");
        }
        assert!(text.contains("/sessions/{session_id}/save"));
    }

    #[tokio::test]
    async fn requires_bearer_token_and_rejects_origin() {
        let unauthorized = router()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/instances/instance")
                    .header("host", "127.0.0.1:43121")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), 401);

        let forbidden = router()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/instances/instance")
                    .header("host", "127.0.0.1:43121")
                    .header("authorization", "Bearer secret")
                    .header("origin", "http://evil.test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(forbidden.status(), 403);
    }

    #[tokio::test]
    async fn removed_routes_return_not_found() {
        for path in [
            "/api/v1/instances/instance/roots",
            "/api/v1/instances/instance/sessions/current",
            "/api/v1/instances/instance/proposals",
        ] {
            assert_eq!(
                router().oneshot(authorized(path)).await.unwrap().status(),
                404
            );
        }
    }

    #[tokio::test]
    async fn cancelling_untitled_save_keeps_revision_unchanged() {
        let service = Arc::new(ApplicationService::new(
            "instance",
            Arc::new(EmptyRepository),
            Arc::new(kmark_application::NoopApplicationEventSink),
        ));
        let session = service.create_session("untitled.md".to_owned());
        let router = build_router(
            service.clone(),
            Arc::new(EmptyPreviewJobs),
            "secret".to_owned(),
            "127.0.0.1:43121".to_owned(),
        );
        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/v1/instances/instance/sessions/{}/save",
                        session.session_id
                    ))
                    .header("host", "127.0.0.1:43121")
                    .header("authorization", "Bearer secret")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"expectedRevision":1}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), 200);
        assert_eq!(service.session(&session.session_id).unwrap().revision, 1);
    }
}
