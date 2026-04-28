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
- `ui`
  - 描画 入力受付 最小UI状態
  - `src/ui/hooks/useMarkdownEditor.ts`
  - `application` controller 呼出 専念

# Tauri Adapter

- `frontend adapters`
  - `src/adapters/browser/*`
  - `BrowserMarkdownDocumentGateway` : picker Tauri path download fallback 吸収
  - `BrowserDraftStore` : localStorage adapter
  - `BrowserMarkdownRenderer` : Markdown rendering adapter
  - `BrowserMarkdownDocumentPrinter` : print adapter
- `backend adapters`
  - `src-tauri/src/commands/*`
  - IPC DTO Result Error string 公開
  - UseCase Domain direct UI露出 禁止

# Dependency Rules

- `domain` -> `domain` のみ
- `application` -> `domain | application` のみ
- `ui/hooks/useMarkdownEditor.ts` -> `application | adapters | domain` のみ
- `infra` 直参照 `ui` へ再導入 禁止
- import cycle 発生時 `npm run check:cycles` fail

# Verification

- `npm run check:cycles`
- `npm run check:boundaries`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml benchmark_collect_markdown_file_paths -- --ignored --nocapture`
