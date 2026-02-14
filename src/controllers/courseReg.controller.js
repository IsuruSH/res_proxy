import { fetchCourseRegistrationHtml } from "../services/fosmis.service.js";
import {
  extractSession,
  parseCourseRegistrationHtml,
} from "../utils/gpa.js";

/**
 * GET /course-registration
 * Scrape the FOSMIS course registration page and return structured JSON.
 */
export async function getCourseRegistration(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  try {
    const html = await fetchCourseRegistrationHtml(phpsessid);
    const data = parseCourseRegistrationHtml(html);

    res.json({
      currentSemester: data.currentSemester,
      allCourses: data.allCourses,
      totalConfirmedCredits: data.totalConfirmedCredits,
      departments: data.departments,
      nonDegreeSubjects: [...data.nonDegreeSet],
    });
  } catch (err) {
    console.error("GET /course-registration error:", err.message);
    res.status(500).json({ message: "Error fetching course registration data" });
  }
}
