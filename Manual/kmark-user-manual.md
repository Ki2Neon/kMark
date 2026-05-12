# kmark User Manual

## 結論

- kmark: Markdown内HTML commentでpreview/print表現を制御する拡張記法
- 主用途: 文字装飾 画像寸法 表配置 用紙設定 page番号 目次 callout
- 書式: `<!-- kmark key:value key:value -->`
- 用紙系parameter: `用紙` preview / print で最大効果

## 基本Syntax

### 単発指定

- 目的: 直後1blockだけ装飾
- 有効対象: paragraph heading list blockquote code table image callout toc
- 条件: kmark comment と対象block 間に空行なし

```markdown
<!-- kmark color:#c00 font_size:14pt font_weight:bold -->
重要本文
```

```markdown
<!-- kmark w:80mm align:center -->
![基板写真](board.png)
```

### 連続指定

- 目的: 長い指定を複数行へ分割
- 規則: 連続する kmark comment は merge
- 競合: 後勝ち

```markdown
<!-- kmark w:60mm -->
<!-- kmark h:40mm -->
<!-- kmark w:80mm -->
![写真](image.png)
```

- 結果: `w:80mm h:40mm`

### 空行Guard

- 空行あり: 単発指定は無効

```markdown
<!-- kmark color:red -->

この本文は赤くならない
```

### Scope指定

- 目的: 複数blockへ同じ指定を適用
- 開始: `<!-- kmark { ... -->`
- 終了: `<!-- kmark } -->`
- EOF: 未close scope は自動close
- nested scope: 外側設定を継承 内側が上書き

```markdown
<!-- kmark { color:#900 border_size:1px border_color:#c88 padding:2mm -->
本文A

# 見出しB
<!-- kmark } -->
```

### Scope注意

- 現行renderer: 開始comment内の末尾 `}` は scope close として扱わない
- close: 必ず別行 `<!-- kmark } -->`

```markdown
<!-- kmark { layout:row gap:8mm -->
![A](a.png)
![B](b.png)
<!-- kmark } -->
```

### Page Break

- 手動page区切り: first column の `<!-- --- -->`
- trailing space: 許容
- fenced code内: page break扱いなし

```markdown
# 1ページ目
<!-- --- -->
# 2ページ目
```

## 値の書き方

| 種別 | 書式 | 例 | 注意 |
| --- | --- | --- | --- |
| boolean | `true` `false` | `wrap:true` | 小文字のみ |
| enum | 固定候補 | `align:center` | 候補外は無視 |
| length | 数値+単位 | `12pt` `10mm` `50%` | 一般lengthは単位なし数値=px |
| page length | 物理長 | `210mm` `8.5in` | `%` `em` 不可 |
| color | hex/color keyword | `#c00` `red` | `rgb()` `var()` 不可 |
| string | 必要時quote | `font_family:"Yu Gothic"` | 空白含む値は quote 推奨 |
| identifier | ASCII名 | `define:thumb` | `A-Z a-z 0-9 _ -` |

## よく使うWorkflow

### 文字を強調

```markdown
<!-- kmark color:#c00000 font_size:14pt font_weight:bold -->
社外秘
```

### 文字枠を作る

```markdown
<!-- kmark bg:#fff0f0 border_size:2px border_color:#c00 radius:4px padding:2mm -->
CONFIDENTIAL
```

### 画像サイズを指定

```markdown
<!-- kmark w:80mm h:45mm radius:3mm shadow:sm -->
![装置写真](device.png)
```

### 用紙全体を設定

```markdown
<!-- kmark { page_size:A4 orientation:portrait page_margin:16mm page_font_size:10.5pt -->
# 表紙
<!-- kmark } -->
```

### 横向きページだけ作る

```markdown
通常ページ

<!-- kmark { page_size:A4 orientation:landscape page_margin:12mm -->
# 横向き表

| 項目 | 値 |
| --- | --- |
| A | 1 |
<!-- kmark } -->

通常ページへ戻る
```

