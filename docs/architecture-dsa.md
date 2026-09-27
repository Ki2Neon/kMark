# Conclusion

- `Architecture Core`: `domain -> application -> adapters/ui` 単方向 固定
- `Tauri Adapter`: `frontend intent` 最小化 `Rust command` 外周化
- `Verification`: import cycle 検査 境界検査 追加

# Architecture Core

- `domain`
  - 純粋型 純粋関数 限定
  - `src/domain/*`
- `application`
  - UseCase State遷移 Port 定義
  - `src/application/editorSession/*`
  - `EditorSessionController` : draft復元 保存 印刷 外部document受理 orchestration
  - `editorSessionReducer` : 正準 state transition
  - `src/application/previewPreferences/*`
  - `src/application/editorPreferences/*`
  - `src/application/appTheme/*`
  - `src/application/appShell/*`
  - `src/application/desktopWorkspaceSplit/*`
  - `DesktopWorkspaceSplitController` : split clamp keyboard pointer ratio rule
  - `AppShellController` : document theme同期
  - `src-tauri/src/usecase/app_exit_coordinator.rs`
  - `AppExitCoordinator` : editor Window保存確認を決定順で逐次処理 `begin -> complete | cancel -> exit`
  - `EditorState` : `fileName/filePath/isDirty/lastSavedAt/errorMessage` のみ
  - 本文 : React Stateへ格納禁止
  - document path変更 : Rust `EditorStateAction` Reducer経由のみ
- `ui`
  - 描画 入力受付 最小UI状態
  - `src/ui/hooks/useMarkdownEditor.ts`
  - `application` controller 呼出 専念

# Editor Document Session

## State所有権

- CodeMirror `EditorView` : speculative working copy 選択 IME Undo履歴
- Rust `EditorDocument` : authoritative document `Rope/revision/lineEnding/dirty/retry ledger`
- Web : Main WASM `EditorDocument` がauthoritative Worker WASMがPreview mirror
- React : document metadataとlifecycle bindingのみ 本文の通常更新禁止

## Mutation Contract

- `EditorTransaction` : `beforeLengthUtf16 + changes[]`
- `EditorMutationBatch` : `clientId + batchId + expectedRevision + transactions[]`
- CodeMirror `ChangeSet` -> 独自DTO変換 CodeMirror型のCore/IPC流入禁止
- 座標 : UTF-16 code unit
- `fromUtf16/toUtf16` : Ropey変換後の往復一致を必須化 surrogate pair中間を拒否
- Transaction内change : 変更前座標 昇順 非重複
- Batch : 全Transaction成功時のみcommit `revision += 1`
- Batch失敗 : text/revision/dirty不変
- retry : 同一`clientId/batchId/payload`のみcached ACK返却
- stale : `expectedRevision != currentRevision`を拒否

## LF正準化

- 読込 : `CRLF | CR -> LF`
- Session内部 : LFのみ
- metadata : `lineEnding = lf | crlf`
- mutation insert : `\r`拒否
- 保存 : metadataが`crlf`の場合のみ `LF -> CRLF`
- CodeMirror/Rust : 同一UTF-16 offset体系

## Mutation Queue / Barrier

- Frontend Queue : single-flight pending TransactionをBatch化
- ACK前 : 次Batch送信禁止
- Draft Preview lifecycle操作 : `MutationQueue.flush() -> Rust operation`
- 公開操作 : open/save/saveAs/print/reset/close/staged operationからQueueを迂回禁止
- Draft flush : `sessionId + expectedRevision`でRust canonical snapshotを永続化
- `flush_editor_draft` : Frontend mutation flushとは別責務

## Undo / Resync

- 通常外部更新 : `Transaction.remote + addToHistory(false)` 既存historyをmapして維持
- open/switch/bootstrap/fatal desync : `EditorState.create`による再生成 history破棄
- fatal desync : speculative snapshotをDraft保存 -> authoritative Full Snapshot取得 -> State再生成
- Full Snapshot : lifecycle/recovery境界限定

## Preview / Draft / Analysis

- Preview : Mutation Queue flush後 `sessionId/revision`でrender
- Tauri Preview : Rust canonical Sessionを直接render 本文IPC禁止
- Web Preview : Worker mirrorへ同一Mutation DTO適用 Full Snapshotはbootstrap/recoveryのみ
- Draft : debounce + Queue flush + `expectedRevision`検査 latest-wins
- Analysis decoration : debounce + request世代検査 latest-wins 同期`docChanged`全文変換禁止

# Tauri Adapter

- `frontend adapters`
  - `src/adapters/browser/*`
  - `BrowserMarkdownDocumentGateway` : picker Tauri path download fallback 吸収
  - `BrowserDraftStore` : localStorage adapter
  - `BrowserMarkdownRenderer` : async preview rendering adapter
  - `WasmEditorDocumentGateway` : Web canonical Session + Preview Worker mirror
  - `BrowserDocumentThemeGateway` : documentElement dataset/style 同期
  - `BrowserMarkdownDocumentPrinter` : print adapter
  - `src/contracts/generated/*` : Rust公開Contractから生成した境界DTO
