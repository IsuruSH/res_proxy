import express from "express";
import cookieParser from "cookie-parser";
import corsMiddleware from "./middleware/cors.js";
import errorHandler from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// --- Core middleware ---
app.use(cookieParser());
app.use(express.json());
app.use(corsMiddleware);

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// --- API routes ---
app.use(routes);

// --- Global error handler (must be last) ---
app.use(errorHandler);

export default app;
