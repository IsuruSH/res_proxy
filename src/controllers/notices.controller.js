import fetch from "node-fetch";
import { fetchNoticesHtml } from "../services/fosmis.service.js";
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
 * GET /notices/proxy?url=...
 * Proxy a notice file through our server.
 * Used as a fallback for files that can't be embedded directly due to CORS.
 */
export async function proxyNoticeFile(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Security: only allow proxying files from the FOSMIS downloads directory
  const allowedPrefix = "https://paravi.ruh.ac.lk/fosmis";
  if (!url.startsWith(allowedPrefix)) {
    return res.status(403).json({ error: "URL not allowed" });
  }

  try {
    const response = await fetch(url);

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

    // Allow embedding in iframes
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.removeHeader("X-Frame-Options");

    // Stream the file to the response
    response.body.pipe(res);
  } catch (err) {
    console.error("GET /notices/proxy error:", err.message);
    res.status(500).json({ message: "Error proxying file" });
  }
}
