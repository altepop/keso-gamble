export const KEY = 'keso-exchange-v0.2';
export const LEGACY_KEY = 'keso-exchange-prototype-v1';
// Storage may be blocked or full. Keep the current session usable in either case.
export function loadState(storage) {
  try { storage ??= globalThis.localStorage; } catch { return null; }
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const value = storage.getItem(key);
      if (value) { const parsed = JSON.parse(value); if (parsed) return parsed; }
    } catch { /* Try the legacy record when the current record is unreadable. */ }
  }
  return null;
}
export function saveState(state, storage) {
  try { storage ??= globalThis.localStorage; storage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
