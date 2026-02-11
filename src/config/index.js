import "dotenv/config";

const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",
  corsOrigins: (
    process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:3000"
  )
    .split(",")
    .map((s) => s.trim()),
  fosmisBaseUrl:
    process.env.FOSMIS_BASE_URL || "https://paravi.ruh.ac.lk/fosmis2019",
};

export default config;