- `backend adapters`
  - `src-tauri/src/commands/*`
  - IPC DTO Result Error string 公開
  - `render_markdown_preview` : Rust render command
  - `apply_editor_mutation_batch` : atomic Mutation適用
  - `mark_editor_session_saved` : dirty解除と保存metadata更新
  - `render_editor_session_preview` : canonical revision指定render
  - `flush_editor_draft` : canonical revision指定Draft永続化
  - Window close : `destroy` 固定 Tray resident ProcessとWebView lifecycleを分離
  - Tray Quit : editor Windowを再表示せず `AppExitCoordinator` 経由で全Window確認 Dirty Windowのみ表示
  - startup : static hidden Window禁止 通常起動またはTray intent時のみWindow生成
  - UseCase Domain direct UI露出 禁止

# IPC Contract

- Source of Truth : `crates/kmark-contract/src/lib.rs`
- 生成 : `pnpm generate:contracts`
- drift検査 : `pnpm check:contracts`
- 配置 : `src/contracts/generated/*`
- Domain/Application : generated DTO参照禁止
- Adapter/Infra/WASM : generated DTOへ明示写像

# Render Path

- `Editor`
  - `CodeMirror Transaction` -> `EditorMutationQueue` -> authoritative Session
  - `BrowserMarkdownRenderer`
  - `Tauri invoke render_editor_session_preview(sessionId, revision)`
  - `Rust usecase render_markdown_preview`
  - `RenderedPreviewPayload` active mode union
  - `standard -> html` | `a4 -> pages`
  - 非active mode HTML保持禁止
- `Web fallback`
  - Main WASM Session -> Mutation DTO -> Worker mirror -> WASM render
  - Full Snapshot transfer : bootstrap/fatal recovery限定

# State Persistence

- Envelope : `{ schemaVersion, revision, payload }`
- Slot : `<aggregate>.slot-0.json` / `<aggregate>.slot-1.json`
- 読込 : 有効な最大revision採用
- 保存 : 非active/最古Slotへ書込 -> flush/sync -> read-back検証
- 排他 : Desktop `fs2` lock | Browser `Web Locks API`
- 旧形式 : bare JSONをrevision 1へ移行 旧file保持
- 破損 : `.corrupt-{epoch}` 隔離 最大3世代 UI通知
- 将来Schema : 書換禁止 Desktop起動停止 | Browser fatal画面

# Dependency Rules

- `domain` -> `domain` のみ
- `application` -> `domain | application` のみ
- `ui/hooks/useMarkdownEditor.ts` -> `application | adapters | domain` のみ
- `ui/hooks/usePreviewPreferences.ts` -> `application | adapters | domain` のみ
- `ui/hooks/useEditorPreferences.ts` -> `application | adapters | domain` のみ
- `ui/hooks/useAppTheme.ts` -> `application | adapters | domain` のみ
- `ui/hooks/useDesktopWorkspaceSplit.ts` -> `application | adapters | domain` のみ
- `src/App.tsx` -> `application | adapters | domain | ui` のみ
- `infra` 直参照 `ui` へ再導入 禁止
- import cycle 発生時 `pnpm run check:cycles` fail

# Verification

- ASCII 日本語 emoji combining character surrogate pair multi-cursor fixture
- CRLF読込 LF内部表現 CRLF保存 fixture
- Batch途中失敗 rollback revision/dirty不変 fixture
- 同一Batch retry冪等性 stale/順序違反 fixture
- 通常remote update history維持 bootstrap/fatal resync history破棄
- Preview Worker revision一致 Draft expectedRevision一致
- 通常`docChanged`経路の全文`toString()`禁止
- 1MB/5MB : Mutation payload量 ACK latency Preview latencyを継続測定
- `pnpm run check:cycles`
- `pnpm run check:boundaries`
- `pnpm run check:contracts`
- `pnpm run build:web`
- `pnpm run benchmark:editor-session`
- `cargo test --manifest-path crates/kmark-core/Cargo.toml`
- `cargo test --manifest-path crates/kmark-web/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml benchmark_collect_markdown_file_paths -- --ignored --nocapture`

# Risk / Success

- Risk : Frontend/Rust UTF-16 drift -> `beforeLengthUtf16`とACK lengthで検出 Full resync
- Risk : Worker/Tauri revision drift -> render拒否 Webのみmirror bootstrap recovery
- Risk : 外部proposal競合 -> Queue flush + stale revision拒否
- Success : 通常入力で全文IPC 全文React更新 Main->Worker全文転送が発生しない
- Success : CRLF/emoji/IME/multi-cursorで決定論的に同一文書へ収束
- Success : save/open/print/reset/closeが未送信Mutationを追い越さない
