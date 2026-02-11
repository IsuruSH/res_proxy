import { Router } from "express";
import { initSession, logout } from "../controllers/auth.controller.js";

const router = Router();

router.post("/init", initSession);
router.post("/logout", logout);

export default router;
