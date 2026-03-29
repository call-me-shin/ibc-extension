// src/lib/nlp.js
// ─────────────────────────────────────────────────────────────────────────────
// 軽量 日本語 NLP ユーティリティ
//
// TinySegmenter を使った形態素解析（CDN 不要・バンドル済み前提）がベスト
// ですが、ここでは外部ライブラリ不要で動く「正規表現ベースの簡易実装」を
// 提供します。日本語・英語混在テキストに対応。
// ─────────────────────────────────────────────────────────────────────────────

/** 日本語ストップワード（助詞・助動詞・記号など） */
const JP_STOPWORDS = new Set([
  'の','に','は','を','た','が','で','て','と','し','れ','さ','ある','いる','も',
  'する','から','な','こと','として','い','や','れる','など','なり','って','ない',
  'この','ため','その','あの','これ','それ','あれ','この','よう','という','か',
  'で','ね','よ','わ','ー','・','…','「','」','（','）','、','。','！','？',
  'https','http','com','www','co','jp','rt', 'amp',
]);

/** 英語ストップワード */
const EN_STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','this','that','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','it',
  'i','you','he','she','we','they','my','your','his','her','our','their',
  'not','no','so','if','as','up','out','about','into','than','then','there',
  'just','also','like','get','got','all','more','than','now','new',
]);

/**
 * テキストをトークン（単語）に分割する。
 * 日本語は2〜8文字のカタカナ・漢字ブロックを抽出、
 * 英語は通常の空白分割。
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const tokens = [];

  // 日本語トークン（漢字・カタカナ・ひらがな連続）
  const jpMatches = text.match(/[\u3000-\u9FFF\uF900-\uFAFF]{2,8}/g) || [];
  tokens.push(...jpMatches);

  // 英語トークン
  const enMatches = text.match(/[a-zA-Z][a-zA-Z'-]{2,}/g) || [];
  tokens.push(...enMatches.map(t => t.toLowerCase()));

  // Twitter固有: #ハッシュタグ & @メンション
  const htMatches = text.match(/#[\w\u3040-\u9FFF]+/g) || [];
  tokens.push(...htMatches);

  return tokens;
}

/**
 * ストップワードを除去。
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function removeStopwords(tokens) {
  return tokens.filter(t => !JP_STOPWORDS.has(t) && !EN_STOPWORDS.has(t));
}

/**
 * トークン配列の頻度マップを返す。
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
export function countFrequency(tokens) {
  const freq = new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return freq;
}

/**
 * 頻度マップを降順にソートし上位 N 件を返す。
 * @param {Map<string, number>} freqMap
 * @param {number} topN
 * @returns {{ word: string, count: number }[]}
 */
export function topN(freqMap, topN = 10) {
  return [...freqMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

/**
 * テキスト配列全体を解析し、頻出ワードとドミナント投稿者を返す。
 *
 * @param {{ text: string, author: string }[]} tweets
 * @returns {{
 *   topKeywords: { word: string, count: number }[],
 *   topAuthors:  { author: string, count: number }[],
 *   biasScore:   number,   // 0–100
 *   totalTweets: number,
 * }}
 */
export function analyze(tweets) {
  if (!tweets || tweets.length === 0) {
    return { topKeywords: [], topAuthors: [], biasScore: 0, totalTweets: 0 };
  }

  // ── キーワード集計 ──────────────────────────────────────
  const allTokens = tweets.flatMap(t => removeStopwords(tokenize(t.text)));
  const keywordFreq = countFrequency(allTokens);
  const topKeywords = topN(keywordFreq, 10);

  // ── 投稿者集計 ──────────────────────────────────────────
  const authorFreq = new Map();
  for (const t of tweets) {
    const a = t.author || '不明';
    authorFreq.set(a, (authorFreq.get(a) || 0) + 1);
  }
  const topAuthors = [...authorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author, count]) => ({ author, count }));

  // ── バイアススコア算出 ────────────────────────────────────
  // ロジック：
  //   1. 上位1ワードのシェアが高いほど「話題の偏り」が大
  //   2. 上位1投稿者のシェアが高いほど「声の偏り」が大
  //   3. 両者の加重平均を 0–100 にスケール

  const totalTokens   = allTokens.length || 1;
  const topWordShare  = topKeywords[0]  ? topKeywords[0].count  / totalTokens  : 0;

  const totalPosts    = tweets.length;
  const topAuthorShare = topAuthors[0] ? topAuthors[0].count / totalPosts : 0;

  // 多様性エントロピー（Shannon entropy 正規化）
  const entropy = (freqMap, total) => {
    let h = 0;
    for (const [, v] of freqMap) {
      const p = v / total;
      if (p > 0) h -= p * Math.log2(p);
    }
    const maxH = Math.log2(freqMap.size || 1);
    return maxH === 0 ? 0 : h / maxH; // 0(偏り最大) → 1(均一)
  };

  const kwEntropy  = entropy(keywordFreq, totalTokens);
  const authEntropy = entropy(authorFreq,  totalPosts);

  // バイアス = (1 - 正規化エントロピー) × 100
  const rawScore = ((1 - kwEntropy) * 0.6 + (1 - authEntropy) * 0.4) * 100;
  const biasScore = Math.min(100, Math.round(rawScore));

  return { topKeywords, topAuthors, biasScore, totalTweets: tweets.length };
}
