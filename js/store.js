import { hydrateState } from './engine.js?v=web-a627724e8a74f1e5';
import { loadState, saveState } from './storage.js?v=web-a627724e8a74f1e5';

// Read, modify and save under the same origin-wide lock. Never save a stale view.
// localStorage alone is not enough across tabs: another tab's cached copy can still be the old value after the lock
// is handed over (Chromium updates other renderers asynchronously), so a second tab could overwrite the first tab's
// order. Inside the lock the authoritative read and write go to IndexedDB, whose transactions are ordered by the
// browser; localStorage stays as the synchronous copy used at startup.
const DB_NAME = 'keso-demo-state', DB_STORE = 'state', DB_KEY = 'current';
export function indexedDbDurable(idb = globalThis.indexedDB) {
  if (!idb?.open) return null;
  let opening = null;
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch(error => { opening = null; throw error; });
  const run = async (mode, use) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode), request = use(tx.objectStore(DB_STORE));
      let value;
      if (request) request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
  };
  return {
    async read() { const text = await run('readonly', store => store.get(DB_KEY)); return typeof text === 'string' ? JSON.parse(text) : null; },
    async write(next) { await run('readwrite', store => { store.put(JSON.stringify(next), DB_KEY); }); },
    async clear() { await run('readwrite', store => { store.delete(DB_KEY); }); },
  };
}
export function createStore({load = loadState, save = saveState, locks = globalThis.navigator?.locks, durable = indexedDbDurable(), onChange = () => {}, onVolatile = () => {}} = {}) {
  let state = hydrateState(load());
  let volatile = false;
  let queue = Promise.resolve();
  function publish(next) { state = next; onChange(state); }
  function refresh() {
    if (!volatile) publish(hydrateState(load()));
  }
  function transact(update) {
    const run = async () => {
      let stored = null;
      if (!volatile) {
        // IndexedDB failing (private mode, quota) falls back to localStorage for the rest of the session.
        if (durable) { try { stored = await durable.read(); } catch { durable = null; } }
        stored ??= load();
      }
      const base = volatile ? state : hydrateState(stored ?? state);
      publish(base);
      const next = structuredClone(base);
      const result = update(next);
      if (result instanceof Promise) throw new Error('状態更新は同期処理で指定してください');
      if (JSON.stringify(next) !== JSON.stringify(base)) {
        if (!volatile && !locks?.request) throw new Error('この環境では安全な同時保存を利用できません。HTTPS対応ブラウザで開いてください');
        if (!volatile && !save(next)) { volatile = true; onVolatile(); }
        // If IndexedDB cannot take this write, drop its copy so no tab reads an older state from it.
        else if (!volatile && durable) { try { await durable.write(next); } catch { try { await durable.clear?.(); } catch {} durable = null; } }
      }
      publish(next);
      return result;
    };
    const task = queue.then(() => locks?.request ? locks.request('keso-exchange-state', run) : run());
    queue = task.catch(() => {});
    return task;
  }
  return { get state() { return state; }, refresh, transact };
}
