import { Router } from "express";
import {
  getNoticesJson,
  getNoticesStream,
  proxyNoticeFile,
} from "../controllers/notices.controller.js";

const router = Router();

router.get("/notices", getNoticesJson);
router.get("/notices/stream", getNoticesStream);
router.get("/notices/proxy", proxyNoticeFile);

export default router;
