# kmark text decoration test

裸paramが直下Markdown blockへ作用する確認。

## paragraph

<!-- kmark color:#c00 font_size:14pt font_weight:bold -->
重要本文

通常本文。直前styleが漏れないこと。

## heading visual

<!-- kmark w:40mm h:12mm color:#c00 font_size:12pt font_weight:bold font_family:"Yu Gothic" font_style:normal letter_spacing:0.08em line_height:1.2 border_size:2px border_color:red border_style:solid radius:4px bg:#fff0f0 opacity:0.8 rotate:-10 shadow:true padding:2mm 4mm margin:2mm align:right -->
# 社外秘

次の本文。右寄せが漏れないこと。

## list

<!-- kmark color:#064 font_weight:700 bg:#f0fff8 border_size:1px border_color:#8ac padding:2mm -->
- 承認済
- 回覧済

## blockquote

<!-- kmark color:#805 bg:#fff0f8 border_size:2px border_color:#c7a radius:4px padding:2mm -->
> 関係者外秘
> 共有範囲を確認する。

## table

<!-- kmark color:#036 font_size:11pt border_size:1px border_color:#8ab bg:#f3fbff padding:1mm -->
| 区分 | 状態 |
| --- | --- |
| CONFIDENTIAL | active |
| DRAFT | pending |

## code

<!-- kmark color:#eee bg:#222 padding:2mm radius:4px -->
```text
CONFIDENTIAL=true
DRAFT=false
```

## scope

<!-- kmark { color:#900 border_size:1px border_color:#c88 radius:3px padding:1mm -->
scope内本文。

## scope内見出し

<!-- kmark } -->

## align leak guard

<!-- kmark align:right color:red -->
# 右寄せ見出し

# 通常見出し

## background alias

<!-- kmark background:#fff0f0 border_color:#c00 border_size:2px radius:3px -->
CONFIDENTIAL

<!-- kmark bg:#eef background:#fee border_size:1px border_color:#99f -->
bg/background優先確認

## shadow variants

<!-- kmark shadow:sm border_size:1px border_color:#999 padding:2mm -->
DRAFT

<!-- kmark shadow:0 2px 8px #0003 border_size:1px border_color:#999 padding:2mm -->
APPROVED

## blank line guard

<!-- kmark color:red -->

この本文は赤くならないこと。

## legacy ignored

<!-- kmark text:社外秘 -->
text keyは表示文字を生成しないこと。

<!-- kmark stamp:社外秘 -->
stamp keyは表示文字を生成しないこと。
