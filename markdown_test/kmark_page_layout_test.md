<!-- kmark page_scope:document page_size:A4 page_orientation:portrait page_margin:12mm preview_font_size:11pt -->

# kmark ページ割り・ページ設定テスト

このファイルは、kmark のページ表示機能を確認するためのテスト用 Markdown です。

## 確認対象

- 文書全体のページ設定
- 明示ページ区切り `<!-- --- -->`
- ページごとの縦向き / 横向き混在
- ページサイズ混在
- ページ余白の変更
- プレビュー基準フォントサイズの変更
- 表・リスト・コードブロック・長文のページ割り
- 自動ページ割り時の溢れ判定

## 1ページ目: A4 縦 / 11pt / 余白12mm

このページは文書全体設定を継承します。

```text
期待値:
- page_size: A4
- page_orientation: portrait
- page_margin: 12mm
- preview_font_size: 11pt
```

### 通常段落

これは通常の本文です。ページの基準フォントサイズが `11pt` として扱われることを確認します。  
見出し、段落、箇条書き、表、コードブロックが通常通り表示されることも確認します。

kmark のページ表示では、用紙サイズ、余白、フォントサイズがページごとに異なる可能性があります。  
そのため、ページ分割処理は固定の A4 高さではなく、現在のページに適用されている設定を参照する必要があります。

### 箇条書きテスト

- 項目 1: 通常の短い項目
- 項目 2: 少し長い項目です。折り返しが発生した場合でも、インデントが崩れないことを確認します。
- 項目 3:
  - ネスト項目 3-1
  - ネスト項目 3-2
  - ネスト項目 3-3
- 項目 4: ページ下端付近で分割された場合にも、次ページでレイアウトが破綻しないこと。

### 表テスト

| No | 項目 | 期待値 | 備考 |
|---:|---|---|---|
| 1 | A4縦 | 適用される | 文書全体設定 |
| 2 | 余白12mm | 適用される | 4辺共通 |
| 3 | 11pt | 適用される | プレビュー本文のみ |
| 4 | 通常Web表示 | コメント非表示 | レイアウトには反映しない |
| 5 | ページ表示 | コメント非表示 | ページフレームに反映 |

### コードブロックテスト

```rust
#[derive(Clone, Debug)]
pub struct PageStyle {
    pub width: CssLength,
    pub height: CssLength,
    pub margin_top: CssLength,
    pub margin_right: CssLength,
    pub margin_bottom: CssLength,
    pub margin_left: CssLength,
}

#[derive(Clone, Debug)]
pub struct PreviewTextStyle {
    pub base_font_size: CssLength,
}
```

---

<!-- --- -->
<!-- kmark page_scope:page page_orientation:landscape -->

# 2ページ目: A4 横 / 11pt / 余白12mm

このページは `page_scope:page page_orientation:landscape` により、文書全体設定の A4 を継承しつつ、向きだけ横に変更します。

```text
期待値:
- page_size: A4
- page_orientation: landscape
- page_width: 297mm 相当
- page_height: 210mm 相当
- page_margin: 12mm
- preview_font_size: 11pt
```

## 横ページ用の広い表

横向きページでは、横幅の広い表が縦向きページより見やすく表示されることを確認します。

| ID | 信号名 | コマンド | アドレス | Byte0 | Byte1 | Byte2 | Byte3 | 説明 |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | ENABLE_INPUT | T 0F | 0x0001 | 0x01 | 0x00 | 0x00 | 0x00 | 入力有効化 |
| 2 | DISABLE_INPUT | T 10 | 0x0002 | 0x00 | 0x01 | 0x00 | 0x00 | 入力無効化 |
| 3 | SET_MODE | T 20 | 0x0010 | 0x02 | 0x00 | 0x00 | 0x00 | 動作モード設定 |
| 4 | SET_TIMER | T 21 | 0x0011 | 0x10 | 0x27 | 0x00 | 0x00 | タイマー設定 |
| 5 | READ_STATUS | R 01 | 0x0020 | 0x00 | 0x00 | 0x00 | 0x00 | 状態読み出し |
| 6 | WRITE_CONFIG | W 30 | 0x0030 | 0x12 | 0x34 | 0x56 | 0x78 | 設定書き込み |

## 横ページの本文

このページは横向きなので、高さは縦向きページより小さくなります。  
自動ページ割りを行う場合は、A4横の高さを基準に溢れ判定される必要があります。

横向きページでは横幅が広がる一方、縦方向に置ける情報量は少なくなります。  
したがって、同じ文章量でも縦向きページより早く次ページへ送られる可能性があります。

---

<!-- --- -->
<!-- kmark page_scope:page page_size:A5 page_orientation:portrait page_margin:8mm preview_font_size:10pt -->

