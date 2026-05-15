# kmark Parameter Reference

## 結論

- Schema version: `11`
- Parameter総数: `96`
- renderer未知key: 無視
- renderer不正値: 無視
- editor validation: unknown duplicate missing enum undefined-use unclosed-scope を警告

## Context

| Context | 意味 |
| --- | --- |
| `single` | 直後1blockへ適用 |
| `scope` | `<!-- kmark { ... -->` から `<!-- kmark } -->` まで適用 |
| `text` | paragraph/heading/list/blockquote/code/table/callout/toc等の文字装飾 |
| `image` | Markdown画像 |
| `table` | Markdown表 |
| `page` | 用紙preview/print page config |
| `toc` | 自動目次 |
| `shape` | schema分類のみ 現行rendererに独立shape構文なし |

## Value Grammar

### boolean

| 有効 | 無効 |
| --- | --- |
| `true` `false` | `yes` `1` `on` |

### length

| 対象 | 有効単位 | 補足 |
| --- | --- | --- |
| 一般length | `px` `%` `em` `rem` `vw` `vh` `vmin` `vmax` `mm` `cm` `in` `pt` `pc` | unitless digit は `px` 化 |
| page length | `px` `mm` `cm` `in` `pt` `pc` | nonnegativeのみ `%`不可 |
| margin | 一般length + `auto` | 1-4値 |
| padding | 一般length | 1-4値 `auto`不可 |
| table padding | 一般length | 1値または2値のみ |

### special size

| 値 | 意味 |
| --- | --- |
| `fit` | 内容寸法に合わせる |
| `page_fit` | 用紙本文領域の残幅/残高へ合わせる |
| `page_fit_contain` | 縦横比維持で用紙本文領域内へ収める |
| `auto` | `w`/`h` のみ許容 |

### color

| 有効 | 例 |
| --- | --- |
| hex 3/4/6/8桁 | `#c00` `#cc0000` `#0003` |
| ASCII alphabetic keyword | `red` `transparent` `currentColor` |

- `rgb()` `rgba()` `hsl()` `var()` `url()` は無効
- keywordは小文字化される

### string

| 用途 | 規則 |
| --- | --- |
| `font_family` | 空白含む場合 quote推奨 `"`または`'` |
| `toc_title` | 空文字可 制御文字不可 |
| `page_number_format` | 空文字不可 |
| `shadow` | presetまたは安全なbox-shadow値 |

## All Parameters Quick Index

