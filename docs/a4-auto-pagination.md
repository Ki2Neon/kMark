# A4 自動ページ追加

## Architecture Core

- `Source Section`: 明示改ページ `<!-- --- -->` の間の Rust 正準ソース
- `Rendered Page`: Rust Renderer が明示改ページとページ設定境界から生成する HTML とページ設定
- `Physical Page`: 1 Rendered Page の表示内容が用紙枠を超える場合の継続ページ
- 物理ページは Rendered Page の順序を保ち、後続の明示ページを越えて内容を移動しない
- 継続ページは用紙・文字・ヘッダー/フッター設定を継承し、`page_number_reset` だけ無効化する
- Rust の Source Section Patch / Full 判定と revision 検証は変更しない

## Tauri Adapter / Browser View

- Tauri と Web は既存の `RenderedPreviewPage` 契約を共有する。新しい IPC DTO は不要
- Browser の DOM 計測 Adapter が実際のフォント・画像寸法と `page_fit` / `page_valign` を読み、Rendered Page ごとに物理ページへ分割する。用紙の描画寸法は WebView 固有のため Rust 側では推定しない
- Preview は入力 Rendered Page ごとに分割結果をキャッシュする。Source Section Patch で変わらないページは再計測せず、後続ページの DOM key も保持する
- IPC が未変更ページを新しいオブジェクトとして復元した場合は、HTML とページ設定を照合してキャッシュを再利用する
- 画像・動画・フォント・テーマの変更では影響ページの計測結果を失効させる
- ページ番号と目次番号は物理ページ列の確定後に算出する。印刷は表示中の物理ページ DOM を使用する

## 制約

- CSS で分割できない単一要素が用紙本文領域より大きい場合、その要素の内部まで必ず分割する保証はない
- 明示改ページがない巨大な Source Section は Rust Preview 自体も Full Render となる。物理ページ分割はその 1 Rendered Page を再計測する
