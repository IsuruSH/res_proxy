import fetch from "node-fetch";
import tough from "tough-cookie";
import fetchCookie from "fetch-cookie";
import config from "../config/index.js";

const cookieJar = new tough.CookieJar();
const fetchWithCookies = fetchCookie(fetch, cookieJar);

/**
 * Authenticate against FOSMIS and return the PHP session ID.
 * Returns null on failure.
 */
export async function getSessionAndLogin(username, password) {
  try {
    // Clear any stale cookies
    await cookieJar.removeAllCookies();

    // Step 1 – Hit index.php to obtain a session cookie
    await fetchWithCookies(`${config.fosmisBaseUrl}/index.php`);

    const cookies = await cookieJar.getCookies(
      `${config.fosmisBaseUrl}/index.php`
    );
    const sessionCookie = cookies.find((c) => c.key === "PHPSESSID");
    const sessionId = sessionCookie ? sessionCookie.value : null;

    // Step 2 – POST credentials to login.php (cookie jar handles PHPSESSID)
    await fetchWithCookies(`${config.fosmisBaseUrl}/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${config.fosmisBaseUrl}/index.php`,
        Origin: "https://paravi.ruh.ac.lk",
      },
      Cookie: `PHPSESSID=${sessionId}`,
      body: `uname=${username}&upwd=${password}`,
    });

    return sessionId;
  } catch (err) {
    console.error("FOSMIS login error:", err.message);
    return null;
  }
}

/**
 * Fetch the results HTML page from FOSMIS for a given student / level.
 */
export async function fetchResultsHtml(phpsessid, stnum, rlevel) {
  const url = `${config.fosmisBaseUrl}/Ajax/result_filt.php?task=lvlfilt&stnum=${stnum}&rlevel=${rlevel}`;

  const response = await fetch(url, {
    headers: {
      Cookie: `PHPSESSID=${phpsessid}`,
      Referer: "https://paravi.ruh.ac.lk/fosmis/",
    },
  });

  return response.text();
}