| Parameter | Alias | Type | Context | 値候補 |
| --- | --- | --- | --- | --- |
| `align` |  | enum | single scope text image | `left` `center` `right` |
| `valign` |  | enum | single scope text image | `top` `center` `bottom` `stretch` |
| `page_valign` |  | enum | single scope text image | `top` `center` `bottom` |
| `toc` |  | boolean | single toc |  |
| `toc_depth` |  | number | single toc | `1`-`6` |
| `toc_min_depth` |  | number | single toc | `1`-`6` |
| `toc_title` |  | string | single toc |  |
| `toc_ordered` |  | boolean | single toc |  |
| `toc_links` |  | boolean | single toc |  |
| `w` | `width` | length | single scope text image shape table | special size可 |
| `h` | `height` | length | single scope text image shape | special size可 |
| `pos` |  | enum | single image | `center` `top` `bottom` `left` `right` `top_left` `top_right` `bottom_left` `bottom_right` |
| `border_size` |  | length | single image scope shape |  |
| `border_color` |  | color | single image scope shape |  |
| `border_style` |  | enum | single image scope shape | `solid` `dashed` `dotted` `double` `none` |
| `radius` |  | length | single image scope shape |  |
| `bg` | `background` | color | single image scope shape |  |
| `background` | `bg` | color | single image scope shape |  |
| `opacity` |  | number | single image scope shape | `0`-`1` |
| `rotate` |  | number | single image scope shape | number/`deg`/`rad`/`turn` |
| `shadow` |  | string | single image scope shape | `true` `md` `sm` `lg` `false` `none` box-shadow |
| `margin` |  | length | single image scope shape table | 1-4値 |
| `padding` |  | length | single image scope shape | 1-4値 |
| `color` |  | color | single text scope |  |
| `font_weight` |  | string | single text scope | `normal` `bold` `bolder` `lighter` `100`-`900` |
| `font_family` |  | string | single text scope |  |
| `font_style` |  | enum | single text scope | `normal` `italic` `oblique` |
| `letter_spacing` |  | length | single text scope |  |
| `line_height` |  | string | single text scope table | `normal` number length |
| `block_gap` | `block_margin` `paragraph_gap` | length | single text scope table | block下余白 |
| `table_cell_padding` |  | length | single scope table | 1-2値 |
| `table_cell_padding_x` |  | length | single scope table |  |
| `table_cell_padding_y` |  | length | single scope table |  |
| `table_fit` |  | enum | single scope table | `auto` `off` `shrink` |
| `table_layout` |  | enum | single scope table | `auto` `fixed` |
| `layout` |  | enum | scope | `row` `column` |
| `gap` |  | length | scope |  |
| `wrap` |  | boolean | scope |  |
| `page_size` |  | enum | page scope | `A3` `A4` `A5` `B4` `B5` `Letter` `Legal` `custom` |
| `orientation` | `page_orientation` | enum | page scope | `portrait` `landscape` |
| `page_width` |  | length | page scope | physical length |
| `page_height` |  | length | page scope | physical length |
| `font_size` |  | length | single text scope table | text装飾 |
| `page_font_size` |  | length | page scope | page基準font |
| `page_font_family` |  | string | page scope | page本文font |
| `page_heading_font_family` |  | string | page scope | page見出しfont |
| `page_margin` |  | length | page scope | 4辺一括 |
| `page_margin_top` |  | length | page scope |  |
| `page_margin_right` |  | length | page scope |  |
| `page_margin_bottom` |  | length | page scope |  |
| `page_margin_left` |  | length | page scope |  |
| `page_header` |  | boolean | page scope |  |
| `page_header_left` |  | string | page scope |  |
| `page_header_center` |  | string | page scope |  |
| `page_header_right` |  | string | page scope |  |
| `page_header_opacity` |  | number | page scope | `0`-`1` |
| `page_header_offset` |  | length | page scope | physical length |
| `page_header_border_size` |  | length | page scope |  |
| `page_header_border_color` |  | color | page scope |  |
| `page_header_border_style` |  | enum | page scope | `solid` `dashed` `dotted` `double` `none` |
| `page_header_font_size` |  | length | page scope |  |
| `page_header_font_family` |  | string | page scope |  |
| `page_header_font_color` |  | color | page scope |  |
| `page_header_padding` |  | length | page scope | 1-4値 |
| `page_footer` |  | boolean | page scope |  |
| `page_footer_left` |  | string | page scope |  |
| `page_footer_center` |  | string | page scope |  |
| `page_footer_right` |  | string | page scope |  |
| `page_footer_opacity` |  | number | page scope | `0`-`1` |
| `page_footer_offset` |  | length | page scope | physical length |
| `page_footer_border_size` |  | length | page scope |  |
| `page_footer_border_color` |  | color | page scope |  |
| `page_footer_border_style` |  | enum | page scope | `solid` `dashed` `dotted` `double` `none` |
| `page_footer_font_size` |  | length | page scope |  |
| `page_footer_font_family` |  | string | page scope |  |
| `page_footer_font_color` |  | color | page scope |  |
| `page_footer_padding` |  | length | page scope | 1-4値 |
| `page_number` |  | enum | page scope | `show` `hide` `none` `top-left` `top-center` `top-right` `bottom-left` `bottom-center` `bottom-right` |
| `page_number_format` |  | string | page scope | placeholders |
| `page_number_start` |  | number | page scope | positive integer |
| `page_number_reset` |  | boolean | page scope |  |
| `page_number_count` |  | boolean | page scope |  |
| `page_number_visible` |  | boolean | page scope |  |
| `page_number_style` |  | enum | page scope | `decimal` `lower-roman` `upper-roman` `lower-alpha` `upper-alpha` |
| `page_number_font_size` |  | length | page scope | physical length |
| `page_number_color` |  | color | page scope |  |
| `page_number_margin_top` |  | length | page scope | physical length |
| `page_number_margin_bottom` |  | length | page scope | physical length |
| `page_number_margin_left` |  | length | page scope | physical length |
| `page_number_margin_right` |  | length | page scope | physical length |
| `define` |  | identifier | single scope page | style名 |
| `use` |  | identifier | single scope page | style名 |

