import app from "./app.js";
import config from "./config/index.js";

app.listen(config.port, () => {
  console.log(
    `Server running on port ${config.port} [${config.nodeEnv}]`
  );

  // Keep-alive: ping own /health endpoint every 45s to prevent
  // Render free-tier spin-down due to inactivity.
  // Keep-alive: ping own /health endpoint every 45s to prevent
  // Render free-tier spin-down due to inactivity.
  if (!config.isDev) {
    const KEEP_ALIVE_MS = 45 * 1000;
    // Prefer localhost for internal pings to avoid external DNS/routing issues
    const selfUrl = `http://localhost:${config.port}`;

    console.log(`[keep-alive] Starting self-pings to ${selfUrl}/health every 45s`);

    setInterval(async () => {
      try {
        const res = await fetch(`${selfUrl}/health`);
        if (!res.ok) {
          console.warn(`[keep-alive] Self-ping status not OK: ${res.status}`);
        }
      } catch (err) {
        console.warn(`[keep-alive] Self-ping failed — ${err.message}`);
      }
    }, KEEP_ALIVE_MS);
  }
});
