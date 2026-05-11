<!-- kmark { page_number:show page_number_format:"{page}" page_number_font_size:10pt -->

# ページ番号フォントサイズテスト 1

このページのページ番号は10pt。

本文サイズは変わらないこと。

<!-- --- -->

# ページ番号フォントサイズテスト 2

このページも設定継続により、ページ番号は10pt。

<!-- --- -->

<!-- kmark page_number_font_size:18pt -->

# ページ番号フォントサイズテスト 3

このページからページ番号は18pt。

本文は大きくならないこと。

<!-- --- -->

<!-- kmark page_number_font_size:8pt page_number_format:"Page {page} / {total}" -->

# ページ番号フォントサイズテスト 4

このページからページ番号は8pt。

表示形式は `Page {page} / {total}`。

<!-- --- -->

<!-- kmark page_number:hide -->

# ページ番号非表示テスト

このページにはページ番号を表示しない。

ただし、page_number_font_size の設定値は壊さない。

<!-- --- -->

<!-- kmark page_number:show -->

# ページ番号再表示テスト

ページ番号を再表示する。

期待:
- ページ番号が表示される
- フォントサイズは直前の有効設定に従う
- 本文サイズは変わらない

<!-- --- -->

<!-- kmark page_number_font_size:12px -->

# px指定テスト

このページのページ番号は12px。

<!-- --- -->

<!-- kmark page_number_font_size:3mm -->

# mm指定テスト

このページのページ番号は3mm。

<!-- --- -->

<!-- kmark page_number_font_size:abc -->

# 無効値テスト

無効値を指定している。

期待:
- クラッシュしない
- 既定値にフォールバックする
- 開発時ログに警告が出るとなお良い