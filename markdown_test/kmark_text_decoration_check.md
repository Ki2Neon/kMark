<!-- kmark page_number:bottom-center page_number_font_size:10mm page_number_format:"-{page}/{total}-" -->

# kmark 文字装飾確認

このfileは `<!-- kmark ... -->` の裸paramが直下Markdown blockへ適用されることを目視確認するためのtest。

## 1 paragraph

<!-- kmark color:#c00000 font_size:14pt font_weight:bold bg:#fff3f3 border_size:2px border_color:#c00000 radius:4px padding:2mm -->
社外秘 paragraph

このparagraphは通常表示。直前styleが漏れないこと。

## 1.1 text width fit

<!-- kmark color:#7a0000 bg:#fff0f0 border_size:2px border_color:#cc0000 radius:4px padding:2mm -->
短い文字幅にだけ背景と枠線が付くこと。

<!-- kmark color:#004b7a bg:#eef8ff border_size:2px border_color:#2f8fbd radius:4px padding:2mm align:right -->
右寄せでも文字幅にだけ背景と枠線が付くこと。

<!-- kmark color:#5b3d00 bg:#fff8d8 border_size:2px border_color:#c9a227 radius:4px padding:2mm align:center -->
中央寄せでも文字幅にだけ背景と枠線が付くこと。

<!-- kmark w:45mm color:#333 bg:#f4f4f4 border_size:1px border_color:#999 padding:2mm align:center -->
w指定時は明示幅を優先すること。

## 2 heading

<!-- kmark color:#0b3d91 font_size:18pt font_weight:900 letter_spacing:0.08em bg:#eef5ff border_size:2px border_color:#0b3d91 radius:4px padding:2mm align:center -->
# CONFIDENTIAL heading

## 3 list

<!-- kmark color:#064420 font_weight:700 bg:#f0fff6 border_size:1px border_color:#56a777 padding:2mm margin:2mm -->
- 承認済
- 回覧済
- 関係者確認済

## 4 blockquote

<!-- kmark color:#7a1f5c bg:#fff0fa border_size:2px border_color:#cc7db1 radius:4px padding:2mm -->
> 関係者外秘
> この引用block全体に文字装飾と枠線が付くこと。

## 5 table

<!-- kmark color:#17324d font_size:11pt bg:#f3f8ff border_size:1px border_color:#8bb3d9 padding:1mm -->
| 区分 | 状態 |
| --- | --- |
| DRAFT | 作成中 |
| APPROVED | 承認済 |

## 6 code

<!-- kmark color:#eeeeee bg:#222222 padding:2mm radius:4px border_size:1px border_color:#666666 -->
```text
CONFIDENTIAL=true
DRAFT=false
APPROVED=true
```

## 7 rotate shadow opacity

<!-- kmark color:#8a3b00 bg:#fff7ec border_size:2px border_color:#d88428 radius:6px padding:2mm margin:3mm rotate:-3 shadow:0 2px 8px #0003 opacity:0.9 -->
少し回転した注意文。

## 8 scope

<!-- kmark { color:#900 border_size:1px border_color:#d99 radius:3px bg:#fff8f8 padding:1mm -->
scope内 paragraph

## scope内 heading

- scope内 list item A
- scope内 list item B

<!-- kmark } -->

scope外 paragraph。scope styleが漏れないこと。

## 9 blank line guard

<!-- kmark color:red font_weight:bold -->

このparagraphは赤くならないこと。

## 10 image regression

<!-- kmark w:40mm h:25mm border_size:2px border_color:#666 radius:4px shadow:sm -->
![image](image.png)

画像拡張paramは既存通り画像へ適用されること。

## 11 legacy ignored

<!-- kmark text:社外秘 -->
legacy text keyは表示文字を生成しないこと。

<!-- kmark stamp:社外秘 -->
legacy stamp keyは表示文字を生成しないこと。
