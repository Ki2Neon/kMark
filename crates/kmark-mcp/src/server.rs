use kmark_api_contract::{
    CreateDocumentRequest, DiagnosticsPayload, DiagramValidationPayload, DiagramsPayload,
    DocumentPayload, DocumentSessionSummaryPayload, OpenDocumentRequest, PreviewJobPayload,
    PreviewJobRequestPayload, ProposalPayload, SaveDocumentRequest, SaveDocumentResponse,
    SessionProposalRequest,
};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, ContentBlock, Implementation, ListResourceTemplatesResult,
        PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse,
        ReadResourceResult, ResourceContents, ResourceTemplate, ServerCapabilities, ServerInfo,
    },
    schemars,
    service::RequestContext,
    tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use serde::{Deserialize, Serialize};

use crate::{
    discovery::DiscoveryStore,
    locator::{exact_text_edit, line_range_edit},
    rest_client::RestClient,
};

#[derive(Clone)]
pub struct KmarkMcpServer {
    discovery: DiscoveryStore,
    tool_router: ToolRouter<Self>,
}

impl KmarkMcpServer {
    pub fn new(discovery: DiscoveryStore) -> Self {
        Self {
            discovery,
            tool_router: Self::tool_router(),
        }
    }

    fn client(&self, instance_id: &str) -> Result<RestClient, McpError> {
        let record = self
            .discovery
            .resolve(instance_id)
            .map_err(internal_error)?;
        RestClient::new(record).map_err(internal_error)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct InstanceInput {
    #[schemars(description = "Explicit Kmark instance_id returned by list_instances")]
    instance_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionInput {
    #[schemars(description = "Explicit Kmark instance_id")]
    instance_id: String,
    #[schemars(description = "Explicit DocumentSession session_id")]
    session_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct OpenDocumentInput {
    instance_id: String,
    #[schemars(description = "Absolute path to an existing Markdown file")]
    path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateDocumentInput {
    instance_id: String,
    suggested_file_name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SaveDocumentInput {
    instance_id: String,
    session_id: String,
    expected_revision: u64,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ReplaceTextInput {
    instance_id: String,
    session_id: String,
    #[schemars(description = "Revision returned by get_document")]
    expected_revision: u64,
    #[schemars(description = "Exact text expected in the current revision")]
    expected_text: String,
    #[schemars(description = "1-based occurrence; omit when expected_text is unique")]
    occurrence: Option<u32>,
    replacement: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ReplaceLinesInput {
    instance_id: String,
    session_id: String,
    expected_revision: u64,
    #[schemars(description = "1-based inclusive first line")]
    start_line: u32,
    #[schemars(description = "1-based inclusive last line")]
    end_line: u32,
    #[schemars(description = "Exact selected text excluding the final line break")]
    expected_text: String,
    replacement: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct InsertTextInput {
    instance_id: String,
    session_id: String,
    expected_revision: u64,
    #[schemars(description = "Exact anchor text expected in the current revision")]
    anchor_text: String,
    #[schemars(description = "1-based occurrence; omit when anchor_text is unique")]
    occurrence: Option<u32>,
    #[schemars(description = "Insert before or after the anchor: before | after")]
    position: String,
    text: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct DiagramInput {
    instance_id: String,
    session_id: String,
    diagram_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstancesOutput {
    instances: Vec<crate::discovery::InstanceSummary>,
}

#[tool_router]
impl KmarkMcpServer {
    #[tool(description = "List running Kmark instances with external API enabled")]
    async fn list_instances(&self) -> Result<CallToolResult, McpError> {
        json_result(InstancesOutput {
            instances: self.discovery.instances().map_err(internal_error)?,
        })
    }

    #[tool(description = "List all open DocumentSessions in an explicit Kmark instance")]
    async fn list_documents(
        &self,
        Parameters(input): Parameters<InstanceInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: Vec<DocumentSessionSummaryPayload> = client
            .get(
                &format!("/api/v1/instances/{}/sessions", client.instance_id()),
                &[],
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(description = "Get the current content and revision of an explicit DocumentSession")]
    async fn get_document(
        &self,
        Parameters(input): Parameters<SessionInput>,
    ) -> Result<CallToolResult, McpError> {
        json_result(self.document(&input).await?)
    }

    #[tool(description = "Open an absolute Markdown path in Kmark and show its editor window")]
    async fn open_document(
        &self,
        Parameters(input): Parameters<OpenDocumentInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: DocumentPayload = client
            .post(
                &format!("/api/v1/instances/{}/sessions/open", client.instance_id()),
                &OpenDocumentRequest { path: input.path },
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(description = "Create a blank untitled Kmark document and show its editor window")]
    async fn create_document(
        &self,
        Parameters(input): Parameters<CreateDocumentInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: DocumentPayload = client
            .post(
                &format!("/api/v1/instances/{}/sessions", client.instance_id()),
                &CreateDocumentRequest {
                    suggested_file_name: input.suggested_file_name,
                },
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(
        description = "Propose replacing exact text; validates revision and expected text before converting to UTF-8 byte offsets"
    )]
    async fn replace_text(
        &self,
        Parameters(input): Parameters<ReplaceTextInput>,
    ) -> Result<CallToolResult, McpError> {
        let document = self
            .verified_document(
                &input.instance_id,
                &input.session_id,
                input.expected_revision,
            )
            .await?;
        let edit = exact_text_edit(
            &document.content,
            &input.expected_text,
            input.occurrence,
            input.replacement,
        )
        .map_err(invalid_params)?;
        self.propose_edit(
            &input.instance_id,
            &input.session_id,
            input.expected_revision,
            edit,
        )
        .await
    }

    #[tool(
        description = "Propose replacing a 1-based inclusive line range after exact text validation"
    )]
    async fn replace_lines(
        &self,
        Parameters(input): Parameters<ReplaceLinesInput>,
    ) -> Result<CallToolResult, McpError> {
        let document = self
            .verified_document(
                &input.instance_id,
                &input.session_id,
                input.expected_revision,
            )
            .await?;
        let edit = line_range_edit(
            &document.content,
            input.start_line,
            input.end_line,
            &input.expected_text,
            input.replacement,
        )
        .map_err(invalid_params)?;
        self.propose_edit(
            &input.instance_id,
            &input.session_id,
            input.expected_revision,
            edit,
        )
        .await
    }

    #[tool(
        description = "Propose inserting text before or after exact anchor text after revision validation"
    )]
    async fn insert_text(
        &self,
        Parameters(input): Parameters<InsertTextInput>,
    ) -> Result<CallToolResult, McpError> {
        let document = self
            .verified_document(
                &input.instance_id,
                &input.session_id,
                input.expected_revision,
            )
            .await?;
        let anchor = exact_text_edit(
            &document.content,
            &input.anchor_text,
            input.occurrence,
            String::new(),
        )
        .map_err(invalid_params)?;
        let offset = match input.position.as_str() {
            "before" => anchor.start,
            "after" => anchor.end,
            _ => return Err(invalid_params("position must be before or after")),
        };
        self.propose_edit(
            &input.instance_id,
            &input.session_id,
            input.expected_revision,
            kmark_api_contract::TextEditOperationPayload {
                start: offset,
                end: offset,
                text: input.text,
            },
        )
        .await
    }

    #[tool(description = "Save an explicit DocumentSession using Kmark save behavior")]
    async fn save_document(
        &self,
        Parameters(input): Parameters<SaveDocumentInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: SaveDocumentResponse = client
            .post(
                &format!(
                    "/api/v1/instances/{}/sessions/{}/save",
                    client.instance_id(),
                    checked_id(&input.session_id)?
                ),
                &SaveDocumentRequest {
                    expected_revision: input.expected_revision,
                },
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(description = "Validate the current document revision and return diagnostics")]
    async fn validate_document(
        &self,
        Parameters(input): Parameters<SessionInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: DiagnosticsPayload = client
            .get(
                &format!(
                    "/api/v1/instances/{}/sessions/{}/diagnostics",
                    client.instance_id(),
                    checked_id(&input.session_id)?
                ),
                &[],
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(description = "List diagrams in an explicit DocumentSession")]
    async fn list_diagrams(
        &self,
        Parameters(input): Parameters<SessionInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: DiagramsPayload = client
            .get(
                &format!(
                    "/api/v1/instances/{}/sessions/{}/diagrams",
                    client.instance_id(),
                    checked_id(&input.session_id)?
                ),
                &[],
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }

    #[tool(description = "Validate one diagram by explicit diagram id")]
    async fn validate_diagram(
        &self,
        Parameters(input): Parameters<DiagramInput>,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(&input.instance_id)?;
        let result: DiagramValidationPayload = client
            .post(
                &format!(
                    "/api/v1/instances/{}/sessions/{}/diagrams/{}/validate",
                    client.instance_id(),
                    checked_id(&input.session_id)?,
                    checked_id(&input.diagram_id)?
                ),
                &serde_json::json!({}),
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }
}

impl KmarkMcpServer {
    async fn document(&self, input: &SessionInput) -> Result<DocumentPayload, McpError> {
        let client = self.client(&input.instance_id)?;
        client
            .get(
                &format!(
                    "/api/v1/instances/{}/sessions/{}/document",
                    client.instance_id(),
                    checked_id(&input.session_id)?
                ),
                &[],
            )
            .await
            .map_err(internal_error)
    }

    async fn verified_document(
        &self,
        instance_id: &str,
        session_id: &str,
        expected_revision: u64,
    ) -> Result<DocumentPayload, McpError> {
        let document = self
            .document(&SessionInput {
                instance_id: instance_id.to_owned(),
                session_id: session_id.to_owned(),
            })
            .await?;
        if document.session.revision != expected_revision {
            return Err(invalid_params(format!(
                "revision conflict: expected {expected_revision}, current {}",
                document.session.revision
            )));
        }
        Ok(document)
    }

    async fn propose_edit(
        &self,
        instance_id: &str,
        session_id: &str,
        expected_revision: u64,
        edit: kmark_api_contract::TextEditOperationPayload,
    ) -> Result<CallToolResult, McpError> {
        let client = self.client(instance_id)?;
        let result: ProposalPayload = client
            .post(
                &proposal_path(&client, session_id)?,
                &SessionProposalRequest {
                    expected_revision,
                    operations: vec![edit],
                },
            )
            .await
            .map_err(internal_error)?;
        json_result(result)
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for KmarkMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(
            Implementation::new("kmark-mcp", env!("CARGO_PKG_VERSION"))
                .with_title("Kmark MCP Adapter"),
        )
        .with_instructions(
            "Use explicit instance_id and session_id. Text mutations create Kmark UI proposals. Create, open, and save use Kmark document workflows. Tool schemas never expose UTF-8 byte offsets.",
        )
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult::with_all_items(
            preview_resource_templates(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let locator = PreviewResourceLocator::parse(&request.uri)?;
        let client = self.client(&locator.instance_id)?;
        let path = format!(
            "/api/v1/instances/{}/sessions/{}/preview-jobs",
            client.instance_id(),
            checked_id(&locator.session_id)?
        );
        let mut job: PreviewJobPayload = client
            .post(
                &path,
                &PreviewJobRequestPayload {
                    expected_revision: locator.revision,
                    format: locator.format.clone(),
                    width: locator.width,
                    height: locator.height,
                },
            )
            .await
            .map_err(internal_error)?;
        let job_path = format!("{path}/{}", checked_id(&job.job_id)?);
        for _ in 0..150 {
            if matches!(job.status.as_str(), "completed" | "failed") {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            job = client.get(&job_path, &[]).await.map_err(internal_error)?;
        }
        if job.status != "completed" {
            return Err(internal_error(job.error.unwrap_or_else(|| {
                "preview job did not complete within 15 seconds".to_owned()
            })));
        }
        let bytes = client
            .get_bytes(&format!("{job_path}/result"))
            .await
            .map_err(internal_error)?;
        let content = if locator.format == "html" {
            ResourceContents::text(
                String::from_utf8(bytes)
                    .map_err(|_| internal_error("preview HTML is not valid UTF-8"))?,
                request.uri,
            )
            .with_mime_type("text/html")
        } else {
            use base64::Engine;
            ResourceContents::blob(
                base64::engine::general_purpose::STANDARD.encode(bytes),
                request.uri,
            )
            .with_mime_type("image/png")
        };
        Ok(ReadResourceResult::new(vec![content]).into())
    }
}

fn preview_resource_templates() -> Vec<ResourceTemplate> {
    vec![
        ResourceTemplate::new(
            "kmark-preview://{instance_id}/{session_id}/{revision}/html/{width}/{height}",
            "kmark_preview_html",
        )
        .with_title("Kmark HTML Preview")
        .with_description("Rendered preview for one explicit immutable document revision")
        .with_mime_type("text/html"),
        ResourceTemplate::new(
            "kmark-preview://{instance_id}/{session_id}/{revision}/png/{width}/{height}",
            "kmark_preview_png",
        )
        .with_title("Kmark PNG Preview")
        .with_description("Windows WebView2 capture for one explicit immutable document revision")
        .with_mime_type("image/png"),
    ]
}

struct PreviewResourceLocator {
    instance_id: String,
    session_id: String,
    revision: u64,
    format: String,
    width: u32,
    height: u32,
}

impl PreviewResourceLocator {
    fn parse(value: &str) -> Result<Self, McpError> {
        let url = reqwest::Url::parse(value)
            .map_err(|_| invalid_params("invalid Kmark preview resource URI"))?;
        if url.scheme() != "kmark-preview" || url.query().is_some() || url.fragment().is_some() {
            return Err(invalid_params("invalid Kmark preview resource URI"));
        }
        let instance_id = url
            .host_str()
            .ok_or_else(|| invalid_params("preview URI is missing instance_id"))?
            .to_owned();
        checked_id(&instance_id)?;
        let segments = url
            .path_segments()
            .ok_or_else(|| invalid_params("invalid preview URI path"))?
            .collect::<Vec<_>>();
        if segments.len() != 5 {
            return Err(invalid_params(
                "preview URI path must contain session, revision, format, width, and height",
            ));
        }
        let session_id = checked_id(segments[0])?.to_owned();
        let revision = segments[1]
            .parse()
            .map_err(|_| invalid_params("invalid preview revision"))?;
        let format = match segments[2] {
            "html" | "png" => segments[2].to_owned(),
            _ => return Err(invalid_params("preview format must be html or png")),
        };
        let width = segments[3]
            .parse::<u32>()
            .map_err(|_| invalid_params("invalid preview width"))?;
        let height = segments[4]
            .parse::<u32>()
            .map_err(|_| invalid_params("invalid preview height"))?;
        if !(320..=4096).contains(&width) || !(240..=4096).contains(&height) {
            return Err(invalid_params(
                "preview dimensions are outside the supported range",
            ));
        }
        Ok(Self {
            instance_id,
            session_id,
            revision,
            format,
            width,
            height,
        })
    }
}

fn proposal_path(client: &RestClient, session_id: &str) -> Result<String, McpError> {
    Ok(format!(
        "/api/v1/instances/{}/sessions/{}/proposals",
        client.instance_id(),
        checked_id(session_id)?
    ))
}

fn checked_id(value: &str) -> Result<&str, McpError> {
    if !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Ok(value)
    } else {
        Err(invalid_params("identifier contains invalid characters"))
    }
}

fn json_result(value: impl Serialize) -> Result<CallToolResult, McpError> {
    Ok(CallToolResult::success(vec![ContentBlock::json(value)?]))
}

fn internal_error(error: impl std::fmt::Display) -> McpError {
    McpError::internal_error(error.to_string(), None)
}

fn invalid_params(error: impl std::fmt::Display) -> McpError {
    McpError::invalid_params(error.to_string(), None)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::{preview_resource_templates, KmarkMcpServer};

    #[test]
    fn publishes_semantic_tools_without_byte_locator_fields() {
        let tools = KmarkMcpServer::tool_router().list_all();
        let names = tools
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<BTreeSet<_>>();
        assert_eq!(
            names,
            BTreeSet::from([
                "create_document",
                "get_document",
                "insert_text",
                "list_diagrams",
                "list_documents",
                "list_instances",
                "open_document",
                "replace_lines",
                "replace_text",
                "save_document",
                "validate_diagram",
                "validate_document",
            ])
        );
        let forbidden = ["start", "end", "offset", "byte_offset", "byteOffset"];
        for tool in tools {
            let properties = tool
                .input_schema
                .get("properties")
                .and_then(serde_json::Value::as_object)
                .expect("tool input properties");
            for field in forbidden {
                assert!(
                    !properties.contains_key(field),
                    "{} exposes forbidden locator field {field}",
                    tool.name
                );
            }
        }
    }

    #[test]
    fn publishes_only_html_and_png_preview_resources() {
        let templates = preview_resource_templates();
        assert_eq!(templates.len(), 2);
        assert_eq!(templates[0].name, "kmark_preview_html");
        assert_eq!(templates[1].name, "kmark_preview_png");
    }
}
