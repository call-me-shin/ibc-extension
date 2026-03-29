// src/lib/db.js
// IndexedDB wrapper using raw IDB API (no external deps needed here)
// Dexie.min.js handles the heavy lifting; this file is our schema definition.

/**
 * IBC Database Schema
 *
 * Store: "tweets"
 *   - id        : string  (hash of author+text, dedup key)
 *   - author    : string  (display name or @handle)
 *   - text      : string  (raw tweet text)
 *   - savedAt   : number  (Date.now())
 *
 * Store: "meta"
 *   - key       : string
 *   - value     : any
 */

export const DB_NAME    = 'ibc_db';
export const DB_VERSION = 1;
export const STORE_TWEETS = 'tweets';
export const STORE_META   = 'meta';

/** 7 days in milliseconds */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Open (or create) the IDB database.
 * Returns a Promise<IDBDatabase>.
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_TWEETS)) {
        const store = db.createObjectStore(STORE_TWEETS, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Bulk-upsert tweets (ignore duplicates via keyPath dedup).
 */
export async function saveTweets(tweetsArray) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    tweetsArray.forEach(t => store.put(t));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Get all tweets saved within the retention window.
 */
export async function getRecentTweets() {
  const db        = await openDB();
  const threshold = Date.now() - RETENTION_MS;

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_TWEETS, 'readonly');
    const store = tx.objectStore(STORE_TWEETS);
    const index = store.index('savedAt');
    const range = IDBKeyRange.lowerBound(threshold);
    const req   = index.getAll(range);

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Delete tweets older than the retention window.
 */
export async function pruneOldTweets() {
  const db        = await openDB();
  const threshold = Date.now() - RETENTION_MS;

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_TWEETS, 'readwrite');
    const store = tx.objectStore(STORE_TWEETS);
    const index = store.index('savedAt');
    const range = IDBKeyRange.upperBound(threshold);
    const req   = index.openCursor(range);

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
