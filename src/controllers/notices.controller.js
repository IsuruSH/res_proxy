import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { fetchNoticesHtml, fetchNoticesStream } from "../services/fosmis.service.js";
import { extractSession, parseNoticesHtml } from "../utils/gpa.js";
import config from "../config/index.js";

/**
 * GET /notices
 * Scrape the FOSMIS notices page and return structured JSON.
 */
export async function getNotices(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  try {
    const html = await fetchNoticesHtml(phpsessid);
    const data = parseNoticesHtml(html, config.fosmisBaseUrl);
    res.json(data);
  } catch (err) {
    console.error("GET /notices error:", err.message);
    res.status(500).json({ message: "Error fetching notices" });
  }
}

/**
 * GET /notices/stream
 * Stream notices to the client using Server-Sent Events (SSE).
 */
export async function getNoticesStream(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = await fetchNoticesStream(phpsessid);
    const downloadsBase = config.fosmisBaseUrl.replace(/\/?$/, "/downloads/Notices/");

    let fullHtml = "";
    const sentKeys = new Set();

    for await (const chunk of stream) {
      fullHtml += chunk.toString();

      // Parse current state of HTML
      const $ = cheerio.load(fullHtml);
      const tables = $("table");

      // Process Recent (Table 1)
      if (tables.length > 1) {
        const recent = parseNoticeTableFragment($, tables[1], 0, downloadsBase);
        for (const notice of recent) {
          const key = `recent-${notice.title}-${notice.date}-${notice.time}`;
          if (!sentKeys.has(key)) {
            res.write(`data: ${JSON.stringify({ type: "recent", notice })}\n\n`);
            sentKeys.add(key);
          }
        }
      }

      // Process Previous (Table 2) - limit to 50
      if (tables.length > 2) {
        const previous = parseNoticeTableFragment($, tables[2], 100, downloadsBase, 50);
        for (const notice of previous) {
          const key = `previous-${notice.title}-${notice.date}-${notice.time}`;
          if (!sentKeys.has(key)) {
            res.write(`data: ${JSON.stringify({ type: "previous", notice })}\n\n`);
            sentKeys.add(key);
          }
        }
      }
    }

    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (err) {
    console.error("GET /notices/stream error:", err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Error streaming notices" })}\n\n`);
    res.end();
  }
}

/**
 * Helper to parse a notice table from a cheerio instance and a specific table element.
 */
function parseNoticeTableFragment($, table, startId, downloadsBase, limit = 0) {
  const notices = [];
  const rows = $(table).find("tr");
  let count = 0;

  for (let i = 1; i < rows.length; i++) {
    if (limit > 0 && count >= limit) break;

    const cells = $(rows[i]).find("td");
    if (cells.length < 4) continue;

    const dateTimeRaw = $(cells.eq(1)).text().trim();
    const title = $(cells.eq(2)).text().trim();
    const linkEl = $(cells.eq(3)).find("a");
    const href = linkEl.attr("href") || "";

    // Check if row is complete. Incomplete rows will be skipped and picked up in next chunk.
    if (!title || !href || !dateTimeRaw.includes("/")) continue;

    const [datePart, timePart] = dateTimeRaw.split("/");

    let fileUrl = href;
    const baseUrl = config.fosmisBaseUrl.replace(/\/?$/, "/");

    if (href.startsWith("http")) {
      fileUrl = href;
    } else if (href.startsWith("../downloads/Notices/")) {
      fileUrl = downloadsBase + href.replace("../downloads/Notices/", "");
    } else if (href.startsWith("../")) {
      // Goes to root of the portal
      fileUrl = baseUrl + href.replace(/^\.\.\//, "");
    } else if (href) {
      // Relative to /forms/
      fileUrl = baseUrl + "forms/" + href;
    }

    count++;
    const fileType = getFileTypeFromUrl(href);

    notices.push({
      id: startId + count,
      date: datePart || "",
      time: timePart || "",
      title,
      fileUrl,
      fileType,
      // If no href, title might be the actual content
      content: !href ? title : undefined
    });
  }
  return notices;
}

function getFileTypeFromUrl(href) {
  if (!href) return "other";
  const ext = href.split(".").pop().toLowerCase().split(/[?#]/)[0];
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "jfif" || ext === "webp")
    return (ext === "jpeg" || ext === "jfif") ? "jpg" : ext;
  return "other";
}

/**
 * GET /notices/proxy?url=...
 * Proxy a notice file through our server.
 * Used as a fallback for files that can't be embedded directly due to CORS.
 */
export async function proxyNoticeFile(req, res) {
  const { url, session } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Security: only allow proxying files from the FOSMIS domains
  const allowedPrefix = "https://paravi.ruh.ac.lk/fosmis";
  if (!url.startsWith(allowedPrefix)) {
    return res.status(403).json({ error: "URL not allowed" });
  }

  try {
    const fetchOptions = {
      headers: {
        "Referer": "https://paravi.ruh.ac.lk/fosmis/",
      }
    };

    if (session) {
      fetchOptions.headers["Cookie"] = `PHPSESSID=${session}`;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      return res.status(response.status).json({ error: "File not found" });
    }

    // Forward content type and content disposition
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // For HTML files, we want to inject a <base> tag so relative paths work
    if (contentType && contentType.includes("text/html")) {
      let html = await response.text();

      // Inject <base> tag after <head> or at the beginning
      const baseTag = `<base href="${url}">`;
      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${baseTag}`);
      } else {
        html = baseTag + html;
      }

      res.setHeader("Content-Length", Buffer.byteLength(html));
      return res.send(html);
    }

    // Stream the file for non-HTML content
    response.body.pipe(res);
  } catch (err) {
    console.error("GET /notices/proxy error:", err.message);
    res.status(500).json({ message: "Error proxying file" });
  }
}
