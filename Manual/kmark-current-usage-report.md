# kmark Current Usage Report

## 結論

- kmark実行主体: Rust `kmark-core`
- Frontend責務: editor補完/警告 preview表示 A4 pagination print DOM化
- IPC境界: Markdown文字列 + file_path -> rendered HTML/page DTO
- Spec同期源: Rust schema -> JSON schema testで同期確認

## Architecture Core

| Layer | 責務 | File |
| --- | --- | --- |
| Domain/Renderer | Markdown parse kmark parse HTML生成 page DTO生成 | `crates/kmark-core/src/render_markdown_preview.rs` |
| Schema | kmark parameter定義 JSON生成 | `crates/kmark-core/src/kmark_param_schema.rs` |
| WASM Adapter | browser実行用renderer wrapper | `crates/kmark-web/src/lib.rs` |
| Tauri Adapter | Rust command DTO変換 | `src-tauri/src/commands/markdown_render.rs` |
| Frontend Adapter | Tauri/WASM切替 image URL正規化 | `src/adapters/browser/browserMarkdownPreviewRenderer.ts` |
| UI | preview描画 A4 pagination page番号 TOC page補完 table fit | `src/ui/components/MarkdownPreview.tsx` |
| Editor Feature | kmark補完 validation | `src/features/kmark-completion/*` |

## Tauri Adapter

| Flow | 内容 |
| --- | --- |
| Browser standard | `renderMarkdownPreview` -> WASM renderer |
| Tauri app | `renderMarkdownPreview` -> `render_markdown_preview` command |
| Input | `content: String` `file_path: Option<String>` |
| Output | `html` `pageHtmls` `pages` `defaultPageStyle` `defaultTextStyle` |
| Image | relative path は Markdown file path 基準で `file://` 化 frontendで `convertFileSrc` |

## Render Flow

1. `collect_kmark_toc_document`
2. `split_markdown_pages`
3. page segmentごと `DocumentPageConfig::resolve_page`
4. `pulldown-cmark` event収集
5. `HtmlEmitter` が kmark comment / Markdown event をHTML化
6. Frontend `MarkdownPreview` が standard/A4 modeへ描画

## Markdown Support

| Feature | 状態 |
| --- | --- |
| table | enabled |
| footnote | enabled |
| strikethrough | enabled |
| task list | enabled |
| heading attributes | enabled |
| inline unsafe HTML | suppressed |
| unsafe link | `javascript:`等 suppressed |
| safe line break HTML | `<br>` normalized |

## kmark Comment Detection

| 対象 | 条件 |
| --- | --- |
| renderer | line単位 `<!-- kmark ... -->` |
| validation/completion | HTML comment `<!-- ... -->` 内 `kmark` marker |
| code fence内 | 無効 |
| multiline HTML comment | page/kmark directiveとして基本無効 |

## Scope/Page Split挙動

| 操作 | 挙動 |
| --- | --- |
| `<!-- --- -->` | 手動page分割 first column限定 trailing space可 |
| page設定scope開始 | 既存content後にpage config差分があればsegment分割 |
| page設定scope終了 | 差分があればsegment分割 |
| scope跨ぎpage break | active scope lineを次segmentへprefixとして再注入 |
| `page_number_reset:true` | scope開始segmentだけ有効 次segmentでは解除 |
| standalone page directive | content前なら以降pageへ適用 |

## Parameter Application Rules

| Rule | 内容 |
| --- | --- |
| single | 直後target eventへ1回適用 |
| blank line | single pending破棄 |
| consecutive comment | merge 後勝ち |
| scope | stack管理 nested可 |
| EOF | unclosed scopeを自動close |
| unknown key | renderer無視 |
| invalid value | renderer無視 |
| duplicate | renderer後勝ち editor警告 |
| preset | `define`保存 `use`展開 |

## Block Target

| Markdown block | single適用 |
| --- | --- |
| paragraph | 有 |
| heading | 有 |
| blockquote | 有 callout rootにも適用 |
| code block | 有 root `<pre>` |
| list | 有 root `<ul>/<ol>` |
| table | 有 root `<table>` |
| footnote definition | 有 |
| definition list | 有 |
| metadata block | 有 |
| image | 有 `<img>` style + paragraph style |

## UI Rendering Notes

| 項目 | 内容 |
| --- | --- |
| `page_fit` | A4 frame CSS variableから本文領域幅/高を解決 |
| `page_fit_contain` | max幅/高 + contain |
| `page_valign` | A4 paginationでspacer挿入し上/中央/下配置 |
| `table_fit:auto` | overflow時 padding縮小後 font縮小 |
| `table_fit:shrink` | 最小paddingからfont縮小 |
| TOC page列 | A4 pagination後 heading id -> page番号mapで補完 |
| page番号 | A4 modeのみDOM表示 |

## Completion/Validation

| 機能 | 内容 |
| --- | --- |
| trigger | `<!-- kmark` comment内 cursor |
| inactive | fenced code内 inline code内 comment close後 |
| context推定 | 次blockが image/table/text か scope/page/toc か推定 |
| value候補 | enum boolean length color size preset font family |
| style補完 | `define`収集 -> `use:` 候補 |
| warning | unknown duplicate missing enum undefined use unclosed scope |

## Current Limitations

| 制約 | 影響 |
| --- | --- |
| same-comment `}` | scope終了扱いなし 別行close必須 |
| color CSS関数不可 | `rgb()` `var()` 未対応 |
| page length単位限定 | `%` `em` `rem` 未対応 |
| `page_width`片方のみ | width/height両方ないとcustom寸法反映なし |
| validation浅い | length/color/number範囲の詳細検証なし |
| schema `shape` | 現行rendererに独立shape syntaxなし |
| legacy `text` `stamp` | 表示生成なし |

## Manual Verification Assets

| File | 目的 |
| --- | --- |
| `markdown_test/kmark_page_layout_test.md` | page scope layout 手動確認 |
| `markdown_test/kmark_page_number_test.md` | page番号位置/format 手動確認 |
| `markdown_test/page_number_font_size_test.md` | page番号font size 手動確認 |
| `markdown_test/kmark_text_decoration_test.md` | text/box/image/table装飾 手動確認 |
| `markdown_test/kmark_text_decoration_check.md` | 装飾漏れ防止確認 |

## Maintenance Notes

| 作業 | 必須確認 |
| --- | --- |
| parameter追加 | `kmark_param_schema.rs` 更新 |
| frontend schema更新 | generator output `kmark-param-schema.json` 同期 |
| renderer挙動変更 | Rust unit test追加 |
| completion変更 | schema/context/suggestion validation更新 |
| Manual更新 | `Manual/kmark-parameter-reference.md` と実装差分確認 |
