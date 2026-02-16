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
const MAX_RETRIES = 2;

/**
 * Robust fetch wrapper for FOSMIS.
 * Implements timeouts, duration logging, and retries for transient network errors.
 */
async function robustFosmisFetch(url, options = {}, fetchFn = fetch) {
  let attempt = 0;
  const start = Date.now();

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

      if (isTransient && attempt <= MAX_RETRIES) {
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
 * Returns null on failure.
 */
export async function getSessionAndLogin(username, password) {
  const { jar, fetch: fetchWithCookies } = makeFetchWithCookies();

  try {
    // Step 1 – Hit index.php to obtain a session cookie
    await robustFosmisFetch(`${config.fosmisBaseUrl}/index.php`, {}, fetchWithCookies);

    const cookies = await jar.getCookies(`${config.fosmisBaseUrl}/index.php`);
    const sessionCookie = cookies.find((c) => c.key === "PHPSESSID");
    const sessionId = sessionCookie ? sessionCookie.value : null;

    // Step 2 – POST credentials to login.php
    await robustFosmisFetch(`${config.fosmisBaseUrl}/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${config.fosmisBaseUrl}/index.php`,
        Origin: "https://paravi.ruh.ac.lk",
      },
      Cookie: `PHPSESSID=${sessionId}`,
      body: `uname=${username}&upwd=${password}`,
    }, fetchWithCookies);

    // Step 3 – Verify the login actually succeeded.
    const verifyRes = await robustFosmisFetch(
      `${config.fosmisBaseUrl}/index.php`,
      { headers: { Cookie: `PHPSESSID=${sessionId}` } },
      fetchWithCookies
    );
    const verifyHtml = await verifyRes.text();

    if (
      verifyHtml.includes('name="uname"') ||
      verifyHtml.includes("login.php")
    ) {
      console.warn("[LOGIN] Credentials rejected by FOSMIS");
      return null;
    }

    // Cache the homepage HTML we already have (saves a round-trip later)
    cacheSet(cacheKey(sessionId, "homepage"), verifyHtml);

    return sessionId;
  } catch (err) {
    console.error("FOSMIS login error:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cached FOSMIS fetchers
// ---------------------------------------------------------------------------

/** Generic cached fetch helper. */
async function cachedFosmisHtml(phpsessid, url, key) {
  const cached = cacheGet(key);
  if (cached) return cached;

  const response = await robustFosmisFetch(url, {
    headers: { Cookie: `PHPSESSID=${phpsessid}`, ...FOSMIS_HEADERS },
  });
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

export async function fetchNoticesHtml(phpsessid) {
  const key = cacheKey(phpsessid, "notices");
  return cachedFosmisHtml(
    phpsessid,
    `${config.fosmisBaseUrl}/forms/form_53_a.php`,
    key
  );
}

/**
 * Fetch the FOSMIS notices page as a readable stream.
 */
export async function fetchNoticesStream(phpsessid) {
  const response = await robustFosmisFetch(`${config.fosmisBaseUrl}/forms/form_53_a.php`, {
    headers: { Cookie: `PHPSESSID=${phpsessid}`, ...FOSMIS_HEADERS },
  });
  return response.body;
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