# 3ページ目: A5 縦 / 10pt / 余白8mm

このページは A5 縦です。

```text
期待値:
- page_size: A5
- page_orientation: portrait
- page_margin: 8mm
- preview_font_size: 10pt
```

## A5ページの確認

A5 は A4 より小さいため、同じ文章量でも早くページが溢れます。  
ただし、このページでは `preview_font_size:10pt` としているため、11pt よりは少し多くの文字が入る可能性があります。

### 長めの段落

ページサイズとフォントサイズの両方が変わる場合、ページ割り処理は両方の影響を受ける必要があります。  
A5 縦は A4 縦より高さも幅も小さいため、段落の折り返し行数が増えます。  
折り返し行数が増えると、見かけ上の段落高さも増えるため、単純に文字数だけでページ割りすることはできません。

### A5用リスト

- A5 縦ページでリストのインデントが崩れないこと
- 小さいページでも表やコードブロックがはみ出しすぎないこと
- ページ末尾に近いブロックが次ページへ移動する場合、余計な空白が発生しないこと
- ページ単位設定がこのページだけに適用されること
- 次ページで document デフォルトに戻るか、次の page 指定に従うこと

### 小さめの表

| No | テスト | 結果 |
|---:|---|---|
| 1 | A5縦 | 表示される |
| 2 | 10pt | 反映される |
| 3 | 余白8mm | 反映される |
| 4 | 次ページへの影響 | しない |

---

<!-- --- -->
<!-- kmark page_scope:page page_size:A5 page_orientation:landscape page_margin:8mm preview_font_size:9pt -->

# 4ページ目: A5 横 / 9pt / 余白8mm

このページは A5 横です。  
A5 横は幅は広めですが、高さは小さいため、ページ割りの確認に向いています。

```text
期待値:
- page_size: A5
- page_orientation: landscape
- page_margin: 8mm
- preview_font_size: 9pt
```

## A5横の横長テーブル

| No | 項目A | 項目B | 項目C | 項目D | 項目E | 項目F |
|---:|---|---|---|---|---|---|
| 1 | A5 | landscape | 9pt | 8mm | 横幅確認 | 高さ確認 |
| 2 | A5 | landscape | 9pt | 8mm | 横幅確認 | 高さ確認 |
| 3 | A5 | landscape | 9pt | 8mm | 横幅確認 | 高さ確認 |
| 4 | A5 | landscape | 9pt | 8mm | 横幅確認 | 高さ確認 |
| 5 | A5 | landscape | 9pt | 8mm | 横幅確認 | 高さ確認 |

## 本文

このページではフォントサイズが 9pt です。  
そのため、同じページサイズでも 10pt や 11pt より多くの情報が入る可能性があります。

---

<!-- --- -->
<!-- kmark page_scope:page page_width:100mm page_height:148mm page_margin_top:6mm page_margin_right:7mm page_margin_bottom:8mm page_margin_left:9mm preview_font_size:8pt -->

# 5ページ目: カスタムサイズ / 個別余白 / 8pt

このページはプリセットではなく、`page_width` と `page_height` を直接指定しています。

```text
期待値:
- page_width: 100mm
- page_height: 148mm
- margin_top: 6mm
- margin_right: 7mm
- margin_bottom: 8mm
- margin_left: 9mm
- preview_font_size: 8pt
```

## 個別余白テスト

上下左右の余白が異なるため、ページフレーム内の本文位置が均等ではありません。  
この差が正しく反映されることを確認します。

## 小さいフォントサイズ

8pt はかなり小さいため、同じページサイズでも多くの行が入ります。  
ただし、読みやすさよりも、レイアウト処理の正しさを確認する目的です。

---

<!-- --- -->

# 6ページ目: document デフォルトへ戻る確認

このページには `page_scope:page` を指定していません。  
したがって、文書全体設定に戻ることを確認します。

```text
期待値:
- page_size: A4
- page_orientation: portrait
- page_margin: 12mm
- preview_font_size: 11pt
```

## 戻り確認

前ページのカスタムサイズ、個別余白、8pt がこのページに持ち越されてはいけません。  
このページは再び A4 縦、余白12mm、11pt で表示されることが期待値です。

---

<!-- --- -->
<!-- kmark page_scope:page page_size:A4 page_orientation:portrait page_margin:12mm preview_font_size:14pt -->

# 7ページ目: A4 縦 / 14pt / 自動ページ割り確認

このページはフォントサイズを大きくしています。  
14pt のため、同じ A4 縦でも 11pt より収まる情報量が少なくなります。

## 自動ページ割り用 長文

以下の長文は、明示ページ区切りなしで自動ページ割りが必要になることを期待したテストです。  
このブロック以降は、kmark の自動ページ分割が有効な場合、A4縦・14pt・余白12mmの条件でページが分割される必要があります。

