import { Router } from "express";
import authRoutes from "./auth.routes.js";
import resultsRoutes from "./results.routes.js";

const router = Router();

router.use(authRoutes);
router.use(resultsRoutes);

export default router;
