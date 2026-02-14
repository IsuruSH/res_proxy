import { Router } from "express";
import { getCourseRegistration } from "../controllers/courseReg.controller.js";

const router = Router();

router.get("/course-registration", getCourseRegistration);

export default router;
