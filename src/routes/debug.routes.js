import { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import fetch from "node-fetch";
import config from "../config/index.js";
import { fosmisAgent } from "../services/fosmis.service.js";

const router = Router();
const STEP_TIMEOUT_MS = 15000;

function describeError(err) {
  return {
    name: err?.name,
    message: err?.message,
    code: err?.code ?? err?.cause?.code,
    errno: err?.errno ?? err?.cause?.errno,
    syscall: err?.syscall ?? err?.erroredSysCall ?? err?.cause?.syscall,
  };
}

async function timed(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - start, ...result };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: describeError(err) };
  }
}

function tcpConnect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(STEP_TIMEOUT_MS, () => {
      socket.destroy();
      reject(Object.assign(new Error(`TCP connect timed out after ${STEP_TIMEOUT_MS}ms`), { code: "TCP_TIMEOUT" }));
    });
    socket.once("connect", () => {
      resolve({ localAddress: socket.localAddress, remoteAddress: socket.remoteAddress });
      socket.destroy();
    });
    socket.once("error", reject);
  });
}

function tlsHandshake(ip, servername) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: ip, port: 443, servername });
    socket.setTimeout(STEP_TIMEOUT_MS, () => {
      socket.destroy();
      reject(Object.assign(new Error(`TLS handshake timed out after ${STEP_TIMEOUT_MS}ms`), { code: "TLS_TIMEOUT" }));
    });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      resolve({
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ?? null,
        certSubject: cert?.subject?.CN,
        certValidTo: cert?.valid_to,
      });
      socket.destroy();
    });
    socket.once("error", reject);
  });
}

async function httpGet(url, agent) {
  const res = await fetch(url, { agent, signal: AbortSignal.timeout(STEP_TIMEOUT_MS), redirect: "manual" });
  const body = await res.text();
  return {
    status: res.status,
    server: res.headers.get("server"),
    setsSessionCookie: (res.headers.get("set-cookie") || "").includes("PHPSESSID"),
    bodyLength: body.length,
    looksLikeLoginPage: body.includes('name="uname"'),
    bodyPreview: body.slice(0, 200),
  };
}

/**
 * GET /debug/fosmis
 * Tests each network layer between this server and FOSMIS separately, so a
 * failure shows exactly where the connection breaks.
 */
router.get("/debug/fosmis", async (_req, res) => {
  const target = new URL(config.fosmisBaseUrl);
  const report = {
    time: new Date().toISOString(),
    node: process.version,
    fosmisBaseUrl: config.fosmisBaseUrl,
  };

  report.egressIp = await timed(async () => {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
    return { ip: (await r.json()).ip };
  });

  report.controlInternet = await timed(async () => ({ status: (await httpGet("https://www.google.com/")).status }));

  report.dns = await timed(async () => ({ addresses: await dns.lookup(target.hostname, { all: true }) }));
  const ip = report.dns.ok ? report.dns.addresses.find((a) => a.family === 4)?.address : null;

  if (ip) {
    report.tcp443 = await timed(() => tcpConnect(ip, 443));
    if (report.tcp443.ok) report.tls = await timed(() => tlsHandshake(ip, target.hostname));
  }

  report.httpIndex = await timed(() => httpGet(`${config.fosmisBaseUrl}/index.php`));

  if (fosmisAgent) {
    report.proxy = { url: config.fosmisProxyUrl };
    report.proxy.egressIp = await timed(async () => {
      const r = await fetch("https://api.ipify.org?format=json", {
        agent: fosmisAgent,
        signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      });
      return { ip: (await r.json()).ip };
    });
    report.proxy.httpIndex = await timed(() => httpGet(`${config.fosmisBaseUrl}/index.php`, fosmisAgent));
  }

  report.diagnosis = fosmisAgent ? diagnoseProxy(report) : diagnose(report);
  console.log("[DEBUG] FOSMIS connectivity report:", JSON.stringify(report));
  res.json(report);
});

function diagnose(r) {
  if (!r.controlInternet.ok) return "This server has no working outbound internet access at all.";
  if (!r.dns.ok) return "DNS lookup for the FOSMIS host failed on this server.";
  if (r.tcp443 && !r.tcp443.ok) {
    return r.tcp443.error.code === "TCP_TIMEOUT"
      ? "TCP connection to FOSMIS port 443 silently times out: packets from this server's IP are being dropped by a firewall on the university's side (an IP/network block)."
      : `TCP connection to FOSMIS was actively refused/reset (${r.tcp443.error.code}): the university's network is rejecting this server's IP.`;
  }
  if (r.tls && !r.tls.ok) return "TCP connects but the TLS handshake fails: an HTTPS/certificate or middlebox problem, not an IP block.";
  if (!r.httpIndex.ok) return "Connection and TLS work but the HTTP request fails or hangs: FOSMIS (or a WAF in front of it) is not answering requests from this server.";
  if (r.httpIndex.status >= 400) return `FOSMIS answers but returns HTTP ${r.httpIndex.status} to this server: likely a WAF/IP-based block page.`;
  return "FOSMIS is reachable from this server. If login still fails, check the [FOSMIS] and [LOGIN] trace lines in the logs.";
}

function diagnoseProxy(r) {
  const p = r.proxy;
  if (!p.egressIp.ok) {
    return `The proxy at ${p.url} is not working (${p.egressIp.error.code || p.egressIp.error.message}): check that Tailscale started and is connected (see [tailscale] lines in the logs).`;
  }
  if (p.egressIp.ip === r.egressIp.ip) {
    return "The proxy works but traffic still leaves from this server's own IP: the Tailscale exit node is not in use (check --exit-node and that the exit node is approved in the admin console).";
  }
  if (!p.httpIndex.ok) {
    return `Traffic exits via ${p.egressIp.ip} but FOSMIS still does not answer: that IP is not allowed by FOSMIS either (is the exit node in Sri Lanka?).`;
  }
  return `FOSMIS is reachable through the proxy (exit IP ${p.egressIp.ip}). Logins will use this route.`;
}

export default router;
