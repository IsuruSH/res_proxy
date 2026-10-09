import { fetchNoticesHtmlRaw } from "./fosmis.service.js";
import { parseNoticesHtml } from "../utils/notices.js";

/**
 * Global notices store.
 *
 * Notices are identical for every student, so there is exactly one copy in
 * memory — not one per session. That matters a lot: the FOSMIS notices page is
 * 6000+ rows and can take 45 s to arrive, so fetching it per student was both
 * the slowest thing the server did and the main source of event-loop stalls.
 *
 * Three properties hold this together:
 *   - **One global entry, long TTL.** Notices change a few times a week, so a
 *     refresh every 15 min is plenty.
 *   - **In-flight deduplication.** If 10 students open the dashboard while the
 *     cache is cold, they share ONE upstream fetch instead of starting 10.
 *   - **Stale-on-error.** If FOSMIS is unreachable we serve the last known
 *     notices rather than failing the dashboard.
 */

const TTL_MS = 15 * 60 * 1000; // 15 minutes

/** @type {{ data: object, fetchedAt: number } | null} */
let store = null;

/** @type {Promise<object> | null} */
let inFlight = null;

function isFresh() {
  return store !== null && Date.now() - store.fetchedAt < TTL_MS;
}

async function refresh(phpsessid) {
  const html = await fetchNoticesHtmlRaw(phpsessid);
  // Parsed ONCE per refresh. The previous implementation re-parsed the whole
  // accumulated document on every network chunk, which was O(n^2) synchronous
  // CPU and starved every other request on the server.
  const data = parseNoticesHtml(html);
  store = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Get the notice board, refreshing from FOSMIS only when the cache is stale.
 * Any authenticated session can drive a refresh, since the content is shared.
 */
export async function getNotices(phpsessid) {
  if (isFresh()) return store.data;

  // Someone else is already refreshing — wait for their result.
  if (inFlight) return inFlight;

  inFlight = refresh(phpsessid)
    .catch((err) => {
      // Serve stale data rather than breaking the dashboard.
      if (store) {
        const ageMin = Math.round((Date.now() - store.fetchedAt) / 60000);
        console.warn(
          `[notices] Refresh failed (${err.message}) — serving cached copy from ${ageMin} min ago`
        );
        return store.data;
      }
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Current store state, for diagnostics. */
export function noticesStats() {
  return {
    cached: store !== null,
    fresh: isFresh(),
    ageMs: store ? Date.now() - store.fetchedAt : null,
    recent: store ? store.data.recentNotices.length : 0,
    previous: store ? store.data.previousNotices.length : 0,
    refreshing: inFlight !== null,
  };
}
