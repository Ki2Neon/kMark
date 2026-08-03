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
  - `EditorState` : `content/fileName/filePath/isDirty/lastSavedAt/errorMessage` 正準State
  - document path変更 : Rust `EditorStateAction` Reducer経由のみ
- `ui`
  - 描画 入力受付 最小UI状態
  - `src/ui/hooks/useMarkdownEditor.ts`
  - `application` controller 呼出 専念

# Tauri Adapter

- `frontend adapters`
  - `src/adapters/browser/*`
  - `BrowserMarkdownDocumentGateway` : picker Tauri path download fallback 吸収
  - `BrowserDraftStore` : localStorage adapter
  - `BrowserMarkdownRenderer` : async preview rendering adapter
  - `BrowserDocumentThemeGateway` : documentElement dataset/style 同期
  - `BrowserMarkdownDocumentPrinter` : print adapter
  - `src/contracts/generated/*` : Rust公開Contractから生成した境界DTO
- `backend adapters`
  - `src-tauri/src/commands/*`
  - IPC DTO Result Error string 公開
  - `render_markdown_preview` : Rust render command
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
  - `content` -> `useMarkdownEditor`
  - `BrowserMarkdownRenderer`
  - `Tauri invoke render_markdown_preview`
  - `Rust usecase render_markdown_preview`
  - `RenderedPreviewPayload` active mode union
  - `standard -> html` | `a4 -> pages`
  - 非active mode HTML保持禁止
- `Web fallback`
  - `Tauri unavailable` 時 WASM Worker render

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

- `pnpm run check:cycles`
- `pnpm run check:boundaries`
- `pnpm run check:contracts`
- `pnpm run build:web`
- `cargo test --manifest-path crates/kmark-core/Cargo.toml`
- `cargo test --manifest-path crates/kmark-web/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml benchmark_collect_markdown_file_paths -- --ignored --nocapture`
