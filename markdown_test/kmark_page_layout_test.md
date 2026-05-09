<!-- kmark { page_size:A4 page_orientation:portrait page_margin:12mm font_size:11pt -->

# kmark page scope test

このファイルは page設定を `{}` scope 構文だけで確認するための手動検証用Markdown。

期待:

- A4 portrait
- margin 12mm
- font_size 11pt
- scope未closeのためEOFまで外側scope有効

<!-- --- -->

# 2ページ目

ここもA4縦、11pt。

<!-- kmark { page_orientation:landscape font_size:9pt align:center -->

# 横ページ範囲開始

ここからA4横、9pt、中央寄せ。

<!-- --- -->

# 横ページ2

このページもA4横、9pt、中央寄せ。

<!-- kmark } -->

# 通常ページに戻る

scope終了により外側scopeへ戻る。
A4縦、11pt。

<!-- kmark { page_size:A5 page_orientation:portrait page_margin:8mm font_size:10pt -->

# A5縦ページ

A5縦、10pt、余白8mm。

<!-- kmark } -->

# A4へ復帰

外側scopeへ戻り、A4縦、11pt。

<!-- kmark { page_size:A5 page_orientation:landscape page_margin:8mm font_size:9pt -->

# A5横ページ

A5横、9pt、余白8mm。

| item | width | height | margin | font |
| :--- | ---: | ---: | ---: | ---: |
| A5 landscape | 210mm | 148mm | 8mm | 9pt |
| block | table | check | render | ok |

<!-- kmark } -->

# 個別余白

次scopeで個別余白を確認。

<!-- kmark { page_width:100mm page_height:148mm page_margin_top:6mm page_margin_right:7mm page_margin_bottom:8mm page_margin_left:9mm font_size:8pt -->

# custom page

期待:

- width 100mm
- height 148mm
- margin top 6mm
- margin right 7mm
- margin bottom 8mm
- margin left 9mm
- font_size 8pt

<!-- kmark } -->

# 最終ページ

外側scopeが未closeのままEOFに到達する。
EOFで自動closeされ、空pageは生成しない。
