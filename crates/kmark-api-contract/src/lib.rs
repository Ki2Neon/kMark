use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ApiErrorResponse {
    pub code: String,
    pub message: String,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<ApiErrorDetails>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ApiErrorDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct InstancePayload {
    pub instance_id: String,
    pub api_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DocumentSessionSummaryPayload {
    pub instance_id: String,
    pub session_id: String,
    pub revision: u64,
    pub file_name: String,
    pub file_path: Option<String>,
    pub is_dirty: bool,
    pub pending_proposal_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DocumentPayload {
    #[serde(flatten)]
    pub session: DocumentSessionSummaryPayload,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct CreateDocumentRequest {
    pub suggested_file_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct OpenDocumentRequest {
    pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct SaveDocumentRequest {
    pub expected_revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct SaveDocumentResponse {
    pub outcome: String,
    pub document: DocumentPayload,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct TextEditOperationPayload {
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct SessionProposalRequest {
    pub expected_revision: u64,
    pub operations: Vec<TextEditOperationPayload>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ProposalPayload {
    pub proposal_id: String,
    pub session_id: String,
    pub base_revision: u64,
    pub status: String,
    pub kind: String,
    pub unified_diff: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DiagnosticPayload {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DiagnosticsPayload {
    pub revision: u64,
    pub diagnostics: Vec<DiagnosticPayload>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DiagramPayload {
    pub id: String,
    pub language: String,
    pub start_line: u32,
    pub end_line: u32,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DiagramsPayload {
    pub revision: u64,
    pub diagrams: Vec<DiagramPayload>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct DiagramValidationPayload {
    pub revision: u64,
    pub diagram_id: String,
    pub valid: bool,
    pub diagnostics: Vec<DiagnosticPayload>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct PreviewJobRequestPayload {
    pub expected_revision: u64,
    pub format: String,
    #[serde(default = "default_preview_width")]
    pub width: u32,
    #[serde(default = "default_preview_height")]
    pub height: u32,
}

fn default_preview_width() -> u32 {
    1280
}

fn default_preview_height() -> u32 {
    720
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct PreviewJobPayload {
    pub job_id: String,
    pub session_id: String,
    pub revision: u64,
    pub format: String,
    pub status: String,
    pub media_type: Option<String>,
    pub error: Option<String>,
    pub result_path: Option<String>,
}
