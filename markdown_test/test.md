# Markdown Renderer Test

## 1. 見出し

# H1
## H2
### H3
#### H4
##### H5
###### H6

---

## 2. 段落と改行

これは通常の段落です。Markdownレンダラーの本文表示を確認します。

これは2つ目の段落です。
行末にスペース2つを入れると改行されます。

---

## 3. 強調

*italic*
_italic_

**bold**
__bold__

***bold italic***
___bold italic___

~~strikethrough~~

---

## 4. リスト

### 箇条書き

- item 1
- item 2
  - nested item 2-1
  - nested item 2-2
- item 3

### 番号付きリスト

1. first
2. second
3. third

### 混在リスト

1. parent
   - child A
   - child B
2. parent 2

---

## 5. 引用

> これは引用です。
>
> 複数行の引用です。
>
> > ネストされた引用です。

---

## 6. コード

インラインコード: `printf("Hello");`

### コードブロック

```c
#include <stdio.h>

int main(void) {
    printf("Hello, Markdown!\n");
    return 0;
}
````

```rust
fn main() {
    println!("Hello, Markdown!");
}
```

---

## 7. リンク

[OpenAI](https://openai.com)

[https://example.com](https://example.com)

---

## 8. 画像

![代替テキスト](./image.png)

---

## 9. 水平線

---

---

---

---

<!-- --- -->

## 10. テーブル

| Name    |     Type | Description  | Description  | Description  | Description  |
| ------- | -------: | :----------- | :----------- | :----------- | :----------- |
| id      | uint32_t | identifier   | identifier   | identifier   | identifier   |
| name    |   string | display name | display name | display name | display name |
| enabled |     bool | enable flag  | enable flag  | enable flag  | enable flag  |

---

## 11. チェックボックス

* [x] completed task
* [ ] pending task
* [ ] another task

---

## 12. エスケープ

*これは斜体にならない*

# これは見出しにならない

---

## 13. HTML混在

<div>
  <strong>HTML block</strong>
</div>

---

## 14. 長い文章

これは長い文章の折り返し確認用です。Markdownレンダラーが横スクロールせずに自然に折り返すか、行間や余白が適切かを確認するためのテキストです。UI上で読みやすい幅に収まっているかも確認します。

---

## 15. 日本語・英語・記号

日本語の文章です。

English text.

記号: ! ? # $ % & ` * _ - + = / \ | @ ~ ^

---

## フットノート


これは本文です[^note]

[^note]: 任意のラベルでOK

---

## 16. 終了

Markdown renderer test end.

```
```
