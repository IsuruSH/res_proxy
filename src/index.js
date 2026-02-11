import app from "./app.js";
import config from "./config/index.js";

app.listen(config.port, () => {
  console.log(
    `Server running on port ${config.port} [${config.nodeEnv}]`
  );

  // Keep-alive: ping own /health endpoint every 45s to prevent
  // Render free-tier spin-down due to inactivity.
  if (!config.isDev) {
    const KEEP_ALIVE_MS = 45 * 1000;
    const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`;

    setInterval(async () => {
      try {
        const res = await fetch(`${selfUrl}/health`);
      } catch (err) {
        console.warn(`[keep-alive] ping failed — ${err.message}`);
      }
    }, KEEP_ALIVE_MS);
  }
});