## Layout Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `align` | 横方向位置 | `left` `center` `right` | `align:center` | layoutなしでは text-align/auto margin layoutありでは主軸/交差軸align |
| `valign` | scope内縦方向位置 | `top` `center` `bottom` `stretch` | `valign:top` | `layout:row` では cross axis `layout:column` では main axis |
| `page_valign` | 用紙本文領域内でblockを上/中央/下へ寄せる | `top` `center` `bottom` | `page_valign:bottom` | 用紙preview/A4 pagination向け |
| `layout` | scope内要素並び | `row` `column` | `layout:row` | scope専用 |
| `gap` | scope内間隔 | length | `gap:8mm` | `layout` 未指定でも scope wrapper発生 |
| `wrap` | 横並び折返し | boolean | `wrap:true` | 主に `layout:row` |

### Align Mapping

| 条件 | `align` | `valign` |
| --- | --- | --- |
| no layout | `text-align` + 必要時 auto margin | なし |
| `layout:row` | `justify-content` | `align-items` |
| `layout:column` | `align-items` | `justify-content` |

## Size/Image/Box Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `w` | 幅 | length/special | `w:80mm` `w:fit` | alias `width` |
| `h` | 高さ | length/special | `h:45mm` `h:page_fit` | alias `height` |
| `pos` | 画像のobject位置 | enum | `pos:top_left` | `_` はspaceへ変換 |
| `border_size` | 枠線太さ | length | `border_size:2px` | 指定時 `border_style` 省略なら `solid` |
| `border_color` | 枠線色 | color | `border_color:#c00` | CSS関数不可 |
| `border_style` | 枠線種類 | enum | `border_style:dashed` |  |
| `radius` | 角丸 | length | `radius:4px` |  |
| `bg` | 背景色 | color | `bg:#fff0f0` | alias `background` |
| `background` | 背景色 | color | `background:#eef` | `bg` と同義 後勝ち |
| `opacity` | 透明度 | `0`-`1` | `opacity:0.8` | 範囲外無視 |
| `rotate` | 回転 | number/angle | `rotate:-10` `rotate:0.02turn` | numberはdeg扱い |
| `shadow` | 影 | preset/box-shadow | `shadow:sm` | 詳細下表 |
| `margin` | 外側余白 | 1-4 length | `margin:2mm` | `page_fit` 使用時は `margin:0` 優先 |
| `padding` | 内側余白 | 1-4 length | `padding:2mm 4mm` | `auto`不可 |

### Shadow

| 値 | 出力 |
| --- | --- |
| `true` `md` | `0 2px 8px #0003` |
| `sm` | `0 1px 3px #0002` |
| `lg` | `0 4px 16px #0004` |
| `false` `none` | `none` |
| custom | 2-6 parts box-shadow `0 2px 8px #0003` |

### Special Size

| 値 | image挙動 | text/block挙動 |
| --- | --- | --- |
| `fit` | `fit-content` | `fit-content` |
| `page_fit` | page本文領域へ拡張 `display:block` `margin:0` | page本文領域へ拡張 |
| `page_fit_contain` | max幅/高 + `object-fit:contain` | max幅/高 |

