import { Router } from "express";
import { getHomeData } from "../controllers/home.controller.js";

const router = Router();

router.get("/home-data", getHomeData);

export default router;
