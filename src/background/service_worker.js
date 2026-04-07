// src/background/service_worker.js
// ─────────────────────────────────────────────────────────────────────────────
// IBC Service Worker (Manifest V3)
// 役割：
//   1. 古いツイートの定期削除（Alarms API）
//   2. Content Script からの prune リクエスト受信
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME      = 'ibc_db';
const DB_VERSION   = 1;
const STORE_TWEETS = 'tweets';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ALARM_NAME   = 'ibc_prune';

// ── IDB ヘルパー ─────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TWEETS)) {
        const store = db.createObjectStore(STORE_TWEETS, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function pruneOldTweets() {
  const threshold = Date.now() - RETENTION_MS;
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_TWEETS, 'readwrite');
    const index = tx.objectStore(STORE_TWEETS).index('savedAt');
    const range = IDBKeyRange.upperBound(threshold);
    const req   = index.openCursor(range);
    let   count = 0;

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); count++; cursor.continue(); }
    };
    tx.oncomplete = () => {
      if (count) console.log(`[IBC SW] Pruned ${count} old tweets.`);
      resolve(count);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ── Alarm 設定（1日1回） ─────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 60 * 6, // 6時間ごと
  });
  console.log('[IBC SW] Installed. Prune alarm set.');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) pruneOldTweets();
});

// ── Content Script / Popup からのメッセージ受信 ───────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PRUNE_OLD_TWEETS') {
    pruneOldTweets()
      .then(count => sendResponse({ success: true, pruned: count }))
      .catch(err  => sendResponse({ success: false, error: String(err) }));
    return true; // 非同期 sendResponse のために必須
  }

  if (message.type === 'GET_STATS') {
    // Popup が直接 IDB を開けない場合のフォールバック用
    // 通常は Popup 側で直接 IDB を開く
    sendResponse({ success: true });
    return false;
  }

});

console.log('[IBC SW] Service Worker loaded.');

// ── バッジ制御 ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '○' });
  chrome.action.setBadgeBackgroundColor({ color: '#888888' });
  chrome.action.setTitle({ title: 'IBC – 待機中' });
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateBadge(tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateBadge(tab.url);
  }
});

function updateBadge(url) {
  const isHome = url && url.includes('x.com/home');
  if (isHome) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#228833' });
    chrome.action.setTitle({ title: 'IBC – チェック中' });
  } else {
    chrome.action.setBadgeText({ text: '○' });
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    chrome.action.setTitle({ title: 'IBC – 待機中' });
  }
}

// ── サイドパネル設定 ──────────────────────────────────────────────────────────
// アイコンクリック時の動作（サイドパネル or ポップアップ）
// デフォルトはポップアップ（manifest.jsonのdefault_popupが有効）
// サイドパネルはChromeのサイドパネルボタンから開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
