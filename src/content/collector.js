// src/content/collector.js
// ─────────────────────────────────────────────────────────────────────────────
// IBC Content Script — v0.3.0
// 修正内容:
//   - /home かつ「おすすめ」タブのみ収集（フォロー中は除外）
//   - クリア後にDB接続をリセット → 収集が止まらないよう修正
//   - クリア時にメモリ上の既知IDセットもリセット → 再収集可能に
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  'use strict';

  const DB_NAME      = 'ibc_db';
  const DB_VERSION   = 1;
  const STORE_TWEETS = 'tweets';
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

  // ── ページ条件チェック ───────────────────────────────────────────────────────
  function isHomeline() {
    return location.pathname === '/home';
  }

  /**
   * 「おすすめ」タブが選択中かどうかを判定する。
   * Xは /home のまま aria-selected 属性でタブを切り替えるため DOM を見る。
   *
   * 判定ロジック（多段フォールバック）:
   *   1. aria-selected="true" のタブテキストが「おすすめ」か確認
   *   2. 該当要素が見つからない場合は true を返す（フォールバック＝収集継続）
   */
  function isForYouTab() {
    // role="tab" かつ aria-selected="true" の要素を探す
    const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!selectedTab) return true; // 判定不能 → 収集継続（安全側）

    const label = selectedTab.textContent.trim();
    // 「おすすめ」「For you」「For You」のいずれか
    return /^(おすすめ|For [Yy]ou)$/.test(label);
  }

  function shouldCollect() {
    return isHomeline() && isForYouTab();
  }

  // ── IDB ─────────────────────────────────────────────────────────────────────
  // DB接続をキャッシュする。クリア後はリセットして再取得する。
  let _dbCache = null;

  function openDB() {
    if (_dbCache) return Promise.resolve(_dbCache);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_TWEETS)) {
          const store = db.createObjectStore(STORE_TWEETS, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      req.onsuccess = () => { _dbCache = req.result; resolve(_dbCache); };
      req.onerror   = () => reject(req.error);
    });
  }

  async function saveBatch(tweets) {
    if (!tweets.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_TWEETS, 'readwrite');
      const store = tx.objectStore(STORE_TWEETS);
      tweets.forEach(t => store.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function clearTweets() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TWEETS, 'readwrite');
      tx.objectStore(STORE_TWEETS).clear();
      tx.oncomplete = () => {
        // ── 重要: クリア後にDB接続とメモリキャッシュをリセット ──────────────
        // これをしないとトランザクション状態が壊れたまま収集が止まる
        _dbCache = null;
        seenIds.clear();
        console.log('[IBC] DB cleared. seenIds reset. Ready to recollect.');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function fetchRecentTweets() {
    const db        = await openDB();
    const threshold = Date.now() - RETENTION_MS;
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_TWEETS, 'readonly');
      const index = tx.objectStore(STORE_TWEETS).index('savedAt');
      const req   = index.getAll(IDBKeyRange.lowerBound(threshold));
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // ── メモリ上の重複管理セット ─────────────────────────────────────────────────
  // DBへの問い合わせを避けるため、収集済みIDをメモリでも管理する。
  // clearTweets() 時に一緒にリセットされる。
  const seenIds = new Set();

  // ── ハッシュ関数 ─────────────────────────────────────────────────────────────
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 200); i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  // ── ジャンル分類 ─────────────────────────────────────────────────────────────
  const GENRES = [
    "政治（選挙・政策・政府・議会）",
    "経済（企業・ビジネス・市場・金融・商品価格）",
    "社会（事件・犯罪・差別・格差・社会問題・人間ドラマ）",
    "国際（海外ニュース・外交・他国の政治）",
    "テクノロジー（IT・AI・ガジェット・家電・ソフトウェア・アプリ）",
    "科学（宇宙・医療・生物・物理・化学・自然科学）",
    "エンタメ（映画・ドラマ・アニメ・ゲーム・音楽・芸能・お笑い・漫画）",
    "スポーツ（試合・選手・競技・スポーツニュース）",
    "ライフスタイル（食・旅・趣味・ファッション・美容・個人の日常・DIY）",
    "その他（上記に当てはまらないもの・短すぎて判断できないもの）"
  ];

  const GENRE_RESET_INTERVAL = 25;
  let genreSession = null;
  let genreSessionCount = 0;

  async function getGenreSession() {
    if (!window.LanguageModel) return null;
    if (!genreSession || genreSessionCount >= GENRE_RESET_INTERVAL) {
      if (genreSession) genreSession.destroy();
      genreSession = await LanguageModel.create();
      genreSessionCount = 0;
    }
    return genreSession;
  }

  async function classifyGenre(text) {
    // 日本語・英語のみ対象
    const hasJP = /[\u3040-\u9FFF]/.test(text);
    const hasEN = /[a-zA-Z]{3,}/.test(text);
    if (!hasJP && !hasEN) return null;

    try {
      const session = await getGenreSession();
      if (!session) return null;

      const result = await session.prompt(
        `次の投稿のジャンルを以下のリストから必ず1つ選んでください。
リスト以外のジャンルは絶対に使わないでください。
リスト：${GENRES.join('、')}
厳守：カッコなしのジャンル名のみ回答。説明不要。

投稿：${text.slice(0, 100)}`
      );
      genreSessionCount++;
      // カッコを除去してジャンル名のみ返す
      return result.trim().replace(/（.*?）/g, '').trim();
    } catch (e) {
      console.warn('[IBC] Genre classification error:', e);
      return null;
    }
  }

  // ── 広告チェック ─────────────────────────────────────────────────────────────
  function isAdTweet(article) {
    const spans = [...article.querySelectorAll('span')];
    return spans.some(s =>
      s.textContent.trim() === 'Ad' ||
      s.textContent.trim() === '広告'
    );
  }

  // ── DOM セレクタ ─────────────────────────────────────────────────────────────
  const SELECTORS = {
    tweetArticle: [
      'article[data-testid="tweet"]',
      'article[role="article"]',
      'div[data-testid="tweet"]',
    ],
    tweetText: [
      '[data-testid="tweetText"]',
      '[lang] > span',
      '.tweet-text',
    ],
    authorName: [
      '[data-testid="User-Name"] span:first-child',
      '[data-testid="User-Names"] span',
      'a[role="link"] > div > div > span > span',
    ],
    authorHandle: [
      '[data-testid="User-Name"] a[href^="/"]',
      'a[tabindex="-1"][href^="/"]',
    ],
    authorAvatar: [
      '[data-testid^="UserAvatar-Container"] img',
      'a[role="link"] img[src*="profile_images"]',
    ],
    tweetLink: [
      'a[href*="/status/"]',
    ],
  };

  function querySelector(root, selectorList) {
    for (const sel of selectorList) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function extractTweet(article) {
    if (isAdTweet(article)) return null;
    const textEl   = querySelector(article, SELECTORS.tweetText);
    const nameEl   = querySelector(article, SELECTORS.authorName);
    const handleEl = querySelector(article, SELECTORS.authorHandle);

    const avatarEl = querySelector(article, SELECTORS.authorAvatar);
    const linkEl   = querySelector(article, SELECTORS.tweetLink);
    const tweetUrl = linkEl ? linkEl.href : '';
    const tweetId  = tweetUrl.match(/\/status\/(\d+)/)?.[1] || '';

    const text   = textEl   ? textEl.innerText.trim()                : '';
    const name   = nameEl   ? nameEl.innerText.trim()                : '';
    const handle = handleEl ? (handleEl.href || '').split('/').pop() : '';
    const avatar = avatarEl ? avatarEl.src : '';

    if (!text || text.length < 5) return null;

    const author = handle ? `@${handle}` : (name || '不明');
    const id     = simpleHash(author + text.slice(0, 100));

    return { id, author, text, avatar, tweetId, savedAt: Date.now() };
  }

  // ── バッチキュー ─────────────────────────────────────────────────────────────
  const pendingQueue = [];
  let flushTimer = null;

  async function enqueue(tweet) {
    // メモリ上で重複チェック（DB問い合わせ不要）
    if (seenIds.has(tweet.id)) return;
    seenIds.add(tweet.id);
    tweet.genre = await classifyGenre(tweet.text);
    pendingQueue.push(tweet);
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 2000);
    }
  }

  async function flush() {
    flushTimer = null;
    if (!pendingQueue.length) return;
    const batch = pendingQueue.splice(0);
    try {
      await saveBatch(batch);
    } catch (e) {
      console.warn('[IBC] DB save error:', e);
      // 保存失敗した場合はseenIdsから除去して再試行可能にする
      batch.forEach(t => seenIds.delete(t.id));
    }
  }

  // 保存済みツイートのアバターURLを後から補完する
  async function updateAvatars() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const avatarUpdates = new Map();

    for (const article of articles) {
      const handleEl = querySelector(article, SELECTORS.authorHandle);
      const avatarEl = querySelector(article, SELECTORS.authorAvatar);
      if (!handleEl || !avatarEl || !avatarEl.src) continue;

      const handle = '@' + (handleEl.href || '').split('/').pop();
      if (handle && avatarEl.src && !avatarEl.src.includes('default_profile')) {
        avatarUpdates.set(handle, avatarEl.src);
      }
    }

    if (!avatarUpdates.size) return;

    const db = await openDB();
    const tx = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    const req = store.getAll();

    req.onsuccess = () => {
      const tweets = req.result;
      let updated = 0;
      for (const tweet of tweets) {
        if (!tweet.avatar && avatarUpdates.has(tweet.author)) {
          tweet.avatar = avatarUpdates.get(tweet.author);
          store.put(tweet);
          updated++;
        }
      }
      if (updated > 0) console.log(`[IBC] Updated ${updated} avatars.`);
    };
  }

  // ── スキャン ─────────────────────────────────────────────────────────────────
  function scanVisible() {
    if (!shouldCollect()) return;

    for (const sel of SELECTORS.tweetArticle) {
      const articles = document.querySelectorAll(sel);
      if (!articles.length) continue;
      for (const article of articles) {
        const tweet = extractTweet(article);
        if (tweet) enqueue(tweet);
      }
      break;
    }
    // 画像の遅延読み込みを考慮して1秒後にアバターを補完
    setTimeout(updateAvatars, 1000);
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────
  const observer = new MutationObserver((mutations) => {
    if (!isHomeline()) return;
    let changed = false;
    for (const m of mutations) {
      if (m.addedNodes.length) { changed = true; break; }
    }
    if (changed) scanVisible();
  });

  function startObserving() {
    if (!isHomeline()) {
      console.log('[IBC] Not /home — observer paused.');
      return;
    }
    const target = document.querySelector('[data-testid="primaryColumn"]')
                || document.querySelector('main')
                || document.body;
    observer.observe(target, { childList: true, subtree: true });
    scanVisible();
    console.log('[IBC] Observer started on /home');
  }

  function stopObserving() {
    observer.disconnect();
    console.log('[IBC] Observer stopped.');
  }

  // ── SPA ナビゲーション ────────────────────────────────────────────────────────
  let lastPathname = location.pathname;

  function onNavigate() {
    const current = location.pathname;
    if (current === lastPathname) return;
    lastPathname = current;
    stopObserving();
    if (isHomeline()) {
      setTimeout(startObserving, 1500);
    }
  }

  const origPushState    = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState    = (...a) => { origPushState(...a);    onNavigate(); };
  history.replaceState = (...a) => { origReplaceState(...a); onNavigate(); };
  window.addEventListener('popstate', onNavigate);

  // ── 起動 ─────────────────────────────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'PRUNE_OLD_TWEETS' }).catch(() => {});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }

  console.log('[IBC] Collector v0.3.0 loaded —', location.pathname);

  // ── メッセージ受信 ────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'GET_TWEETS') {
      fetchRecentTweets()
        .then(tweets => sendResponse({ success: true, tweets }))
        .catch(err   => sendResponse({ success: false, tweets: [], error: String(err) }));
      return true;
    }

    if (message.type === 'CLEAR_TWEETS') {
      clearTweets()
        .then(()  => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    if (message.type === 'GET_STATUS') {
      sendResponse({ success: true, isForYou: isForYouTab() });
      return true;
    }

  });

})();
