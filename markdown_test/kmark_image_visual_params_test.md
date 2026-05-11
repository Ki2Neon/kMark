# kmark 画像拡張パラメータ調査・実装テスト

このファイルは `markdown_test/image.png` を使う画像装飾確認用。

## 1. 通常画像

![通常画像](image.png)

期待:
- 従来通り表示される
- 余計なwrapperや空白で崩れない

---

## 2. 幅指定

<!-- kmark w:80mm -->
![幅80mm](image.png)

期待:
- 画像幅が80mmになる

---

## 3. 高さ指定

<!-- kmark h:40mm -->
![高さ40mm](image.png)

期待:
- 画像高さが40mmになる

---

## 4. 枠線

<!-- kmark border_size:0.5mm border_color:red -->
![赤枠画像](image.png)

期待:
- 赤い枠線が付く

---

## 5. 角丸

<!-- kmark radius:4mm -->
![角丸画像](image.png)

期待:
- 角丸になる
- 画像の角も丸く見える

---

## 6. 背景とpadding

<!-- kmark padding:4mm bg:#f5f5f5 radius:3mm -->
![背景padding画像](image.png)

期待:
- 背景色が見える
- 画像と背景の間に余白がある
- 角丸も反映される

---

## 7. background alias

<!-- kmark padding:4mm background:#fff0f0 radius:3mm -->
![background指定画像](image.png)

期待:
- bgと同じように背景色が反映される

---

## 8. 透明度

<!-- kmark opacity:0.5 -->
![半透明画像](image.png)

期待:
- 半透明になる

---

## 9. 回転

<!-- kmark w:70mm rotate:-3deg shadow:soft -->
![回転画像](image.png)

期待:
- 画像が少し回転する
- 影も付く
- 画像が消えない

---

## 10. 影

<!-- kmark w:80mm shadow:soft -->
![影付き画像](image.png)

期待:
- soft shadowが付く

---

## 11. margin

<!-- kmark margin:5mm -->
![margin画像](image.png)

期待:
- 画像外側に余白ができる

---

## 12. align center

<!-- kmark align:center w:80mm -->
![中央寄せ画像](image.png)

期待:
- 中央寄せになる

---

## 13. align right

<!-- kmark align:right w:60mm -->
![右寄せ画像](image.png)

期待:
- 右寄せになる

---

## 14. 複合指定

<!-- kmark w:80mm padding:4mm bg:#f5f5f5 border_size:0.5mm border_color:#999 radius:3mm shadow:soft align:center -->
![複合指定画像](image.png)

期待:
- 中央寄せ
- 幅80mm
- 背景色あり
- paddingあり
- 枠線あり
- 角丸あり
- 影あり

---

## 15. スコープ指定

<!-- kmark { align:center w:70mm radius:3mm shadow:soft } -->

![スコープ画像1](image.png)

![スコープ画像2](image.png)

<!-- kmark } -->

期待:
- スコープ内の画像に共通指定が反映される
- スコープ外には影響しない

---

## 16. scope外確認

![scope外画像](image.png)

期待:
- スコープ指定の装飾が残らない

---

## 17. 単発がscopeを上書き

<!-- kmark { align:center w:80mm radius:3mm } -->

<!-- kmark w:50mm -->
![単発上書き画像](image.png)

<!-- kmark } -->

期待:
- wは50mm
- radiusはscopeの3mm

---

## 18. border_color単独

<!-- kmark border_color:red -->
![border_color単独画像](image.png)

期待:
- クラッシュしない
- 赤枠が表示される

---

## 19. margin shorthand

<!-- kmark margin:4mm 0 -->
![margin shorthand画像](image.png)

期待:
- 上下4mm 左右0

---

## 20. 危険値無視

<!-- kmark bg:url(javascript:alert(1)) opacity:bad rotate:bad shadow:url(javascript:alert(1)) margin:1mm; padding:<x> radius:"3mm;" -->
![危険値無視画像](image.png)

期待:
- クラッシュしない
- 危険なstyleが反映されない
