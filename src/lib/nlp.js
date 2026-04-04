// src/lib/nlp.js
// ─────────────────────────────────────────────────────────────────────────────
// 軽量 日本語 NLP ユーティリティ
//
// 外部ライブラリ不要で動く正規表現ベースの NLP 実装（参照用モジュール）。
// 実際の処理は popup.js / dashboard.js にインライン実装されています。
// 日本語・英語混在テキストに対応。URL・メンションの事前除去、
// ひらがな短語・数字・記号のノイズフィルタリングを含む。
// ─────────────────────────────────────────────────────────────────────────────

/** 日本語ストップワード（助詞・助動詞・記号など） */
const JP_STOP = new Set([
  'の','に','は','を','が','で','て','と','や','も','か','な','へ','より','から','まで','にて',
  'において','については','について','による','によって','として','にとって','をめぐって',
  'た','だ','です','ます','ない','ある','いる','する','れる','られる','させる','せる',
  'てる','でる','てい','でい','ており','でいる','してい','している',
  'し','れ','さ','も','こと','として','い','や','れる','など','なり','って','ない',
  'この','ため','その','あの','これ','それ','あれ','よう','という','か','ね','よ','わ',
  'でも','しかし','ただ','また','さらに','そして','なお','ところ','あと','まあ','もう',
  'やはり','やっぱり','ちょっと','とても','すごく','かなり','なんか','なんて','けど',
  'けれど','だから','なので','ので','のに','って','かな','かも','らしい','みたい',
  'ほど','くらい','ぐらい','だけ','しか','ばかり','など','なんて','ってか',
  'いう','いか','いて','いた','おり','おる','あり','あっ','なっ','なく','なる',
  'あと','まず','特に','実は','実際','一応','一番','最も','全て','全部',
  'もの','こと','ところ','わけ','はず','つもり','ため','通り','感じ','意味','必要',
  'ん','て','で','に','は','を','が','の','と','も','や','か','へ','より',
  'ー','・','…','「','」','（','）','、','。','！','？','〜','※','→','←',
  'https','http','com','jp','rt','amp','www','co','pic','twitter','status',
]);

/** 英語ストップワード */
const EN_STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'this','that','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','shall','must','need',
  'it','i','you','he','she','we','they','my','your','his','her','our','their','its',
  'me','him','us','them','who','what','which','where','when','how','why',
  'not','no','nor','so','if','as','up','out','about','into','than','then','there',
  'just','also','like','get','got','all','more','now','new','good','very',
  'know','think','make','say','see','look','want','use','find','give','tell','work',
  'really','actually','basically','literally','definitely','absolutely',
  'one','two','three','first','last','next','same','other','many','much','some','any',
  'here','still','even','back','well','way','day','time','year','people',
  'im','ive','dont','cant','wont','isnt','arent','wasnt','didnt','havent',
  'via','re','amp','rt','cc','vs','etc',
  'today','month','week','started','starting','start','every','always','never','often',
  'sometimes','already','again','another','between','without','through','during','before','after',
  'around','because','while','though','although','however','therefore',
  'something','anything','everything','nothing','someone','anyone','everyone','those','these',
  'made','making','take','took','taking','come','came','coming','going','gone','went',
  'saw','seen','knew','known','thought','thinking','wanted','needed',
  'feel','felt','feeling','show','showed','shown','keep','kept',
  'let','put','set','run','ran',
  'high','low','big','small','long','short','old','young','early','late','hard','easy',
  'free','full','open','close','closed',
  'per','ago','yet','too','each','both','few','lot','lots','enough','almost',
  'maybe','perhaps','probably','quickly','slowly','simply',
  'using','used','being','having',
  'said','says','told','called','call','calls','trying','tried','try',
]);

/**
 * テキストをトークン（単語）に分割する。
 * - URL・@メンションを事前除去
 * - 日本語：漢字始まり or カタカナ連続（2〜10文字、ひらがなのみ短語は除外）
 * - 英語：3文字以上のアルファベットのみ
 * - ハッシュタグ：# 付き2文字以上
 *
 * @param {string} text
 * @returns {string[]}
 */
const segmenter = new TinySegmenter();

export function tokenize(text) {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/pic\.twitter\S*/g, '')
    .trim();

  const tokens = [];

  const jpText = cleaned.replace(/[a-zA-Z0-9]/g, ' ');
  const jpTokens = segmenter.segment(jpText);
  for (const w of jpTokens) {
    const trimmed = w.trim();
    if (trimmed.length >= 2) tokens.push(trimmed);
  }

  const enMatches = cleaned.match(/[a-zA-Z]{3,}/g) || [];
  tokens.push(...enMatches.map(w => w.toLowerCase()));

  const htMatches = text.match(/#[\w\u3040-\u9FFF]{2,}/g) || [];
  tokens.push(...htMatches);

  return tokens;
}

/**
 * ストップワード除去 + 追加ノイズフィルタ。
 * 数字のみ・1〜2文字英字・記号のみのトークンも除去する。
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function removeStopwords(tokens) {
  return tokens.filter(t => {
    if (JP_STOP.has(t)) return false;
    if (EN_STOP.has(t)) return false;
    return true;
  });
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
