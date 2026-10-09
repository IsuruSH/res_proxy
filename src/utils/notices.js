import * as cheerio from "cheerio";
import config from "../config/index.js";

/**
 * Notices parsing for the FOSMIS notice board (forms/form_53_a.php).
 *
 * The page contains three tables:
 *   - Table 0: layout wrapper
 *   - Table 1: "Most Recent Notices"
 *   - Table 2: "Previous Notices" (6000+ rows — capped at PREVIOUS_LIMIT)
 *
 * Notices are identical for every student, so the parsed result is cached
 * globally by notices.service.js rather than per session.
 */

/** Previous notices are capped — nobody scrolls 6000 rows. */
export const PREVIOUS_LIMIT = 50;

/** Ids are only used as React keys client-side; keep the two lists disjoint. */
const RECENT_ID_BASE = 0;
const PREVIOUS_ID_BASE = 100;

/**
 * Determine file type from a URL/filename extension.
 */
export function getFileTypeFromUrl(href) {
  if (!href) return "other";
  const ext = href.split(".").pop().toLowerCase().split(/[?#]/)[0];
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "html" || ext === "htm") return "html";
  if (["png", "jpg", "jpeg", "gif", "jfif", "webp"].includes(ext)) {
    return ext === "jpeg" || ext === "jfif" ? "jpg" : ext;
  }
  return "other";
}

/**
 * Resolve a notice link to an absolute URL.
 * Links are relative to /forms/, so "../downloads/Notices/x.pdf" walks up one level.
 */
function resolveFileUrl(href, fosmisBaseUrl) {
  const baseUrl = fosmisBaseUrl.replace(/\/?$/, "/");
  const downloadsBase = `${baseUrl}downloads/Notices/`;

  if (href.startsWith("http")) return href;
  if (href.startsWith("../downloads/Notices/")) {
    return downloadsBase + href.replace("../downloads/Notices/", "");
  }
  if (href.startsWith("../")) return baseUrl + href.replace(/^\.\.\//, "");
  return `${baseUrl}forms/${href}`;
}

/**
 * Parse one notice table. `limit` of 0 means no limit.
 */
function parseNoticeTable($, table, idBase, limit, fosmisBaseUrl) {
  const notices = [];
  const rows = $(table).find("tr");

  // Row 0 is the header.
  for (let i = 1; i < rows.length; i++) {
    if (limit > 0 && notices.length >= limit) break;

    const cells = $(rows[i]).find("td");
    if (cells.length < 4) continue;

    const dateTimeRaw = $(cells.eq(1)).text().trim(); // "2026-02-13/21:29"
    const title = $(cells.eq(2)).text().trim();
    const href = $(cells.eq(3)).find("a").attr("href") || "";

    // Skip layout/footer rows that don't carry a real notice.
    if (!title || !href || !dateTimeRaw.includes("/")) continue;

    const [datePart, timePart] = dateTimeRaw.split("/");

    notices.push({
      id: idBase + notices.length + 1,
      date: datePart || "",
      time: timePart || "",
      title,
      fileUrl: resolveFileUrl(href, fosmisBaseUrl),
      fileType: getFileTypeFromUrl(href),
    });
  }

  return notices;
}

/**
 * Parse the FOSMIS notices page HTML.
 * Returns { recentNotices, previousNotices }.
 */
export function parseNoticesHtml(html, fosmisBaseUrl = config.fosmisBaseUrl) {
  const $ = cheerio.load(html);
  const tables = $("table");

  return {
    recentNotices:
      tables.length > 1
        ? parseNoticeTable($, tables[1], RECENT_ID_BASE, 0, fosmisBaseUrl)
        : [],
    previousNotices:
      tables.length > 2
        ? parseNoticeTable(
            $,
            tables[2],
            PREVIOUS_ID_BASE,
            PREVIOUS_LIMIT,
            fosmisBaseUrl
          )
        : [],
  };
}
