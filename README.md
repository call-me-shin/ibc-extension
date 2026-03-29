# IBC – Information Bias Checker

> Xのタイムラインにおけるフィルターバブル／エコーチェンバーを可視化する Chrome 拡張機能（MVP）

---

## ディレクトリ構成

```
ibc-extension/
├── manifest.json                  ← Manifest V3 設定
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── content/
    │   └── collector.js           ← X の DOM からデータを収集
    ├── background/
    │   └── service_worker.js      ← IndexedDB 管理・定期削除
    ├── popup/
    │   ├── popup.html             ← 拡張機能アイコン → ポップアップ UI
    │   └── popup.js               ← NLP 解析 + Chart.js グラフ描画
    ├── dashboard/
    │   └── dashboard.html         ← 詳細ダッシュボード（別タブ）
    └── lib/
        ├── db.js                  ← IDB スキーマ定義（参照用）
        ├── nlp.js                 ← NLP ユーティリティ（参照用）
        ├── chart.min.js           ← Chart.js バンドル（要ダウンロード）
        └── dexie.min.js           ← Dexie.js（任意・未使用の場合は不要）
```

---

## セットアップ手順

### 1. 外部ライブラリの配置

```bash
# Chart.js (v4系) をダウンロード
curl -L https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js \
     -o src/lib/chart.min.js

# ※ Dexie.js は現在未使用（raw IDB API で実装済み）
```

### 2. アイコン画像の作成

`icons/` 配下に 16×16, 48×48, 128×128px の PNG を用意してください。
（開発時はプレースホルダーとして任意の PNG を配置して OK）

### 3. Chrome への読み込み

1. Chrome で `chrome://extensions/` を開く
2. 右上「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `ibc-extension/` フォルダを選択

---

## アーキテクチャ解説

### データフロー

```
[X タイムライン DOM]
       ↓ MutationObserver
[collector.js]
       ↓ IndexedDB.put()（重複排除）
[ibc_db / tweets store]
       ↓ Popup クリック
[popup.js / dashboard.html]
       ↓ NLP 解析
[バイアススコア + グラフ]
```

### バイアススコア算出ロジック

1. **キーワード多様性**（重み 60%）：全トークンのシャノンエントロピーを正規化
2. **投稿者多様性**（重み 40%）：投稿者分布のシャノンエントロピーを正規化
3. `BiasScore = (1 - 正規化エントロピー平均) × 100`
   - 0 ≒ 多様で健全
   - 100 ≒ 完全なフィルターバブル

---

## DOM 変更への対策（重要）

X は React SPA であり、頻繁に `data-testid` やクラス名を変更します。
以下の設計で対応しています：

### 多段フォールバックセレクタ（collector.js）

```js
const SELECTORS = {
  tweetArticle: [
    'article[data-testid="tweet"]',   // 現行（2024〜）
    'article[role="article"]',         // フォールバック1
    'div[data-testid="tweet"]',        // フォールバック2
  ],
  tweetText: [
    '[data-testid="tweetText"]',
    '[lang] > span',
    '.tweet-text',                     // 旧仕様
  ],
  // ...
};
```

### セレクタ修正時の手順

1. Chrome DevTools で X を開き、ツイート要素を検査
2. `collector.js` の `SELECTORS` オブジェクトの先頭に新しいセレクタを追加
3. 拡張機能をリロード（`chrome://extensions/` → 更新ボタン）

**ベストプラクティス**：
- `data-testid` は比較的安定しているが、完全に信頼しない
- テキストコンテンツベースの照合（`innerText` が空なら別セレクタへ）を使用
- 定期的に DevTools でセレクタの動作確認を行う

---

## 今後の拡張案（Post-MVP）

| 優先度 | 機能                           | 技術                                |
|--------|-------------------------------|-------------------------------------|
| 高     | TinySegmenter 統合             | 正確な日本語分かち書き              |
| 高     | タイムライン上のバイアス表示   | Content Script によるオーバーレイ   |
| 中     | CSV/JSON エクスポート          | Blob API + a[download]              |
| 中     | バイアストレンドグラフ         | 時系列での偏り推移                  |
| 低     | 他プラットフォーム対応         | YouTube / Reddit 等                 |

---

## プライバシーポリシー（MVP 向け）

- **完全ローカル処理**：取得データは端末内の IndexedDB にのみ保存
- **外部通信なし**：X API・外部サーバーへの通信は一切行わない
- **自動削除**：7日経過したデータは自動的に削除される
- **手動削除**：ポップアップの「データ削除」ボタンで即座に全削除可能