## Text Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `color` | 文字色 | color | `color:#c00` |  |
| `font_size` | 対象block文字size | length | `font_size:12pt` | page全体ではなくblock装飾 |
| `font_weight` | 太さ | keyword/100-900 | `font_weight:700` |  |
| `font_family` | font family | string | `font_family:"Yu Gothic"` | 空白時quote |
| `font_style` | style | `normal` `italic` `oblique` | `font_style:italic` |  |
| `letter_spacing` | 字間 | length | `letter_spacing:0.08em` |  |
| `line_height` | 行高 | `normal` number length | `line_height:1.2` | tableにも有効 |
| `block_gap` | Markdown block間下余白 | length | `block_gap:8px` | alias `block_margin` `paragraph_gap` scope可 |

## Table Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `table_cell_padding` | cell余白一括 | 1値/2値 | `table_cell_padding:0.3mm 1mm` | 1値=上下左右 2値=上下/左右 |
| `table_cell_padding_x` | cell左右余白 | length | `table_cell_padding_x:1mm` |  |
| `table_cell_padding_y` | cell上下余白 | length | `table_cell_padding_y:0.3mm` |  |
| `table_fit` | 幅超過時調整 | `auto` `off` `shrink` | `table_fit:shrink` | frontendで実測調整 |
| `table_layout` | 列幅計算 | `auto` `fixed` | `table_layout:fixed` | CSS `table-layout` |

### table_fit

| 値 | 動作 |
| --- | --- |
| `auto` | overflow時 padding縮小 -> font縮小 |
| `shrink` | 最小paddingから開始 -> font縮小 |
| `off` | 自動調整なし |

## Page Parameters

### Page Defaults

| 項目 | Default |
| --- | --- |
| size | `A4 portrait` |
| width/height | `210mm` / `297mm` |
| margin | top `16mm` right `16mm` bottom `18mm` left `16mm` |
| page font size | `10.5pt` |
| page font family | `BIZ UDPGothic` |
| heading font family | inherit |

### Page Size

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `page_size` | 用紙preset | `A3` `A4` `A5` `B4` `B5` `Letter` `Legal` `custom` | `page_size:A4` | 大小文字無視 |
| `orientation` | 向き | `portrait` `landscape` | `orientation:landscape` | alias `page_orientation` |
| `page_width` | custom幅 | physical length | `page_width:210mm` | `page_height` と両方必要 |
| `page_height` | custom高 | physical length | `page_height:297mm` | `page_width` と両方必要 |

### Preset寸法

| page_size | portrait |
| --- | --- |
| `A3` | `297mm x 420mm` |
| `A4` | `210mm x 297mm` |
| `A5` | `148mm x 210mm` |
| `B4` | `250mm x 353mm` |
| `B5` | `176mm x 250mm` |
| `Letter` | `8.5in x 11in` |
| `Legal` | `8.5in x 14in` |
| `custom` | default A4 unless `page_width` + `page_height` |

### Page Font/Margin

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `page_font_size` | 用紙全体基準font size | physical length | `page_font_size:11pt` | `font_size` とは別 |
| `page_font_family` | 本文font | string | `page_font_family:"Yu Gothic"` |  |
| `page_heading_font_family` | 見出しfont | string | `page_heading_font_family:"Noto Serif JP"` | 空なら本文font継承 |
| `page_margin` | 4辺余白 | physical length | `page_margin:12mm` | 個別指定が後で上書き |
| `page_margin_top` | 上余白 | physical length | `page_margin_top:10mm` |  |
| `page_margin_right` | 右余白 | physical length | `page_margin_right:10mm` |  |
| `page_margin_bottom` | 下余白 | physical length | `page_margin_bottom:12mm` |  |
| `page_margin_left` | 左余白 | physical length | `page_margin_left:10mm` |  |

