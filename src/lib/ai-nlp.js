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

const CHUNK_SIZE = 30;
const MAX_TOKENS = 100;

export async function buildNounSet(allTokens, tweetCount = 0) {
  if (!allTokens.length) return new Set();

  // キャッシュがあれば即座に返す
  const cached = await loadCache();
  if (cached && cached.nouns && cached.nouns.length > 0) {
    console.log('[IBC ai-nlp] using cached noun set');
    return new Set(cached.nouns);
  }

  // 頻度集計して上位 MAX_TOKENS に絞る
  const freq = new Map();
  for (const t of allTokens) freq.set(t, (freq.get(t) || 0) + 1);
  const topTokens = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOKENS)
    .map(([t]) => t);

  try {
    const session = await getSession();
    if (!session) return new Set(topTokens);

    const nouns = [];
    for (let i = 0; i < topTokens.length; i += CHUNK_SIZE) {
      const chunk = topTokens.slice(i, i + CHUNK_SIZE);
      const prompt =
        'From the following word list, return only the nouns as a JSON array. ' +
        'Include proper nouns, technical terms, and hashtags. ' +
        'Return only the JSON array, no explanation.\n\n' +
        JSON.stringify(chunk);
      const raw = await session.prompt(prompt);
      const match = raw.match(/\[[\s\S]*?\]/);
      if (!match) {
        nouns.push(...chunk);
        continue;
      }
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) nouns.push(...parsed);
      } catch {
        nouns.push(...chunk);
      }
    }

    await saveCache({ nouns, tweetCount });
    console.log('[IBC ai-nlp] noun set cached');
    return new Set(nouns);

  } catch (e) {
    console.warn('[IBC ai-nlp] fallback:', e.message);
    _session = null;
    return new Set(topTokens);
  }
}

export async function filterNouns(tokens) {
  const nounSet = await buildNounSet(tokens);
  return tokens.filter(t => nounSet.has(t));
}
