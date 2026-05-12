# kMark Manual

## 目的

- 対象: 現行 kmark renderer / editor completion / validation
- 主題: kmark拡張記法 使用法 parameter全体像
- 根拠:
  - `crates/kmark-core/src/render_markdown_preview.rs`
  - `crates/kmark-core/src/kmark_param_schema.rs`
  - `src/features/kmark-completion/schema/kmark-param-schema.json`
  - `src/features/kmark-completion/core/validateKmarkDirective.ts`
  - `src/ui/components/MarkdownPreview.tsx`
  - `markdown_test/*.md`

## 文書構成

| File | 内容 |
| --- | --- |
| `kmark-user-manual.md` | 利用者向け基本操作 syntax workflow 注意点 |
| `kmark-parameter-reference.md` | kmark拡張parameter 全一覧 値規則 実例 |
| `kmark-current-usage-report.md` | 現行実装調査結果 renderer/editor/page/print挙動 |

## 最短例

```markdown
<!-- kmark color:#c00 font_size:14pt font_weight:bold -->
重要本文

<!-- kmark { page_size:A4 orientation:landscape page_margin:15mm page_number:bottom-center -->
# 横向きページ
<!-- kmark } -->
```

## 重要原則

- `<!-- kmark ... -->`: Markdown本文内 comment 形式
- 単発指定: 直後blockだけ適用 空行で失効
- scope指定: `<!-- kmark { ... -->` から `<!-- kmark } -->` まで適用
- page指定: 用紙preview/print向け page style 制御
- invalid値/unknown key: renderer側では基本無視 editor側では一部警告