### Page Header/Footer

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `page_header` | header表示ON/OFF | boolean | `page_header:false` | falseでslot消去 |
| `page_header_left` | header左 | string | `page_header_left:"左"` | 指定時header有効 |
| `page_header_center` | header中央 | string | `page_header_center:"社外秘"` | 指定時header有効 |
| `page_header_right` | header右 | string | `page_header_right:"右"` | 指定時header有効 |
| `page_header_opacity` | header透明度 | number | `page_header_opacity:0.6` | `0`-`1` |
| `page_header_offset` | page上端から距離 | physical length | `page_header_offset:6mm` |  |
| `page_header_border_size` | header枠線太さ | length | `page_header_border_size:1px` | style省略時solid |
| `page_header_border_color` | header枠線色 | color | `page_header_border_color:#999` |  |
| `page_header_border_style` | header枠線種類 | enum | `page_header_border_style:dashed` | `solid` `dashed` `dotted` `double` `none` |
| `page_header_font_size` | header文字size | length | `page_header_font_size:9pt` |  |
| `page_header_font_family` | header font | string | `page_header_font_family:"Yu Gothic"` |  |
| `page_header_font_color` | header文字色 | color | `page_header_font_color:#333` |  |
| `page_header_padding` | header文字枠内側余白 | 1-4 length | `page_header_padding:0.2em 0.6em` | 未指定時 border指定ならdefault padding |
| `page_footer` | footer表示ON/OFF | boolean | `page_footer:false` | falseでslot消去 |
| `page_footer_left` | footer左 | string | `page_footer_left:"左"` | 指定時footer有効 |
| `page_footer_center` | footer中央 | string | `page_footer_center:"中央"` | 指定時footer有効 |
| `page_footer_right` | footer右 | string | `page_footer_right:"関係者外秘"` | 指定時footer有効 |
| `page_footer_opacity` | footer透明度 | number | `page_footer_opacity:0.6` | `0`-`1` |
| `page_footer_offset` | page下端から距離 | physical length | `page_footer_offset:6mm` |  |
| `page_footer_border_size` | footer枠線太さ | length | `page_footer_border_size:1px` | style省略時solid |
| `page_footer_border_color` | footer枠線色 | color | `page_footer_border_color:#999` |  |
| `page_footer_border_style` | footer枠線種類 | enum | `page_footer_border_style:dashed` | `solid` `dashed` `dotted` `double` `none` |
| `page_footer_font_size` | footer文字size | length | `page_footer_font_size:9pt` |  |
| `page_footer_font_family` | footer font | string | `page_footer_font_family:"Yu Gothic"` |  |
| `page_footer_font_color` | footer文字色 | color | `page_footer_font_color:#333` |  |
| `page_footer_padding` | footer文字枠内側余白 | 1-4 length | `page_footer_padding:0.2em 0.6em` | 未指定時 border指定ならdefault padding |

## Page Number Parameters

### Page Number Defaults

| 項目 | Default |
| --- | --- |
| position | `none` |
| format | `{page}` |
| start | `1` |
| reset | `false` |
| count | `true` |
| visible | `true` |
| style | `decimal` |
| font_size | `10pt` |
| color | `#666` |
| margin_top/bottom | `8mm` |
| margin_left/right | `12mm` |

### Page Number Control

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `page_number` | 表示位置/表示ON/OFF | enum | `page_number:bottom-center` | `show` は位置未指定なら bottom-center |
| `page_number_format` | 表示format | string | `page_number_format:"{page} / {total}"` | 空文字無効 |
| `page_number_start` | 開始番号 | positive integer | `page_number_start:3` | 0無効 |
| `page_number_reset` | 番号group reset | boolean | `page_number_reset:true` | scope開始segmentのみ有効 |
| `page_number_count` | 番号count対象 | boolean | `page_number_count:false` | falseなら表示番号は進まない |
| `page_number_visible` | 表示のみON/OFF | boolean | `page_number_visible:false` | position等は維持 |
| `page_number_style` | 数字style | enum | `page_number_style:lower-roman` | page/total両方へ適用 |
| `page_number_font_size` | page番号font size | physical length | `page_number_font_size:9pt` | `page_font_size` とは別 |
| `page_number_color` | page番号色 | color | `page_number_color:#666` | quote可 |
| `page_number_margin_top` | 上配置距離 | physical length | `page_number_margin_top:8mm` | top系positionで使用 |
| `page_number_margin_bottom` | 下配置距離 | physical length | `page_number_margin_bottom:8mm` | bottom系positionで使用 |
| `page_number_margin_left` | 左配置距離 | physical length | `page_number_margin_left:12mm` | left系positionで使用 |
| `page_number_margin_right` | 右配置距離 | physical length | `page_number_margin_right:12mm` | right系positionで使用 |

