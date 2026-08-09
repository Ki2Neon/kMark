use std::{
    net::{Ipv4Addr, SocketAddr},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use kmark_api_contract::{
    ApiErrorDetails, ApiErrorResponse, DiagnosticPayload, DiagnosticsPayload, DiagramPayload,
    DiagramValidationPayload, DiagramsPayload, DocumentPayload, DocumentSessionSummaryPayload,
    FileEntriesPayload, FileEntryPayload, FileSearchMatchPayload, FileSearchPayload,
    FileSearchRequest, InstancePayload, InstanceProposalRequest, OpenDocumentRequest,
    PreviewJobPayload, PreviewJobRequestPayload, ProposalPayload, ReadFilePayload, RootPayload,
    SessionProposalRequest,
};
use kmark_application::{
    ApplicationError, ApplicationErrorCode, ApplicationService, CreateDocumentProposalInput,
    PreviewFormat, PreviewJob, PreviewJobPort, PreviewRequest, SessionProposalInput, TextEdit,
};
use serde::Deserialize;
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use utoipa::{
    openapi::security::{Http, HttpAuthScheme, SecurityRequirement, SecurityScheme},
    Modify, OpenApi,
};

use crate::mapping;

const API_VERSION: &str = "v1";
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone)]
struct RestState {
    application: Arc<ApplicationService>,
    preview_jobs: Arc<dyn PreviewJobPort>,
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
        get_current_session,
        open_document,
        get_document,
        get_diagnostics,
        list_roots,
        list_entries,
        search_files,
        read_file,
        create_instance_proposal,
        get_instance_proposal,
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
        DiagramPayload,
        DiagramValidationPayload,
        DiagramsPayload,
        DiagnosticPayload,
        DiagnosticsPayload,
        DocumentPayload,
        DocumentSessionSummaryPayload,
        FileEntriesPayload,
        FileEntryPayload,
        FileSearchMatchPayload,
        FileSearchPayload,
        FileSearchRequest,
        InstancePayload,
        InstanceProposalRequest,
        OpenDocumentRequest,
        PreviewJobPayload,
        PreviewJobRequestPayload,
        ProposalPayload,
        ReadFilePayload,
        RootPayload,
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
    token: String,
) -> std::io::Result<RestServerHandle> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let address = listener.local_addr()?;
    let router = build_router(
        application.clone(),
        preview_jobs,
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
    let state = RestState {
        application,
        preview_jobs,
        token: Arc::from(token),
        expected_host: Arc::from(expected_host),
        next_request_id: Arc::new(AtomicU64::new(0)),
    };
    Router::new()
        .route("/openapi.json", get(openapi_document))
        .route("/api/v1/instances/{instance_id}", get(get_instance))
        .route(
            "/api/v1/instances/{instance_id}/sessions",
            get(list_sessions),
        )
        .route(
            "/api/v1/instances/{instance_id}/sessions/current",
            get(get_current_session),
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
            "/api/v1/instances/{instance_id}/sessions/{session_id}/diagnostics",
            get(get_diagnostics),
        )
        .route("/api/v1/instances/{instance_id}/roots", get(list_roots))
        .route(
            "/api/v1/instances/{instance_id}/roots/{root_id}/entries",
            get(list_entries),
        )
        .route(
            "/api/v1/instances/{instance_id}/roots/{root_id}/search",
            post(search_files),
        )
        .route(
            "/api/v1/instances/{instance_id}/roots/{root_id}/file",
            get(read_file),
        )
        .route(
            "/api/v1/instances/{instance_id}/proposals",
            post(create_instance_proposal),
        )
        .route(
            "/api/v1/instances/{instance_id}/proposals/{proposal_id}",
            get(get_instance_proposal),
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

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/sessions/current", params(("instance_id" = String, Path)), responses((status = 200, body = DocumentSessionSummaryPayload), (status = 204)))]
async fn get_current_session(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
) -> Result<Response, ApiFailure> {
    require_instance(&state, &instance_id)?;
    Ok(match state.application.current_session() {
        Some(snapshot) => Json(mapping::session_summary(&snapshot)).into_response(),
        None => StatusCode::NO_CONTENT.into_response(),
    })
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/open", params(("instance_id" = String, Path)), request_body = OpenDocumentRequest, responses((status = 200, body = DocumentPayload)))]
async fn open_document(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
    Json(request): Json<OpenDocumentRequest>,
) -> ApiResult<DocumentPayload> {
    require_instance(&state, &instance_id)?;
    let application = state.application.clone();
    let snapshot = run_blocking(&state, move || {
        application.open_session(&request.root_id, &request.relative_path)
    })
    .await?;
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

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/roots", params(("instance_id" = String, Path)), responses((status = 200, body = [RootPayload])))]
async fn list_roots(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
) -> ApiResult<Vec<RootPayload>> {
    require_instance(&state, &instance_id)?;
    Ok(Json(
        state
            .application
            .roots()
            .into_iter()
            .map(|root| RootPayload {
                id: root.id,
                label: root.label,
            })
            .collect(),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntriesQuery {
    #[serde(default)]
    relative_path: String,
    #[serde(default = "default_entries_limit")]
    limit: usize,
}

fn default_entries_limit() -> usize {
    200
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/roots/{root_id}/entries", params(("instance_id" = String, Path), ("root_id" = String, Path), ("relativePath" = Option<String>, Query), ("limit" = Option<usize>, Query)), responses((status = 200, body = FileEntriesPayload)))]
async fn list_entries(
    State(state): State<RestState>,
    Path((instance_id, root_id)): Path<(String, String)>,
    Query(query): Query<EntriesQuery>,
) -> ApiResult<FileEntriesPayload> {
    require_instance(&state, &instance_id)?;
    let application = state.application.clone();
    let entries = run_blocking(&state, move || {
        application.list_entries(&root_id, &query.relative_path, query.limit)
    })
    .await?;
    Ok(Json(FileEntriesPayload {
        entries: entries
            .into_iter()
            .map(|entry| FileEntryPayload {
                relative_path: entry.relative_path,
                is_directory: entry.is_directory,
                byte_length: entry.byte_length,
            })
            .collect(),
    }))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/roots/{root_id}/search", params(("instance_id" = String, Path), ("root_id" = String, Path)), request_body = FileSearchRequest, responses((status = 200, body = FileSearchPayload)))]
async fn search_files(
    State(state): State<RestState>,
    Path((instance_id, root_id)): Path<(String, String)>,
    Json(request): Json<FileSearchRequest>,
) -> ApiResult<FileSearchPayload> {
    require_instance(&state, &instance_id)?;
    let application = state.application.clone();
    let matches = run_blocking(&state, move || {
        application.search_files(&root_id, &request.query, request.limit)
    })
    .await?;
    Ok(Json(FileSearchPayload {
        matches: matches
            .into_iter()
            .map(|item| FileSearchMatchPayload {
                relative_path: item.relative_path,
                line: item.line,
                text: item.text,
            })
            .collect(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadFileQuery {
    relative_path: String,
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/roots/{root_id}/file", params(("instance_id" = String, Path), ("root_id" = String, Path), ("relativePath" = String, Query)), responses((status = 200, body = ReadFilePayload)))]
async fn read_file(
    State(state): State<RestState>,
    Path((instance_id, root_id)): Path<(String, String)>,
    Query(query): Query<ReadFileQuery>,
) -> ApiResult<ReadFilePayload> {
    require_instance(&state, &instance_id)?;
    let response_root_id = root_id.clone();
    let application = state.application.clone();
    let file = run_blocking(&state, move || {
        application.read_file(&root_id, &query.relative_path)
    })
    .await?;
    Ok(Json(ReadFilePayload {
        root_id: response_root_id,
        relative_path: file.relative_path,
        content: file.content,
        content_hash: file.fingerprint.sha256,
        byte_length: file.fingerprint.byte_length,
        modified_at_epoch_ms: file.modified_at_epoch_ms,
    }))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/proposals", params(("instance_id" = String, Path)), request_body = InstanceProposalRequest, responses((status = 201, body = ProposalPayload)))]
async fn create_instance_proposal(
    State(state): State<RestState>,
    Path(instance_id): Path<String>,
    Json(request): Json<InstanceProposalRequest>,
) -> Result<(StatusCode, Json<ProposalPayload>), ApiFailure> {
    require_instance(&state, &instance_id)?;
    let InstanceProposalRequest::CreateDocument {
        suggested_file_name,
        content,
    } = request;
    let proposal = state
        .application
        .create_document_proposal(CreateDocumentProposalInput {
            suggested_file_name,
            content,
        });
    Ok((
        StatusCode::CREATED,
        Json(mapping::create_proposal(&proposal)),
    ))
}

#[utoipa::path(get, path = "/api/v1/instances/{instance_id}/proposals/{proposal_id}", params(("instance_id" = String, Path), ("proposal_id" = String, Path)), responses((status = 200, body = ProposalPayload)))]
async fn get_instance_proposal(
    State(state): State<RestState>,
    Path((instance_id, proposal_id)): Path<(String, String)>,
) -> ApiResult<ProposalPayload> {
    require_instance(&state, &instance_id)?;
    let proposal = state
        .application
        .create_document_proposal_by_id(&proposal_id)
        .map_err(|error| application_failure(&state, error))?;
    Ok(Json(mapping::create_proposal(&proposal)))
}

#[utoipa::path(post, path = "/api/v1/instances/{instance_id}/sessions/{session_id}/proposals", params(("instance_id" = String, Path), ("session_id" = String, Path)), request_body = SessionProposalRequest, responses((status = 201, body = ProposalPayload), (status = 409, body = ApiErrorResponse)))]
async fn create_session_proposal(
    State(state): State<RestState>,
    Path((instance_id, session_id)): Path<(String, String)>,
    Json(request): Json<SessionProposalRequest>,
) -> Result<(StatusCode, Json<ProposalPayload>), ApiFailure> {
    require_instance(&state, &instance_id)?;
    let input = match request {
        SessionProposalRequest::TextEdit {
            expected_revision,
            operations,
        } => SessionProposalInput::TextEdit {
            expected_revision,
            operations: operations
                .into_iter()
                .map(|operation| TextEdit {
                    start: operation.start,
                    end: operation.end,
                    text: operation.text,
                })
                .collect(),
        },
        SessionProposalRequest::RenameDocument {
            expected_revision,
            target_relative_path,
        } => SessionProposalInput::RenameDocument {
            expected_revision,
            target_relative_path,
        },
        SessionProposalRequest::DeleteDocument { expected_revision } => {
            SessionProposalInput::DeleteDocument { expected_revision }
        }
    };
    let proposal = state
        .application
        .create_session_proposal(&session_id, input)
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
        | ApplicationErrorCode::DiskFileChanged
        | ApplicationErrorCode::FileAlreadyExists
        | ApplicationErrorCode::DeleteStaged => StatusCode::CONFLICT,
        ApplicationErrorCode::SessionNotFound
        | ApplicationErrorCode::RootNotFound
        | ApplicationErrorCode::ProposalNotFound
        | ApplicationErrorCode::StagedOperationNotFound
        | ApplicationErrorCode::FileNotFound => StatusCode::NOT_FOUND,
        ApplicationErrorCode::UnsupportedEncoding => StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ApplicationErrorCode::IoFailed => StatusCode::INTERNAL_SERVER_ERROR,
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
        ApplicationError, ApplicationErrorCode, DocumentFileRepository, FileEntry, FileFingerprint,
        PreviewArtifact, PreviewFuture, PreviewJob, PreviewJobPort, PreviewRequest, ReadFileResult,
        RegisteredRoot, SearchMatch,
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
        fn read_utf8(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }
        fn list_entries(
            &self,
            _root: &RegisteredRoot,
            _relative_directory: &str,
            _limit: usize,
        ) -> Result<Vec<FileEntry>, ApplicationError> {
            Ok(Vec::new())
        }
        fn search_utf8(
            &self,
            _root: &RegisteredRoot,
            _query: &str,
            _limit: usize,
        ) -> Result<Vec<SearchMatch>, ApplicationError> {
            Ok(Vec::new())
        }
        fn fingerprint(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<FileFingerprint, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }
        fn rename(
            &self,
            _root: &RegisteredRoot,
            _source_relative_path: &str,
            _target_relative_path: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            unreachable!()
        }
        fn move_to_trash(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<(), ApplicationError> {
            unreachable!()
        }
        fn resolve_registered_path(
            &self,
            _roots: &[RegisteredRoot],
            _absolute_path: &Path,
        ) -> Option<(String, String)> {
            None
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

    #[test]
    fn openapi_declares_global_bearer_authentication() {
        let document = serde_json::to_value(ApiDoc::openapi()).expect("serialize OpenAPI");

        assert_eq!(
            document.pointer("/components/securitySchemes/bearerAuth/type"),
            Some(&serde_json::json!("http"))
        );
        assert_eq!(
            document.pointer("/components/securitySchemes/bearerAuth/scheme"),
            Some(&serde_json::json!("bearer"))
        );
        assert_eq!(
            document.pointer("/security/0/bearerAuth"),
            Some(&serde_json::json!([]))
        );
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
    async fn exposes_instance_only_with_explicit_id() {
        let response = router()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/instances/instance")
                    .header("host", "127.0.0.1:43121")
                    .header("authorization", "Bearer secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
    }
}
