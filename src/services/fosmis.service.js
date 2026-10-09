import fetch from "node-fetch";
import tough from "tough-cookie";
import fetchCookie from "fetch-cookie";
import config from "../config/index.js";
import {
  cacheGet,
  cacheSet,
  cacheKey,
} from "./cache.service.js";

// ---------------------------------------------------------------------------
// Per-request cookie jar factory (avoids cross-session contamination)
// ---------------------------------------------------------------------------

function makeFetchWithCookies() {
  const jar = new tough.CookieJar();
  return { jar, fetch: fetchCookie(fetch, jar) };
}

// Shared headers sent on every FOSMIS fetch
const FOSMIS_HEADERS = {
  Referer: "https://paravi.ruh.ac.lk/fosmis/",
};

const REQUEST_TIMEOUT_MS = 15000;
const NOTICES_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;

// Login gets a longer per-attempt budget but fewer attempts. FOSMIS has been
// observed taking 18 s just to send headers, and a login that times out shows
// the user "invalid credentials" — so it is worth waiting longer. Fewer retries
// keeps the worst case (~51 s) inside the platform's request timeout.
const LOGIN_TIMEOUT_MS = 25000;
const LOGIN_RETRIES = 1;

/** Thrown when FOSMIS could not be reached — as opposed to rejecting credentials. */
export class FosmisUnreachableError extends Error {
  constructor(message) {
    super(message);
    this.name = "FosmisUnreachableError";
  }
}

/**
 * Robust fetch wrapper for FOSMIS.
 * Implements timeouts, duration logging, and retries for transient network errors.
 */
async function robustFosmisFetch(
  url,
  options = {},
  fetchFn = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxRetries = MAX_RETRIES
) {
  let attempt = 0;
  const start = Date.now();

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      attempt++;
      const response = await fetchFn(url, {
        ...options,
        signal: controller.signal,
      });

      const duration = Date.now() - start;
      if (attempt > 1) {
        console.log(`[FOSMIS] ${url} succeeded on attempt ${attempt} (${duration}ms)`);
      } else if (duration > 2000) {
        console.warn(`[FOSMIS] Slow response from ${url}: ${duration}ms`);
      }

      return response;
    } catch (err) {
      const duration = Date.now() - start;
      const isTransient =
        err.name === "AbortError" ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message.includes("socket hang up");

      if (isTransient && attempt <= maxRetries) {
        console.warn(
          `[FOSMIS] Attempt ${attempt} failed for ${url} (${err.message}). Retrying...`
        );
        // Small backoff
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      console.error(
        `[FOSMIS] Request failed after ${attempt} attempts: ${url} (${err.message})`
      );
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// Login — not cached (unique per user)
// ---------------------------------------------------------------------------

/**
 * Authenticate against FOSMIS and return the PHP session ID.
 *
 * Returns null when FOSMIS actively rejects the credentials.
 * Throws `FosmisUnreachableError` when FOSMIS could not be reached at all —
 * the caller must distinguish these, because reporting a timeout as "invalid
 * credentials" sends users off to reset a password that was never wrong.
 */
export async function getSessionAndLogin(username, password) {
  const { jar, fetch: fetchWithCookies } = makeFetchWithCookies();

  try {
    // Step 1 – Hit index.php to obtain a session cookie
    await robustFosmisFetch(
      `${config.fosmisBaseUrl}/index.php`,
      {},
      fetchWithCookies,
      LOGIN_TIMEOUT_MS,
      LOGIN_RETRIES
    );

    const cookies = await jar.getCookies(`${config.fosmisBaseUrl}/index.php`);
    const sessionCookie = cookies.find((c) => c.key === "PHPSESSID");
    const sessionId = sessionCookie ? sessionCookie.value : null;

    // Step 2 – POST credentials to login.php
    //
    // The body MUST be encoded. Interpolating the raw password breaks every
    // account whose password contains "&" (truncated at the separator) or "+"
    // (decoded as a space) — a silent, permanent login failure for that user.
    // The cookie is handled by the jar in `fetchWithCookies`, not by hand.
    await robustFosmisFetch(
      `${config.fosmisBaseUrl}/login.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${config.fosmisBaseUrl}/index.php`,
          Origin: "https://paravi.ruh.ac.lk",
        },
        body: new URLSearchParams({ uname: username, upwd: password }).toString(),
      },
      fetchWithCookies,
      LOGIN_TIMEOUT_MS,
      LOGIN_RETRIES
    );

    // Step 3 – Verify the login actually succeeded.
    // FOSMIS answers 200 even when the credentials were wrong, so the status
    // code tells us nothing; the only signal is whether we got the login form back.
    const verifyRes = await robustFosmisFetch(
      `${config.fosmisBaseUrl}/index.php`,
      {},
      fetchWithCookies,
      LOGIN_TIMEOUT_MS,
      LOGIN_RETRIES
    );
    const verifyHtml = await verifyRes.text();

    if (
      verifyHtml.includes('name="uname"') ||
      verifyHtml.includes("login.php")
    ) {
      console.warn("[LOGIN] Credentials rejected by FOSMIS");
      return null;
    }

    // Logged in, but we never saw a PHPSESSID — nothing downstream can work
    // without it, and it is not the user's password that is at fault.
    if (!sessionId) {
      throw new FosmisUnreachableError("No PHPSESSID returned by FOSMIS");
    }

    // Cache the homepage HTML we already have (saves a round-trip later)
    cacheSet(cacheKey(sessionId, "homepage"), verifyHtml);

    return sessionId;
  } catch (err) {
    console.error("FOSMIS login error:", err.message);
    throw new FosmisUnreachableError(err.message);
  }
}

