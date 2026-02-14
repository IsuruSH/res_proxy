import { Router } from "express";
import authRoutes from "./auth.routes.js";
import resultsRoutes from "./results.routes.js";
import homeRoutes from "./home.routes.js";
import courseRegRoutes from "./courseReg.routes.js";
import noticesRoutes from "./notices.routes.js";

const router = Router();

router.use(authRoutes);
router.use(resultsRoutes);
router.use(homeRoutes);
router.use(courseRegRoutes);
router.use(noticesRoutes);

export default router;
