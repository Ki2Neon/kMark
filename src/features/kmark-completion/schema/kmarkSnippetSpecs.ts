import { type KmarkSnippetSpec } from "../core/types";

export const KMARK_SNIPPET_SPECS: readonly KmarkSnippetSpec[] = [
  {
    label: "align right",
    description: "対象ブロックを右寄せにする",
    contexts: ["single"],
    insertText: "align:right",
    priority: 100,
  },
  {
    label: "align center",
    description: "対象ブロックを中央寄せにする",
    contexts: ["single"],
    insertText: "align:center",
    priority: 95,
  },
  {
    label: "image size",
    description: "画像の幅・高さ・収まり方を指定する",
    contexts: ["image", "single"],
    insertText: "w:${1:200} h:${2:100} fit:${3:contain}",
    priority: 100,
  },
  {
    label: "image width",
    description: "画像幅だけを指定する",
    contexts: ["image", "single"],
    insertText: "w:${1:300}",
    priority: 95,
  },
  {
    label: "image border",
    description: "画像に枠線を付ける",
    contexts: ["image", "single"],
    insertText: "border_size:${1:2} border_color:${2:#000000} border_style:${3:solid}",
    priority: 90,
  },
  {
    label: "scope row",
    description: "横並びスコープを作成する",
    contexts: ["scope"],
    insertText: "{ layout:row gap:${1:8} wrap:${2:true} }",
    priority: 100,
  },
  {
    label: "scope column",
    description: "縦並びスコープを作成する",
    contexts: ["scope"],
    insertText: "{ layout:column gap:${1:8} }",
    priority: 95,
  },
  {
    label: "page A4 portrait",
    description: "A4縦ページ設定を作成する",
    contexts: ["page", "scope"],
    insertText: "{ page_size:A4 orientation:portrait font_size:${1:12pt} margin:${2:20mm} }",
    priority: 100,
  },
  {
    label: "page A4 landscape",
    description: "A4横ページ設定を作成する",
    contexts: ["page", "scope"],
    insertText: "{ page_size:A4 orientation:landscape font_size:${1:12pt} margin:${2:15mm} }",
    priority: 100,
  },
  {
    label: "use style",
    description: "定義済みスタイルを使用する",
    contexts: ["single", "scope", "page"],
    insertText: "use:${1:style_name}",
    priority: 90,
  },
] as const;
