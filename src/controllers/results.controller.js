import {
  fetchResultsHtml,
  fetchCourseRegistrationHtml,
} from "../services/fosmis.service.js";
import { guardStudent } from "../middleware/studentGuard.js";
import {
  extractSession,
  parseResultsHtml,
  parseCourseRegistrationHtml,
  calculateGpas,
  calculateCreditTotalsFromHtml,
  formatCreditTotals,
  addManualSubjects,
  initDepartmentCredits,
  accumulateCredits,
  computeGradeDistribution,
  computeLevelGpas,
  computeSubjectBreakdown,
} from "../utils/gpa.js";

/**
 * GET /results
 * Fetch FOSMIS HTML, parse results, and return GPAs + repeated subjects.
 */
export async function getResults(req, res) {
  const { stnum, rlevel } = req.query;
  const phpsessid = extractSession(req.headers["authorization"]);

  const strippedStnum = guardStudent(stnum, res);
  if (strippedStnum === null) return; // response already sent

  try {
    // Fetch results and course registration in parallel
    const [html, courseRegHtml] = await Promise.all([
      fetchResultsHtml(phpsessid, strippedStnum, rlevel),
      fetchCourseRegistrationHtml(phpsessid),
    ]);

    // Parse course registration to get Non Degree subjects and confirmed credits
    const courseReg = parseCourseRegistrationHtml(courseRegHtml);
    const { nonDegreeSet, totalConfirmedCredits } = courseReg;

    const { latestAttempts, repeatedSubjects } = parseResultsHtml(html);

    // Build accumulators from latest attempts, excluding Non Degree subjects
    const accum = initDepartmentCredits();
    for (const [code, { grade }] of Object.entries(latestAttempts)) {
      accumulateCredits(accum, code, grade, nonDegreeSet);
    }

    const gpas = calculateGpas(accum);
    const gradeDistribution = computeGradeDistribution(latestAttempts, nonDegreeSet);
    const levelGpas = computeLevelGpas(latestAttempts, nonDegreeSet);
    const subjectBreakdown = computeSubjectBreakdown(latestAttempts, nonDegreeSet);

    res.json({
      data: html,
      repeatedSubjects,
      subjectBreakdown,
      ...gpas,
      gradeDistribution,
      levelGpas,
      totalCredits: accum.total.credits,
      totalGradePoints: accum.total.gradePoints,
      confirmedCredits: totalConfirmedCredits,
      nonDegreeSubjects: [...nonDegreeSet],
    });
  } catch (err) {
    console.error("GET /results error:", err.message);
    res.status(500).json({ message: "Error fetching data" });
  }
}

/**
 * GET /creditresults
 * Return raw credit totals per department.
 */
export async function getCreditResults(req, res) {
  const { stnum, rlevel } = req.query;
  const phpsessid = extractSession(req.headers["authorization"]);

  const strippedStnum = guardStudent(stnum, res);
  if (strippedStnum === null) return;

  try {
    const html = await fetchResultsHtml(phpsessid, strippedStnum, rlevel);
    const accum = calculateCreditTotalsFromHtml(html);
    res.json(formatCreditTotals(accum));
  } catch (err) {
    console.error("GET /creditresults error:", err.message);
    res.status(500).json({ message: "Error fetching data" });
  }
}

/**
 * POST /calculateGPA
 * Calculate GPA with optional manual subjects and repeated-subject overrides.
 */
export async function calculateGPA(req, res) {
  const { stnum, manualSubjects, repeatedSubjects } = req.body;
  const phpsessid = extractSession(req.headers["authorization"]);

  const strippedStnum = stnum?.startsWith("0") ? stnum.slice(1) : stnum;

  try {
    // Fetch results and course registration in parallel
    const [html, courseRegHtml] = await Promise.all([
      fetchResultsHtml(phpsessid, strippedStnum, "4"),
      fetchCourseRegistrationHtml(phpsessid),
    ]);

    // Get Non Degree subject set
    const { nonDegreeSet } = parseCourseRegistrationHtml(courseRegHtml);

    // Build grade overrides from repeated subjects
    const gradeOverrides = {};
    if (repeatedSubjects?.subjects && repeatedSubjects?.grades) {
      for (let i = 0; i < repeatedSubjects.subjects.length; i++) {
        if (repeatedSubjects.subjects[i] && repeatedSubjects.grades[i]) {
          gradeOverrides[repeatedSubjects.subjects[i]] =
            repeatedSubjects.grades[i];
        }
      }
    }

    // Get base credit totals with overrides applied, excluding Non Degree
    const accum = calculateCreditTotalsFromHtml(html, gradeOverrides, nonDegreeSet);

    // Add manual subjects on top
    if (manualSubjects?.subjects && manualSubjects?.grades) {
      addManualSubjects(accum, manualSubjects.subjects, manualSubjects.grades);
    }

    res.json(calculateGpas(accum));
  } catch (err) {
    console.error("POST /calculateGPA error:", err.message);
    res.status(500).json({ message: err.message || "Error calculating GPA" });
  }
}
