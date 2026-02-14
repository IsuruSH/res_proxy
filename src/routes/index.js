import { Router } from "express";
import authRoutes from "./auth.routes.js";
import resultsRoutes from "./results.routes.js";
import homeRoutes from "./home.routes.js";

const router = Router();

router.use(authRoutes);
router.use(resultsRoutes);
router.use(homeRoutes);

export default router;