### 長文開始

1. kmark のページ割り処理では、ページフレームの高さ、上下余白、本文フォントサイズ、見出しサイズ、行間、表やコードブロックの高さを総合的に扱う必要があります。
2. 単純な文字数ベースでは、折り返し幅やフォントサイズの影響を正しく反映できません。
3. 特に横向きページでは横幅が広くなるため、段落の折り返しは減りますが、ページの高さは減る可能性があります。
4. A5 ページでは幅も高さも変化するため、A4 と同じ閾値でページ割りを行うと不自然な結果になります。
5. `preview_font_size` が変化すると、段落、リスト、表、コードブロックの高さが変化します。
6. そのため、ページ分割は最終的な表示スタイルに近い状態を基準に判定する必要があります。
7. 明示ページ区切り `<!-- --- -->` がある場合は、その位置で必ずページを分けます。
8. ただし、自動ページ割りでは、溢れた部分だけを次ページに送り、余計なブロックを巻き込まないことが望ましいです。
9. 表やコードブロックのように分割が難しい要素は、まずブロック単位で次ページ送りにしてもかまいません。
10. 将来的には、表の行単位分割やリスト項目単位分割ができると、より自然なページ割りになります。

### 長文続き

この段落は自動ページ分割のテスト用です。  
同じ内容を複数行にわたって記述し、ページの下端に近づいたときの挙動を確認します。  
ページ下端に到達したとき、次ページへ送られるべき内容だけが送られ、前のページに十分な余白が残りすぎないことが理想です。

この段落は自動ページ分割のテスト用です。  
同じ内容を複数行にわたって記述し、ページの下端に近づいたときの挙動を確認します。  
ページ下端に到達したとき、次ページへ送られるべき内容だけが送られ、前のページに十分な余白が残りすぎないことが理想です。

この段落は自動ページ分割のテスト用です。  
同じ内容を複数行にわたって記述し、ページの下端に近づいたときの挙動を確認します。  
ページ下端に到達したとき、次ページへ送られるべき内容だけが送られ、前のページに十分な余白が残りすぎないことが理想です。

この段落は自動ページ分割のテスト用です。  
同じ内容を複数行にわたって記述し、ページの下端に近づいたときの挙動を確認します。  
ページ下端に到達したとき、次ページへ送られるべき内容だけが送られ、前のページに十分な余白が残りすぎないことが理想です。

この段落は自動ページ分割のテスト用です。  
同じ内容を複数行にわたって記述し、ページの下端に近づいたときの挙動を確認します。  
ページ下端に到達したとき、次ページへ送られるべき内容だけが送られ、前のページに十分な余白が残りすぎないことが理想です。

---

<!-- --- -->
<!-- kmark page_scope:page page_size:A4 page_orientation:landscape page_margin:10mm preview_font_size:12pt -->

# 8ページ目: A4 横 / 12pt / コードと表の複合テスト

このページは横向きで、コードブロックと表を混在させます。

## コードブロック

```c
typedef struct {
    uint16_t width_mm;
    uint16_t height_mm;
    uint16_t margin_top_mm;
    uint16_t margin_right_mm;
    uint16_t margin_bottom_mm;
    uint16_t margin_left_mm;
    uint8_t  preview_font_size_pt;
} kmark_page_style_t;

void kmark_apply_page_style(const kmark_page_style_t* style) {
    if (style == NULL) {
        return;
    }

    /*
     * This is a test code block.
     * The purpose is to confirm page layout behavior
     * when code blocks appear near page boundaries.
     */
}
```

## 複合表

| 項目 | 内容 | 確認 |
|---|---|---|
| page_size | A4 | 横向きで反映 |
| page_orientation | landscape | width/height 入れ替え |
| page_margin | 10mm | 4辺に反映 |
| preview_font_size | 12pt | 本文だけに反映 |
| code block | C code | 横幅・高さ確認 |
| table | この表 | はみ出し確認 |

---

<!-- --- -->

# 9ページ目: 最終確認

このページは再び document デフォルトです。

```text
期待値:
- A4 縦
- 12mm
- 11pt
```

## 最終チェックリスト

- [ ] page_scope:document が全体既定値になる
- [ ] page_scope:page が1ページだけに適用される
- [ ] A4縦とA4横が混在できる
- [ ] A5縦とA5横が混在できる
- [ ] カスタムサイズが反映される
- [ ] 個別余白が反映される
- [ ] preview_font_size がページごとに反映される
- [ ] page指定コメントが本文に出ない
- [ ] 通常Web表示でコメントが本文に出ない
- [ ] 既存のブロック装飾と干渉しない
- [ ] 自動ページ割りがページごとの設定に追従する
