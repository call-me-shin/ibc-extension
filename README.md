# IBC – Information Bias Checker

> A Chrome extension that visualizes information bias on your X (Twitter) "For You" timeline.
> Xの「おすすめ」タイムラインにおける情報の偏りを可視化するChrome拡張機能。

---

## Overview / 概要

IBC analyzes the tweets you scroll through on X's "For You" tab and visualizes which keywords appear most frequently across posts and which authors dominate your feed.
IBCは、Xの「おすすめ」タブでスクロールしたツイートを分析し、どのキーワードを含む投稿が多く、どの投稿者が頻出しているかを可視化します。

---

## Philosophy / 思想

Information bias always occurs — in newspapers, social media, and everyday conversation.
情報の偏りは必ず発生します。新聞、SNS、日常会話、あらゆる場所で。

Being aware of that bias matters. Without awareness, we cannot know what perspectives we are missing.
その偏りを認知することが重要です。認知なしには、自分がどのような視点を欠いているかを知ることができません。

We believe it is worthwhile to make an effort to seek out diverse information.
多様な情報を摂取するように努めることが望ましいと考えています。

IBC is designed with all information environments in mind. We currently focus on X's timeline because it is one of the most measurable.
IBCはすべての情報環境を対象に考えています。現在はXのタイムラインを選択しているのは、計測しやすい環境だからです。

IBC provides visualizations to help you see your information bias. What you do with that is up to you.
IBCはあなたの情報の偏りを可視化する手段を提供します。そこからどう行動するかは、あなた次第です。

---

## Features / 機能

- **For You only** — collects data exclusively from the `/home` "For You" tab
  **おすすめタブのみ収集** — `/home` の「おすすめ」タブのデータだけを対象にします
- **Keyword chart** — top 10 keywords by post count, displayed as a horizontal bar chart
  **キーワードチャート** — 上位10キーワードの投稿数を横棒グラフで表示
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

### 1. Load into Chrome / Chromeへの読み込み

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `ibc-extension/` folder

> **Note:** If you downloaded a ZIP file, the folder may be nested. Select the inner folder that contains `manifest.json`.
> **注意：** ZIPファイルからインストールする場合、フォルダが二重になっている場合があります。`manifest.json` が含まれる内側のフォルダを選択してください。

---

## Usage / 使い方

1. Open `x.com/home` and scroll the **For You** tab to collect posts.
   `x.com/home` を開き、**おすすめ**タブをスクロールして投稿を収集します。
2. Click the IBC extension icon to run the analysis and view the results.
   IBCアイコンをクリックして解析を実行し、結果を確認します。
3. Click a keyword to open the Dashboard and view matching posts.
   キーワードをクリックするとダッシュボードが開き、該当投稿を確認できます。

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

### Why We Don't Have a Bias Score / バイアススコアを設けない理由

IBC intentionally does not provide a numerical score for the degree of information bias (filter bubbles or echo chambers).
IBCは情報の偏り（フィルターバブルやエコーチェンバー）の度合いを数値で示すスコア機能を意図的に採用していません。

**Measurement difficulty / 計測の困難さ**
Accurately quantifying the degree of information bias is inherently difficult. Any formula embeds assumptions about what counts as "bias" in the first place.
情報の偏りの度合いを正確に数値化することは困難です。どのような計算式を用いても、何を「偏り」とみなすかという判断が式に埋め込まれてしまいます。

**Representation limits / 表現の限界**
A single number lacks context. Attaching labels to a score imposes a particular value judgment on the user.
単一の数値は文脈を持ちません。スコアにラベルを付けることは、特定の価値観をユーザーに押しつけることになります。

**Risk of stopping thought / 思考停止のリスク**
Numbers invite closure. A low score may lead users to conclude their feed is fine, short-circuiting the reflection that visualizations are meant to prompt.
数値が提示されると、それを正解として受け取りやすくなります。低いスコアが出たとき「問題ない」と判断し、グラフを見て自分で考えるプロセスが短絡されるリスクがあります。

IBC provides visualizations. What you make of them is up to you.
IBCが提供するのはグラフによる可視化です。何をどう受け取るかは、ユーザー自身が決めます。

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