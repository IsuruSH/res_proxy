import { Router } from "express";
import {
  getNotices,
  getNoticesStream,
  proxyNoticeFile,
} from "../controllers/notices.controller.js";

const router = Router();

router.get("/notices", getNotices);
router.get("/notices/stream", getNoticesStream);
router.get("/notices/proxy", proxyNoticeFile);

export default router;
