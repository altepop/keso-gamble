import { hydrateState } from './engine.js?v=web-7384c361c5d7c279';
import { loadState, saveState } from './storage.js?v=web-7384c361c5d7c279';

// Read, modify and save under the same origin-wide lock. Never save a stale view.
export function createStore({load = loadState, save = saveState, locks = globalThis.navigator?.locks, onChange = () => {}, onVolatile = () => {}} = {}) {
  let state = hydrateState(load());
  let volatile = false;
  let queue = Promise.resolve();
  function publish(next) { state = next; onChange(state); }
  function refresh() {
    if (!volatile) publish(hydrateState(load()));
  }
  function transact(update) {
    const run = () => {
      const base = volatile ? state : hydrateState(load() ?? state);
      publish(base);
      const next = structuredClone(base);
      const result = update(next);
      if (result instanceof Promise) throw new Error('状態更新は同期処理で指定してください');
      if (JSON.stringify(next) !== JSON.stringify(base)) {
        if (!volatile && !locks?.request) throw new Error('この環境では安全な同時保存を利用できません。HTTPS対応ブラウザで開いてください');
        if (!volatile && !save(next)) { volatile = true; onVolatile(); }
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
