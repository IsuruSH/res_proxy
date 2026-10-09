import fetch from "node-fetch";
import { getNotices } from "../services/notices.service.js";
import { extractSession } from "../utils/gpa.js";

/**
 * GET /notices
 * Return the notice board as JSON, from the shared global cache.
 */
export async function getNoticesJson(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  try {
    res.json(await getNotices(phpsessid));
  } catch (err) {
    console.error("GET /notices error:", err.message);
    res.status(502).json({ message: "Error fetching notices" });
  }
}

/**
 * GET /notices/stream
 * Stream notices to the client one at a time over Server-Sent Events.
 *
 * The notices themselves come from the shared in-memory store, so this is
 * normally instant — only the first request after the TTL expires reaches
 * FOSMIS, and concurrent requests share that one fetch.
 */
export async function getNoticesStream(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  // SSE headers — explicit CORS required because flushHeaders() sends headers
  // before the cors middleware would otherwise apply them.
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Stop writing if the user navigates away mid-stream.
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    const { recentNotices, previousNotices } = await getNotices(phpsessid);
    if (aborted) return;

    const send = (type, notice) =>
      res.write(`data: ${JSON.stringify({ type, notice })}\n\n`);

    for (const notice of recentNotices) {
      if (aborted) return;
      send("recent", notice);
    }
    for (const notice of previousNotices) {
      if (aborted) return;
      send("previous", notice);
    }

    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (err) {
    console.error("GET /notices/stream error:", err.message);
    if (!aborted) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: "Error streaming notices" })}\n\n`
      );
      res.end();
    }
  }
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
        Referer: "https://paravi.ruh.ac.lk/fosmis/",
      },
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

    // For HTML files, inject a <base> tag so relative paths resolve
    if (contentType && contentType.includes("text/html")) {
      let html = await response.text();

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
