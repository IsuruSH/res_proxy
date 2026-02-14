/**
 * In-memory TTL cache for FOSMIS HTML responses.
 *
 * Keys are scoped per session + endpoint so different students never collide.
 * Entries auto-expire after `DEFAULT_TTL_MS` (5 min) — long enough that
 * navigating between pages is instant, short enough that a manual refresh
 * always picks up changes.
 *
 * Implementation: simple Map + lazy eviction on get().  A background sweep
 * runs every 60 s to prevent unbounded memory growth from abandoned sessions.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

/** @type {Map<string, { value: any, expiresAt: number }>} */
const store = new Map();

// Background sweep — remove expired entries to cap memory
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.expiresAt) store.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref(); // unref so it doesn't keep Node alive

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a cache key from parts.  E.g. `("abc123", "results", "12367", "4")`
 * → `"abc123:results:12367:4"`
 */
export function cacheKey(...parts) {
  return parts.filter(Boolean).join(":");
}

/**
 * Retrieve a cached value.  Returns `undefined` on miss or expiry.
 */
export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a value with an optional custom TTL.
 */
export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Delete a specific key (e.g. on logout).
 */
export function cacheDel(key) {
  store.delete(key);
}

/**
 * Delete all keys that start with a prefix (e.g. all keys for a session).
 */
export function cacheDelPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Return current cache stats (for debugging / health endpoint).
 */
export function cacheStats() {
  return { size: store.size };
}