// ---------------------------------------------------------------------------
// Cached FOSMIS fetchers
// ---------------------------------------------------------------------------

/** Generic cached fetch helper. */
async function cachedFosmisHtml(phpsessid, url, key, timeoutMs) {
  const cached = cacheGet(key);
  if (cached) return cached;

  const response = await robustFosmisFetch(
    url,
    { headers: { Cookie: `PHPSESSID=${phpsessid}`, ...FOSMIS_HEADERS } },
    fetch,
    timeoutMs
  );
  const html = await response.text();
  cacheSet(key, html);
  return html;
}

/**
 * Fetch the authenticated FOSMIS homepage HTML.
 */
export async function fetchHomepageHtml(phpsessid) {
  const key = cacheKey(phpsessid, "homepage");
  return cachedFosmisHtml(
    phpsessid,
    `${config.fosmisBaseUrl}/index.php`,
    key
  );
}

/**
 * Fetch the course registration HTML page from FOSMIS.
 */
export async function fetchCourseRegistrationHtml(phpsessid) {
  const key = cacheKey(phpsessid, "courseReg");
  return cachedFosmisHtml(
    phpsessid,
    `${config.fosmisBaseUrl}/index.php?view=admin&admin=1`,
    key
  );
}

/**
 * Fetch the FOSMIS notices page HTML.
 *
 * Deliberately NOT session-cached: notices are identical for every student, so
 * notices.service.js holds a single global copy of the *parsed* result instead.
 * Caching raw HTML per session meant every student pulled all 6000+ rows again.
 */
export async function fetchNoticesHtmlRaw(phpsessid) {
  const response = await robustFosmisFetch(
    `${config.fosmisBaseUrl}/forms/form_53_a.php`,
    { headers: { Cookie: `PHPSESSID=${phpsessid}`, ...FOSMIS_HEADERS } },
    fetch,
    NOTICES_TIMEOUT_MS
  );
  return response.text();
}

/**
 * Fetch the results HTML page from FOSMIS for a given student / level.
 */
export async function fetchResultsHtml(phpsessid, stnum, rlevel) {
  const key = cacheKey(phpsessid, "results", stnum, rlevel);
  return cachedFosmisHtml(
    phpsessid,
    `${config.fosmisBaseUrl}/Ajax/result_filt.php?task=lvlfilt&stnum=${stnum}&rlevel=${rlevel}`,
    key
  );
}
