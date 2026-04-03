**IBC（Information Bias Checker）**
Xのおすすめタイムラインにおけるフィルターバブル・エコーチェンバーを可視化するChrome拡張機能。

## 技術スタック

- Manifest V3 / Chrome拡張機能
- IndexedDB（raw IDB API）
- Chart.js v4 / TinySegmenter（src/lib/に配置）
- 完全ローカル処理（外部API不使用）

## 収集ロジック

- 収集対象：x.com/home の「おすすめ」タブのみ
- データ保持：7日間（自動削除）
- 重複排除：simpleHash（author + text）

## 分析ロジック

- キーワード集計：投稿数ベース（1投稿内の重複除外）
- 投稿一覧：tokenize結果に基づきフィルタリング

## 開発ルール

- NLPロジックはpopup.js・dashboard.js・nlp.jsの3ファイルで同一実装を維持
- popup.html / dashboard.html のロゴはdivタグ+CSSで実装済み