### Page Number Format Placeholders

| Placeholder | 意味 |
| --- | --- |
| `{page}` | 現在group内page番号 style適用 |
| `{total}` | 現在group内count対象page総数 style適用 |
| `{abs_page}` | 文書内絶対page番号 decimal |
| `{abs_total}` | 文書内絶対総page数 decimal |

### Page Number Position

| 値 | 表示 |
| --- | --- |
| `none` | 非表示 position none |
| `show` | 表示ON position未設定なら `bottom-center` |
| `hide` | 表示OFF position維持 |
| `top-left` | 上左 |
| `top-center` | 上中央 |
| `top-right` | 上右 |
| `bottom-left` | 下左 |
| `bottom-center` | 下中央 |
| `bottom-right` | 下右 |

## TOC Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `toc` | 目次生成 | boolean | `toc:true` | `true` のみ生成 |
| `toc_depth` | 最大heading depth | `1`-`6` | `toc_depth:3` | default `6` |
| `toc_min_depth` | 最小heading depth | `1`-`6` | `toc_min_depth:2` | default `1` |
| `toc_title` | 目次title | string | `toc_title:"Contents"` | `""` で非表示 |
| `toc_ordered` | ordered list | boolean | `toc_ordered:true` | default false |
| `toc_links` | heading link | boolean | `toc_links:false` | default true |

### TOC挙動

- 対象: TOC directive より後の heading
- page break跨ぎ: 対象
- explicit heading id: `{#manual}` を優先
- generated heading id: link有効時に自動生成
- heading_number有効時: 目次labelへ同一番号を表示
- 用紙preview: heading実pageから page番号列を補完

## Preset Parameters

| Parameter | 使用者視点 | 値 | 例 | 注意 |
| --- | --- | --- | --- | --- |
| `define` | parameter set保存 | identifier | `define:thumb` | 前行からの連続parameterも保存対象 |
| `use` | 保存set適用 | identifier | `use:thumb` | 未定義なら無視 |

### 優先順位

| 低 -> 高 | Layer |
| --- | --- |
| 1 | 外側scopeのpreset |
| 2 | 内側scope/単発のpreset |
| 3 | 外側scopeの直接指定 |
| 4 | 内側scope/単発の直接指定 |

### Preset例

```markdown
<!-- kmark define:photo w:60mm radius:2mm shadow:sm -->

<!-- kmark { use:photo layout:row gap:6mm -->
![A](a.png)
![B](b.png)
<!-- kmark } -->
```

## Page Scope例

```markdown
<!-- kmark { page_size:A4 orientation:landscape page_margin:12mm page_font_size:9pt page_number:bottom-right page_number_format:"{page}/{total}" -->
# 横向き資料
<!-- kmark } -->
```

## Table Compact例

```markdown
<!-- kmark table_cell_padding_x:1mm table_cell_padding_y:0.3mm line_height:1.05 block_gap:4px font_size:8.5pt table_fit:shrink table_layout:fixed -->
| No | Name | Note |
| ---: | --- | --- |
| 1 | COM | common |
```

## Image Fit例

```markdown
<!-- kmark w:page_fit_contain h:page_fit_contain align:center -->
![大きい画像](large.png)
```

## Invalid例

| 入力 | 結果 |
| --- | --- |
| `w:abc` | 無視 |
| `border_color:url(javascript:alert(1))` | 無視 |
| `opacity:2` | 無視 |
| `font_weight:950` | 無視 |
| `page_number_start:0` | 無視 |
| `table_cell_padding:1mm 2mm 3mm` | 無視 |
| `text:社外秘` | legacy unknown 扱い 表示生成なし |
| `stamp:社外秘` | legacy unknown 扱い 表示生成なし |