### Page番号を出す

```markdown
<!-- kmark { page_number:bottom-center page_number_format:"{page} / {total}" -->
# 本文
<!-- kmark } -->
```

### 章ごとにPage番号をreset

```markdown
<!-- kmark { page_number:bottom-center page_number_reset:true page_number_start:1 -->
# 第1章
<!-- kmark } -->

<!-- --- -->

<!-- kmark { page_number:bottom-center page_number_reset:true page_number_start:1 -->
# 第2章
<!-- kmark } -->
```

### 目次を作る

```markdown
<!-- kmark toc:true toc_title:"目次" toc_min_depth:1 toc_depth:3 -->

# 1章
## 1.1
### 1.1.1
```

- 目次対象: directive位置より後の見出し
- link有効時: heading id 未指定なら `kmark-heading-*` を生成
- 用紙preview: 目次page番号列を補完

### 表を詰める

```markdown
<!-- kmark table_cell_padding_x:1mm table_cell_padding_y:0.3mm line_height:1.05 font_size:8.5pt table_fit:shrink table_layout:fixed -->
| Pin | Name | Note |
| ---: | --- | --- |
| 1 | COM | relay common |
```

### 横並び画像を作る

```markdown
<!-- kmark { layout:row gap:8mm align:center valign:top wrap:true w:45mm -->
![A](a.png)
![B](b.png)
![C](c.png)
<!-- kmark } -->
```

### Styleを定義して再利用

```markdown
<!-- kmark define:thumb w:45mm h:30mm radius:2mm shadow:sm -->

<!-- kmark use:thumb -->
![写真A](a.png)

<!-- kmark use:thumb h:40mm -->
![写真B](b.png)
```

- `define`: 現在parameter setを保存
- `use`: 保存済みparameter setを適用
- `use` + 直接指定: 直接指定が勝つ

### Callout

```markdown
> [!NOTE]
> 補足情報

> [!WARNING] 電源投入前の注意
> 配線を確認する
```

| Type | default title |
| --- | --- |
| `NOTE` | `Note` |
| `TIP` | `Tip` |
| `IMPORTANT` | `Important` |
| `WARNING` | `Warning` |
| `CAUTION` | `Caution` |

```markdown
<!-- kmark w:80% align:center page_valign:bottom -->
> [!IMPORTANT] 重要
> この内容は重要
```

## 表示Mode差

| Mode | kmark効果 |
| --- | --- |
| 通常preview | HTML装飾 画像 表 文字 目次 callout |
| 用紙preview | 通常効果 + page size margin page番号 A4 pagination |
| print | 用紙preview由来のpage frame/page番号を反映 |

## Editor補助

- 補完: `<!-- kmark ` 入力後 parameter/value候補表示
- font補完: `font_family` `page_font_family` `page_heading_font_family` でlocal font候補
- validation警告:
  - unknown parameter
  - duplicate parameter
  - missing value
  - enum候補外
  - undefined `use`
  - scope close不足

## Troubleshooting

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 指定が効かない | commentと対象block間に空行 | 空行削除 |
| page番号が出ない | 通常preview | 用紙preview/print確認 |
| scopeが終わらない | close行不足 | `<!-- kmark } -->` 追加 |
| 画像がpage幅からはみ出す | 固定幅過大 | `w:page_fit` または `w:page_fit_contain` |
| 表が横にはみ出す | table幅過大 | `table_fit:shrink` または cell padding縮小 |
| 値が無視される | 値grammar不一致 | parameter reference確認 |
| legacy `text` `stamp` が出ない | 現行renderer未対応 | `color` `bg` `border_*` 等で代替 |

## Non-Goal

- kmark commentは任意CSS注入ではない
- `style:` `onclick:` 等は無視対象
- `rgb()` `url()` `var()` 等のCSS関数は color値として使用不可
- standalone shape block syntax は現行rendererに存在しない
