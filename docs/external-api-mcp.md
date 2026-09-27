# Conclusion

- Kmark本体: REST API + OpenAPI + 正準DocumentSession/Proposal
- `kmark-mcp`: MCP stdioとRESTのSemantic Adapter
- 書込先: `instance_id -> session_id -> document` 明示指定
- 外部API範囲: Kmarkの文書作成 開く 編集 保存 検証 Preview
- 非提供: file探索 任意file読取 rename delete

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
- `kmark-application`: Session revision Proposal State遷移 DocumentFile/Preview Port
- `kmark-rest`: HTTP DTO Auth OpenAPIのみ
- `kmark-mcp`: Discovery REST client Semantic Locator MCP Tool/Resourceのみ
- `active window` / focus: 外部APIの対象決定に不使用

# Tauri Adapter

- 外部API: 初期値`disabled`
- 設定: enabled切替のみ
- Server: `127.0.0.1:0` dynamic port
- Token: 起動時生成 終了時失効
- Discovery: user config配下 `external-api/instances/<instance_id>.json`
- create/open: 対応Editor windowを生成またはfocus
- untitled save: Kmark Save As dialog
- Proposal accept/reject: Tauri IPC + Kmark UI限定
- REST/MCPからProposal accept/reject不可

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

# REST Contract

- OpenAPI: `GET /openapi.json`
- Auth: `Authorization: Bearer <ephemeral-token>`
- Host: discovery recordの`127.0.0.1:<port>`と完全一致
- Browser Origin付き要求: 拒否
- Request body / Markdown上限: 8 MiB
- open path: 既知のabsolute `.md` / `.markdown` pathのみ

主要Resource:

```text
GET  /api/v1/instances/{instance_id}
GET  /api/v1/instances/{instance_id}/sessions
POST /api/v1/instances/{instance_id}/sessions
POST /api/v1/instances/{instance_id}/sessions/open
GET  /api/v1/instances/{instance_id}/sessions/{session_id}/document
POST /api/v1/instances/{instance_id}/sessions/{session_id}/proposals
GET  /api/v1/instances/{instance_id}/sessions/{session_id}/proposals/{proposal_id}
POST /api/v1/instances/{instance_id}/sessions/{session_id}/save
```

- create: revision 1 clean blank untitled Sessionを即時生成
- open: canonical absolute pathで既存Sessionをdeduplicate
- REST edit range: UTF-8 byte offset
- 競合: `expectedRevision != currentRevision` -> `409 revision_conflict`
- Accept競合: `currentRevision != baseRevision` -> terminal `stale_proposal`
- v1 auto-rebase: なし
- save: pending Proposal存在時拒否
- overwrite save: Disk identity + SHA-256再検証
- untitled Save As cancel: revision/state不変 + `outcome=cancelled`

# MCP Contract

Semantic Tool 12件:

```text
list_instances
list_documents
get_document
create_document
open_document
insert_text
replace_text
replace_lines
save_document
validate_document
list_diagrams
validate_diagram
```

- 全対象Tool: `instance_id`必須
- Document Tool: `session_id`必須
- edit locator: exact text | 1-based line range
- MCP schema: byte offset非公開
- Adapter: revision + expected text検証後byte offset変換
- text edit: Proposal生成 + Kmark UI承認
- create/open/save: Kmark Application UseCaseを直接実行

# Preview

MCP Resource template 2件:

```text
kmark-preview://{instance_id}/{session_id}/{revision}/html/{width}/{height}
kmark-preview://{instance_id}/{session_id}/{revision}/png/{width}/{height}
```

- HTML: 全OS
- PNG: Windows hidden WebView2 capture
- Mermaid / PlantUML / DOT: 既存Preview AdapterでSVG生成後に返却
- Job上限: active 2 retained 32 artifact 32 MiB
- network: Capture専用CSP + Diagram resource allowlistで外部接続遮断
