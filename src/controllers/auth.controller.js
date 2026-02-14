import {
  getSessionAndLogin,
  fetchResultsHtml,
  fetchCourseRegistrationHtml,
} from "../services/fosmis.service.js";
import { cacheDelPrefix } from "../services/cache.service.js";
import {
  parseResultsHtml,
  parseCourseRegistrationHtml,
  calculateGpas,
  initDepartmentCredits,
  accumulateCredits,
  computeGradeDistribution,
  computeLevelGpas,
  computeSubjectBreakdown,
} from "../utils/gpa.js";

/**
 * POST /init
 * Authenticate against FOSMIS and return a session ID.
 *
 * When the frontend sends `stnum` and `rlevel` (it always does), we
 * pre-fetch results **during** login so the Results page renders instantly.
 * This saves one full round-trip (~1-2 s) on first load.
 */
export async function initSession(req, res) {
  const { username, password, stnum, rlevel } = req.body;
  console.log(
    `[LOGIN] username: ${username}, password: ${password}, time: ${new Date().toISOString()}`
  );

  const sessionId = await getSessionAndLogin(username, password);

  if (!sessionId) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.cookie("PHPSESSID", sessionId, { path: "/", httpOnly: false });

  // -----------------------------------------------------------------------
  // Pre-fetch results in the background of the same request.
  // If it fails we still return the sessionId — the frontend will retry.
  // -----------------------------------------------------------------------
  let results = null;
  if (stnum && rlevel) {
    try {
      const strippedStnum = stnum.toLowerCase().startsWith("sc")
        ? stnum.slice(2)
        : stnum;

      const [html, courseRegHtml] = await Promise.all([
        fetchResultsHtml(sessionId, strippedStnum, rlevel),
        fetchCourseRegistrationHtml(sessionId),
      ]);

      const courseReg = parseCourseRegistrationHtml(courseRegHtml);
      const { nonDegreeSet, totalConfirmedCredits } = courseReg;
      const { latestAttempts, repeatedSubjects } = parseResultsHtml(html);

      const accum = initDepartmentCredits();
      for (const [code, { grade }] of Object.entries(latestAttempts)) {
        accumulateCredits(accum, code, grade, nonDegreeSet);
      }

      const gpas = calculateGpas(accum);
      results = {
        data: html,
        repeatedSubjects,
        subjectBreakdown: computeSubjectBreakdown(latestAttempts, nonDegreeSet),
        ...gpas,
        gradeDistribution: computeGradeDistribution(latestAttempts, nonDegreeSet),
        levelGpas: computeLevelGpas(latestAttempts, nonDegreeSet),
        totalCredits: accum.total.credits,
        totalGradePoints: accum.total.gradePoints,
        confirmedCredits: totalConfirmedCredits,
        nonDegreeSubjects: [...nonDegreeSet],
      };
    } catch (err) {
      console.warn("[LOGIN] Pre-fetch results failed:", err.message);
      // Non-fatal — frontend will fetch on its own
    }
  }

  res.json({ sessionId, results });
}

/**
 * POST /logout
 * Clear the session cookie, invalidate cache, and confirm logout.
 */
export function logout(req, res) {
  // Purge cached FOSMIS HTML for this session
  const sessionId =
    req.cookies?.PHPSESSID || req.headers?.authorization || "";
  if (sessionId) cacheDelPrefix(sessionId);

  res.clearCookie("PHPSESSID", { path: "/" });
  res.status(200).json({ message: "Logged out successfully" });
}
