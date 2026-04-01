# CLAUDE.md
このファイルはClaude Code（AI開発アシスタント）向けのプロジェクトガイドです。

## プロジェクト概要
**IBC（Information Bias Checker）**
Xのおすすめタイムラインにおけるフィルターバブル・エコーチェンバーを可視化するChrome拡張機能。

## 技術スタック
- Manifest V3
- IndexedDB（raw IDB API、Dexie.js不使用）
- Chart.js v4
- 完全ローカル処理（外部API・サーバー不使用）

## ディレクトリ構成
```
ibc-extension/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── content/collector.js
    ├── background/service_worker.js
    ├── popup/
    │   ├── popup.html
    │   └── popup.js
    ├── dashboard/
    │   ├── dashboard.html
    │   └── dashboard.js
    └── lib/
        ├── db.js         （参照用・直接読み込まれない）
        ├── nlp.js        （参照用・直接読み込まれない）
        └── chart.min.js  （要ダウンロード）
```

## 収集ロジックの制約
- 収集対象：/home かつ「おすすめ」タブのみ
- フォロー中タブ・プロフィール・ツイート詳細は収集しない
- データ保持期間：7日間（自動削除）

## 開発上のルール
- NLPロジックはpopup.js・dashboard.js・nlp.jsの3ファイルで同一実装を維持する

## 現在のバージョン
v0.3.1

## 既知の課題
1. **NLP精度**：正規表現ベースの簡易実装のためノイズが混入することがある（TinySegmenter未導入）
2. **スコアの乖離**：語彙・投稿者の分散のみ測定しており、ジャンル判定にはAIが必要
3. **DOM依存**：XのDOM構造変更により、SELECTORSの更新が必要になることがある

## 今後の拡張予定
- TinySegmenter導入による日本語NLP精度向上
- Chrome built-in AI（Gemini Nano）を用いたジャンル分類
- タイムライン上へのバイアスオーバーレイ表示
- CSV/JSONエクスポート機能
