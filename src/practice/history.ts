// Practice history lives in two places:
//
//   * an in-memory list per routine, which is what the Practice tab shows and
//     which is cleared whenever you leave the tab (see PracticePanel), and
//   * a long-term log in localStorage, appended to here and never cleared on a
//     tab switch, so progress over weeks survives.
//
// Storage can be unavailable (private mode, blocked site data, quota), so every
// access is guarded.

/** localStorage keys for the long-term log, one per routine. */
export const LOG_KEYS = {
  '3nps': 'overture.practice.3nps.history',
  improv: 'overture.practice.improv.history',
} as const;

export type LogName = keyof typeof LOG_KEYS;

export function loadList<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function storeList<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage unavailable: the long-term log just won't persist.
  }
}

/**
 * Append one entry to a routine's long-term log, newest first, trimmed to
 * `limit`. When `id` is given, an earlier entry with the same id is replaced,
 * so re-timing a key updates that session in place instead of duplicating it.
 */
export function appendToLog<T>(key: string, entry: T, limit: number, id?: number): void {
  const existing = loadList<T & { id?: number }>(key);
  const kept = id === undefined ? existing : existing.filter((e) => e.id !== id);
  storeList(key, [entry, ...kept].slice(0, limit));
}

/** Everything in the long-term log, keyed by routine. */
export function readLog(): Record<LogName, unknown[]> {
  return {
    '3nps': loadList(LOG_KEYS['3nps']),
    improv: loadList(LOG_KEYS.improv),
  };
}

/** The whole log as pretty-printed JSON. */
export function logAsJson(): string {
  return JSON.stringify({ exported: new Date().toISOString(), ...readLog() }, null, 2);
}

/** Save the whole log to a file the browser downloads. */
export function downloadLog(): void {
  const blob = new Blob([logAsJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overture-practice-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Erase the long-term log (both routines). */
export function clearLog(): void {
  for (const key of Object.values(LOG_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do: storage is unavailable, so there is nothing stored.
    }
  }
}

/**
 * Expose the log on `window.overture` so it can be inspected from the browser
 * console without going through the UI.
 */
export function installLogConsoleApi(): void {
  const api = { read: readLog, json: logAsJson, download: downloadLog, clear: clearLog };
  (window as unknown as { overture?: unknown }).overture = api;
}
