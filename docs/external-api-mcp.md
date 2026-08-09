# Conclusion

- Kmark本体: REST API + OpenAPI + 正準DocumentSession/Proposal
- `kmark-mcp`: MCP stdioとRESTのSemantic Adapter
- 書込先: `instance_id -> session_id -> document` 明示指定
- `current`: read-only convenience限定

# Architecture Core

```text
MCP Host
  -> stdio / MCP
kmark-mcp
  -> Bearer HTTP / 127.0.0.1 dynamic port
Kmark REST Adapter
  -> ApplicationService
kmark-core
```

- `kmark-core`: HTTP REST MCP Tauri AIを参照しない
- `kmark-application`: Session revision Proposal State遷移 File/Preview Port
- `kmark-rest`: HTTP DTO Auth OpenAPIのみ
- `kmark-mcp`: Discovery REST client Locator MCP Tool/Resourceのみ

# Tauri Adapter

- 外部API: 初期値`disabled`
- 設定: Tray/Menu `外部API連携`
- Root登録: Folder picker経由のみ
- Server: `127.0.0.1:0` dynamic port
- Token: 起動時生成 終了時失効
- Discovery: user config配下 `external-api/instances/<instance_id>.json`
- Proposal accept/reject: Tauri IPC + Kmark UI限定
- rename/delete commit/cancel: Tauri IPC + Kmark UI限定
- REST/MCPからaccept/reject/commit不可

# Build

```powershell
pnpm tauri build
```

- `beforeBuildCommand`: `kmark-mcp` Release Buildを実行
- Installer: `kmark.exe`と`kmark-mcp.exe`を同梱
- MCP Adapter単体Build: `pnpm run build:mcp-sidecar`

MCP Host設定:

```json
{
  "mcpServers": {
    "kmark": {
      "command": "C:\\path\\to\\kmark-mcp.exe",
      "args": []
    }
  }
}
```

開発時配置: `target/release/kmark-mcp.exe`

Installer導入後: `kmark.exe`と同一Directoryの`kmark-mcp.exe`

# REST Contract

- OpenAPI: `GET /openapi.json`
- Auth: `Authorization: Bearer <ephemeral-token>`
- Host: discovery recordの`127.0.0.1:<port>`と完全一致
- Browser Origin付き要求: 拒否
- Request body上限: 8 MiB
- File read上限: 8 MiB UTF-8
- Root外path symlink escape Windows ADS: 拒否

主要Resource:

```text
GET  /api/v1/instances/{instance_id}/sessions
GET  /api/v1/instances/{instance_id}/sessions/current
POST /api/v1/instances/{instance_id}/sessions/open
GET  /api/v1/instances/{instance_id}/sessions/{session_id}/document
GET  /api/v1/instances/{instance_id}/roots/{root_id}/file
POST /api/v1/instances/{instance_id}/proposals
POST /api/v1/instances/{instance_id}/sessions/{session_id}/proposals
POST /api/v1/instances/{instance_id}/sessions/{session_id}/preview-jobs
```

- `read_file`: Session非生成
- `open_document`: Session生成
- REST edit range: UTF-8 byte offset
- 競合: `expectedRevision != currentRevision` -> `409 revision_conflict`
- Accept競合: `currentRevision != baseRevision` -> terminal `stale_proposal`
- v1 auto-rebase: なし
- Create Proposal accept: dirty untitled Session生成 Disk書込なし
- rename/delete: Proposal accept後staging Disk identity + SHA-256再検証後UI commit

# MCP Contract

Semantic Tool:

```text
list_instances
list_roots
list_documents
get_document
read_file
open_document
list_files
search_files
propose_create_document
replace_text
replace_lines
insert_text
propose_rename_document
propose_delete_document
validate_document
list_diagrams
validate_diagram
```

- 全対象Tool: `instance_id`必須
- Document Tool: `session_id`必須
- edit locator: exact text | 1-based line range
- MCP schema: byte offset非公開
- Adapter: revision + expected text検証後byte offset変換
- mutation: Proposal生成のみ

# Preview

MCP Resource template:

```text
kmark-preview://{instance_id}/{session_id}/{revision}/html/{width}/{height}
kmark-preview://{instance_id}/{session_id}/{revision}/png/{width}/{height}
```

- HTML: 全OS
- PNG: Windows hidden WebView2 capture
- Mermaid / PlantUML / DOT: 既存Preview AdapterでSVG生成後に返却
- Job上限: active 2 retained 32 artifact 32 MiB
- network: Capture専用CSP + Diagram resource allowlistで外部接続遮断
