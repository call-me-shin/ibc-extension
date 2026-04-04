# IBC – Information Bias Checker

> A Chrome extension that visualizes filter bubbles and echo chambers on your X (Twitter) "For You" timeline.
> Xの「おすすめ」タイムラインにおけるフィルターバブル・エコーチェンバーを可視化するChrome拡張機能。

---

## Overview / 概要

IBC analyzes the tweets you scroll through on X's "For You" tab and visualizes keyword diversity and author diversity.

IBCは、Xの「おすすめ」タブでスクロールしたツイートを分析し、キーワード多様性と投稿者多様性を可視化します。

---

## Features / 機能

- **For You only** — collects data exclusively from the `/home` "For You" tab
  **おすすめタブのみ収集** — `/home` の「おすすめ」タブのデータだけを対象にします
- **Keyword chart** — horizontal bar chart showing top 10 keywords with post count and % of total posts
  **キーワードチャート** — 上位10キーワードを横棒グラフで表示。件数と全投稿数に対する%を常時表示
- **Author chart** — bar chart of top 10 most frequent authors with avatar and post share
  **投稿者チャート** — 上位10投稿者をアバター付き棒グラフで表示
- **Dashboard** — detailed view with keyword drill-down to matching posts
  **ダッシュボード** — キーワードをクリックすると該当投稿一覧を表示
- **Side panel support** — works as a Chrome side panel
  **サイドパネル対応** — Chromeのサイドパネルとして表示可能
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
2. Click the IBC extension icon to run the analysis and view the results.
   IBCアイコンをクリックして解析を実行し、結果を確認します。
3. Click a keyword bar to open the Dashboard and view matching posts.
   キーワードの棒グラフをクリックするとダッシュボードが開き、該当投稿を確認できます。

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

## Design Decisions

### バイアススコアを設けない理由 / Why We Don't Have a Bias Score
タイムラインの「偏りの度合い」を数値で判定することは、計算式でもAIでも正確には不可能と判断。
誰の投稿が多いか・何の話題が多いかをグラフで可視化し、判断はユーザーに委ねる設計としている。

Accurately quantifying the degree of bias in a timeline is not feasible — neither through formulas nor AI.
Instead, IBC visualizes who posts most and what topics dominate, leaving the judgment to the user.

---

## Known Issues / 既知の課題

- **#3 Short post / word collection** — short tweets and short words are underrepresented (AI required)
  **短い投稿・単語の収集改善** — 短いツイートや単語が過小評価される（AI必要）
- **#5 DOM dependency** — X may change its DOM structure, requiring `SELECTORS` updates in `collector.js`
  **DOM依存** — XのDOM構造変更により`collector.js`のセレクタ更新が必要になる場合がある
- **#7 Incorrect word segmentation** — some words are incorrectly split or merged (AI required)
  **単語の誤った切り抜き** — 一部の単語が誤って分割・結合される（AI必要）

---

## Roadmap / 今後の予定

- **Genre classification** via Chrome built-in AI (Gemini Nano)
  Chrome built-in AI（Gemini Nano）による**ジャンル分類**
- **CSV / JSON export**

---

## Tech Stack / 技術スタック

- Chrome Extension Manifest V3
- IndexedDB (raw IDB API, no Dexie.js)
- Chart.js v4
- TinySegmenter（日本語分かち書き）
- Vanilla JS — no build tools, no frameworks