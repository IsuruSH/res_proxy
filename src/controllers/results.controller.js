import { fetchResultsHtml } from "../services/fosmis.service.js";
import { guardStudent } from "../middleware/studentGuard.js";
import {
  extractSession,
  parseResultsHtml,
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
    const html = await fetchResultsHtml(phpsessid, strippedStnum, rlevel);

    const { latestAttempts, repeatedSubjects } = parseResultsHtml(html);

    // Build accumulators from latest attempts
    const accum = initDepartmentCredits();
    for (const [code, { grade }] of Object.entries(latestAttempts)) {
      accumulateCredits(accum, code, grade);
    }

    const gpas = calculateGpas(accum);
    const gradeDistribution = computeGradeDistribution(latestAttempts);
    const levelGpas = computeLevelGpas(latestAttempts);
    const subjectBreakdown = computeSubjectBreakdown(latestAttempts);

    res.json({
      data: html,
      repeatedSubjects,
      subjectBreakdown,
      ...gpas,
      gradeDistribution,
      levelGpas,
      totalCredits: accum.total.credits,
      totalGradePoints: accum.total.gradePoints,
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
    // FIX: was calling external rank-proxy.onrender.com — now uses local logic
    const html = await fetchResultsHtml(phpsessid, strippedStnum, "4");

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

    // Get base credit totals with overrides applied
    const accum = calculateCreditTotalsFromHtml(html, gradeOverrides);

    // Add manual subjects on top
    if (manualSubjects?.subjects && manualSubjects?.grades) {
      addManualSubjects(accum, manualSubjects.subjects, manualSubjects.grades);
    }

    res.json(calculateGpas(accum));
  } catch (err) {
    console.error("POST /calculateGPA error:", err.message);
    // FIX: was referencing undefined `error` variable — now uses err.message
    res.status(500).json({ message: err.message || "Error calculating GPA" });
  }
}
