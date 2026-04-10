'use strict';

let _session = null;

// IndexedDB キャッシュキー
const CACHE_DB_NAME = 'ibc-ai-cache';
const CACHE_STORE   = 'noun-cache';
const CACHE_KEY     = 'nounSet';

// IndexedDB からキャッシュ読み込み
export async function loadCache() {
  return new Promise((resolve) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const get = tx.objectStore(CACHE_STORE).get(CACHE_KEY);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror   = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

// IndexedDB にキャッシュ保存
async function saveCache(data) {
  return new Promise((resolve) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(data, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

// IndexedDB のキャッシュを削除
export async function clearNounCache() {
  return new Promise((resolve) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

async function getSession() {
  if (_session) return _session;
  try {
    const availability = await LanguageModel.availability();
    if (availability === 'unavailable') return null;
    _session = await LanguageModel.create({
      expectedOutputLanguages: ['ja', 'en', 'es'],
    });
    return _session;
  } catch (e) {
    console.warn('[IBC ai-nlp] session init failed:', e.message);
    return null;
  }
}

export async function getAIStatus() {
  try {
    const availability = await LanguageModel.availability();
    if (availability === 'readily' || availability === 'available') return 'ready';
    if (availability === 'downloadable' || availability === 'downloading') return 'downloading';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

const CHUNK_SIZE = 20;

// tweets: { text, author, ... }[] を受け取り、名詞句の Set を返す
// TODO: update caller — popup.js / dashboard.js は tokens ではなく tweets 配列を渡すよう変更が必要
export async function buildNounSet(tweets) {
  if (!tweets || !tweets.length) return new Set();

  // キャッシュがあれば即座に返す
  const cached = await loadCache();
  if (cached && cached.nouns && cached.nouns.length > 0) {
    console.log('[IBC ai-nlp] using cached noun set');
    return new Set(cached.nouns);
  }

  try {
    const session = await getSession();
    if (!session) return new Set();

    const allNouns = new Set();

    for (let i = 0; i < tweets.length; i += CHUNK_SIZE) {
      const chunk = tweets.slice(i, i + CHUNK_SIZE);
      const postsText = chunk
        .map((t, idx) => `[${idx}] ${t.text}`)
        .join('\n');
      const prompt =
        'Extract all noun phrases from the following social media posts. ' +
        'Include compound nouns, proper nouns, product names, and hashtags as single units. ' +
        'Return only a JSON array of strings, no explanation.\n\n' +
        postsText;

      const raw = await session.prompt(prompt);
      // ```json フェンスを除去してからパース
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const match = stripped.match(/\[[\s\S]*\]/);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          for (const noun of parsed) allNouns.add(noun);
        }
      } catch {
        // パース失敗時はスキップ
      }
    }

    const nouns = [...allNouns];
    await saveCache({ nouns, tweetCount: tweets.length });
    console.log('[IBC ai-nlp] noun set cached');
    return allNouns;

  } catch (e) {
    console.warn('[IBC ai-nlp] AI extraction failed:', e.message);
    _session = null;
    return new Set();
  }
}
