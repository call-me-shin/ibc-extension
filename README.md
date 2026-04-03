# IBC – Information Bias Checker

> A Chrome extension that visualizes filter bubbles and echo chambers on your X (Twitter) "For You" timeline.
> Xの「おすすめ」タイムラインにおけるフィルターバブル・エコーチェンバーを可視化するChrome拡張機能。

---

## Overview / 概要

IBC analyzes the tweets you scroll through on X's "For You" tab and calculates a **Bias Score** (0–100) based on keyword diversity and author diversity. The higher the score, the more your feed is locked in a filter bubble.

IBCは、Xの「おすすめ」タブでスクロールしたツイートを分析し、キーワード多様性と投稿者多様性をもとに**バイアススコア**（0〜100）を算出します。スコアが高いほど、フィルターバブルに閉じ込められている状態を示します。

---

## Features / 機能

- **For You only** — collects data exclusively from the `/home` "For You" tab
  **おすすめタブのみ収集** — `/home` の「おすすめ」タブのデータだけを対象にします
- **Bias Score** — Shannon entropy–based score from 0 (healthy) to 100 (extreme bubble)
  **バイアススコア** — シャノンエントロピーによる0（健全）〜100（完全なバブル）のスコア
- **Keyword chart** — doughnut chart showing top keyword share
  **キーワード占有率** — 上位キーワードをドーナツグラフで表示
- **Dominant figure** — bar chart of most frequent authors
  **ドミナントフィギュア** — 最頻出の投稿者を棒グラフで表示
- **Data clear** — delete all collected data instantly from the popup
  **データクリア** — ポップアップからワンクリックで全データを削除
- **Fully local** — no external server, no API calls
  **完全ローカル処理** — 外部サーバーへの通信なし

---

## Installation / インストール

### 1. Download Chart.js

```bash
curl -L https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js \
     -o src/lib/chart.min.js
```

### 2. Load into Chrome / Chromeへの読み込み

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `ibc-extension/` folder

---

## Usage / 使い方

1. Open `x.com/home` and scroll the **For You** tab to collect tweets.
   `x.com/home` を開き、**おすすめ**タブをスクロールしてツイートを収集します。
2. Click the IBC extension icon to run the analysis and view your Bias Score.
   IBCアイコンをクリックして解析を実行し、バイアススコアを確認します。

---

## Privacy / プライバシー

- All data is stored locally in IndexedDB — nothing leaves your device.
  すべてのデータはIndexedDBにローカル保存され、端末外に出ることはありません。
- No external communication of any kind.
  外部への通信は一切行いません。
- Collected data is automatically deleted after **7 days**.
  収集データは**7日後**に自動削除されます。
- You can delete all data manually from the popup at any time.
  ポップアップからいつでも手動で全削除できます。

---

## Bias Score Algorithm / バイアススコア算出ロジック

1. **キーワード多様性**（重み 60%）：各キーワードを含む投稿数のシャノンエントロピーを正規化。1投稿内の重複は除外し、投稿数ベースで集計。
2. **投稿者多様性**（重み 40%）：投稿者分布のシャノンエントロピーを正規化
3. `BiasScore = (1 - 正規化エントロピー平均) × 100`
   - 0 ≒ 多様で健全
   - 100 ≒ 完全なフィルターバブル

キーワードをクリックすると、そのキーワードをtokenize後に含む投稿のみが表示されます。

---

## Known Issues / 既知の課題

1. **NLP accuracy** — regex-based tokenization causes noise (TinySegmenter not yet integrated)
   **NLP精度** — 正規表現ベースのトークン化によりノイズが混入することがある（TinySegmenter未導入）
2. **Score gap** — only vocabulary/author diversity is measured; genre-level judgment requires AI
   **スコアの乖離** — 語彙・投稿者の分散のみ測定しており、ジャンル判定にはAIが必要
3. **DOM dependency** — X may change its DOM structure, requiring `SELECTORS` updates in `collector.js`
   **DOM依存** — XのDOM構造変更により`collector.js`のセレクタ更新が必要になる場合がある

---

## Roadmap / 今後の予定

- Integrate **TinySegmenter** for accurate Japanese tokenization
  正確な日本語分かち書きのための**TinySegmenter**導入
- **Genre classification** via Chrome built-in AI (Gemini Nano)
  Chrome built-in AI（Gemini Nano）による**ジャンル分類**
- **Bias overlay** on the timeline (content script UI)
  タイムライン上への**バイアスオーバーレイ**表示
- **CSV / JSON export**

---

## Tech Stack / 技術スタック

- Chrome Extension Manifest V3
- IndexedDB (raw IDB API, no Dexie.js)
- Chart.js v4
- Vanilla JS — no build tools, no frameworks
