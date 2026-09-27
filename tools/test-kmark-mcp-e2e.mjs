import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const sidecar = resolve(process.argv[2] ?? "target/release/kmark-mcp.exe");
const requestedInstanceId = process.argv[3] ?? null;
const fixtureDirectory = join(tmpdir(), `kmark-mcp-e2e-${process.pid}`);
const fixturePath = join(fixtureDirectory, "mcp-e2e.md");
await mkdir(fixtureDirectory, { recursive: true });
await writeFile(fixturePath, "# MCP E2E\n\nOriginal text\n", "utf8");

const child = spawn(sidecar, [], { stdio: ["pipe", "pipe", "pipe"] });
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

let sequence = 0;
let buffered = "";
const pending = new Map();
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffered += chunk;
  while (true) {
    const newline = buffered.indexOf("\n");
    if (newline < 0) break;
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (line.length === 0) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve: resolveRequest, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveRequest(message.result);
    }
  }
});

function send(method, params) {
  const id = ++sequence;
  const result = new Promise((resolveRequest, reject) => {
    pending.set(id, { resolve: resolveRequest, reject });
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return result;
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function toolJson(result) {
  if (result.isError) throw new Error(JSON.stringify(result.content));
  if (result.structuredContent !== undefined) return result.structuredContent;
  const block = result.content?.[0];
  if (block?.type === "text") return JSON.parse(block.text);
  throw new Error(`Unsupported MCP Tool result: ${JSON.stringify(result)}`);
}

async function callTool(name, args = {}) {
  return toolJson(await send("tools/call", { name, arguments: args }));
}

try {
  await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "kmark-e2e", version: "1.0.0" },
  });
  notify("notifications/initialized");

  const listed = await send("tools/list", {});
  const toolNames = listed.tools.map((tool) => tool.name).sort();
  const expectedTools = [
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
  ].sort();
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) {
    throw new Error(`Unexpected Tool set: ${toolNames.join(", ")}`);
  }
  const resources = await send("resources/templates/list", {});
  const resourceNames = resources.resourceTemplates.map((resource) => resource.name).sort();
  if (JSON.stringify(resourceNames) !== JSON.stringify(["kmark_preview_html", "kmark_preview_png"])) {
    throw new Error(`Unexpected Resource set: ${resourceNames.join(", ")}`);
  }

  const instances = await callTool("list_instances");
  const instance = requestedInstanceId === null
    ? instances.instances.at(-1)
    : instances.instances.find((candidate) => candidate.instanceId === requestedInstanceId);
  if (!instance) throw new Error(`Kmark instance not found: ${requestedInstanceId ?? "latest"}`);
  const instanceId = instance.instanceId;

  const created = await callTool("create_document", {
    instance_id: instanceId,
    suggested_file_name: "mcp-created.md",
  });
  if (created.revision !== 1 || created.content !== "" || created.isDirty !== false) {
    throw new Error(`Unexpected create result: ${JSON.stringify(created)}`);
  }

  const opened = await callTool("open_document", {
    instance_id: instanceId,
    path: fixturePath,
  });
  const sessionId = opened.sessionId;
  const reopened = await callTool("open_document", {
    instance_id: instanceId,
    path: fixturePath,
  });
  if (reopened.sessionId !== sessionId) {
    throw new Error("Opening the same canonical path created a duplicate DocumentSession");
  }
  const documents = await callTool("list_documents", { instance_id: instanceId });
  if (!documents.some((document) => document.sessionId === created.sessionId)
    || !documents.some((document) => document.sessionId === sessionId)) {
    throw new Error("list_documents omitted a Kmark UI session");
  }
  const document = await callTool("get_document", {
    instance_id: instanceId,
    session_id: sessionId,
  });
  const previewUri = `kmark-preview://${instanceId}/${sessionId}/${document.revision}/html/640/480`;
  const preview = await send("resources/read", { uri: previewUri });
  const previewHtml = preview.contents?.[0]?.text ?? "";
  if (!previewHtml.includes("MCP E2E") || !previewHtml.includes("Original text")) {
    throw new Error("HTML Preview Resource did not render the opened document");
  }
  const proposal = await callTool("replace_text", {
    instance_id: instanceId,
    session_id: sessionId,
    expected_revision: document.revision,
    expected_text: "Original text",
    replacement: "Updated by MCP",
  });

  process.stdout.write(`${JSON.stringify({
    phase: "awaiting_ui_accept",
    instanceId,
    createdSessionId: created.sessionId,
    sessionId,
    proposalId: proposal.proposalId,
    fixturePath,
    toolNames,
    resourceNames,
  })}\n`);

  let accepted = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    const current = await callTool("get_document", {
      instance_id: instanceId,
      session_id: sessionId,
    });
    if (current.content.includes("Updated by MCP") && current.pendingProposalId === null) {
      accepted = current;
      break;
    }
  }
  if (accepted === null) throw new Error("Timed out waiting for Kmark UI proposal acceptance");

  const saved = await callTool("save_document", {
    instance_id: instanceId,
    session_id: sessionId,
    expected_revision: accepted.revision,
  });
  const diagnostics = await callTool("validate_document", {
    instance_id: instanceId,
    session_id: sessionId,
  });
  const diagrams = await callTool("list_diagrams", {
    instance_id: instanceId,
    session_id: sessionId,
  });
  const diskContent = await readFile(fixturePath, "utf8");
  if (saved.outcome !== "saved" || !diskContent.includes("Updated by MCP")) {
    throw new Error(`Save verification failed: ${JSON.stringify(saved)}`);
  }

  process.stdout.write(`${JSON.stringify({
    phase: "complete",
    instanceId,
    sessionId,
    savedRevision: saved.document.revision,
    diagnosticCount: diagnostics.diagnostics.length,
    diagramCount: diagrams.diagrams.length,
    fixturePath,
  })}\n`);
} finally {
  child.stdin.end();
  child.kill();
}
