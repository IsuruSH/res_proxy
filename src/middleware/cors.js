import cors from "cors";
import config from "../config/index.js";

const corsMiddleware = cors({
  origin: config.corsOrigins,
  credentials: true,
});

export default corsMiddleware;
