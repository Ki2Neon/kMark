# kmark text decoration test

通常本文の前後に自己完結型の装飾文字列を挿入する確認。

<!-- kmark text:社外秘 -->

続き本文。直前textのstyleが本文へ漏れないこと。

## literal values

<!-- kmark text:CONFIDENTIAL -->

<!-- kmark text:DRAFT -->

<!-- kmark text:APPROVED -->

<!-- kmark text:回覧 -->

<!-- kmark text:external_secret -->

## decorated

<!-- kmark text:社外秘 w:40mm h:12mm color:#c00 font_size:12pt font_weight:bold font_family:"Yu Gothic" font_style:normal letter_spacing:0.08em line_height:1.2 border_size:2px border_color:red border_style:solid radius:4px bg:#fff0f0 opacity:0.8 rotate:-10 shadow:true padding:2mm 4mm margin:2mm align:right -->

次の本文。右寄せが漏れないこと。

## text params

<!-- kmark text:重要 color:red font_size:14pt font_weight:700 -->

<!-- kmark text:DRAFT font_style:italic letter_spacing:0.12em -->

<!-- kmark text:承認済 font_family:"Yu Gothic" line_height:1.4 -->

## align leak guard

<!-- kmark text:社外秘 align:right -->

# 見出し

見出しが右寄せされないこと。

## background alias

<!-- kmark text:CONFIDENTIAL background:#fff0f0 border_color:#c00 border_size:2px radius:3px -->

<!-- kmark text:bg優先確認 bg:#eef background:#fee border_size:1px border_color:#99f -->

## shadow variants

<!-- kmark text:DRAFT shadow:sm -->

<!-- kmark text:APPROVED shadow:0 2px 8px #0003 -->

## html escape

<!-- kmark text:<script>alert(1)</script> -->

## empty text

<!-- kmark text: -->

空textは何も出力されないこと。
