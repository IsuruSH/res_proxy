import { Router } from "express";
import {
  getResults,
  getCreditResults,
  calculateGPA,
} from "../controllers/results.controller.js";

const router = Router();

router.get("/results", getResults);
router.get("/creditresults", getCreditResults);
router.post("/calculateGPA", calculateGPA);

export default router;
