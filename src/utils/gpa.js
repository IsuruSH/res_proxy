import * as cheerio from "cheerio";
import {
  GRADE_SCALE,
  CREDIT_MAP,
  NON_CREDIT_SUBJECTS,
  DEPARTMENT_PREFIXES,
} from "../constants/index.js";

// ---------------------------------------------------------------------------
// Pure utility helpers
// ---------------------------------------------------------------------------

/**
 * Get credit value from the last character of a subject code.
 * Returns 0 for unrecognised characters.
 */
export function getCreditFromCode(subjectCode) {
  const lastChar = subjectCode.slice(-1);
  return CREDIT_MAP[lastChar] ?? 0;
}

/**
 * Get the department key (math, chem, phy, …) for a subject code.
 * Returns null when the subject does not belong to any tracked department.
 */
export function getDepartmentKey(subjectCode) {
  const upper = subjectCode.toUpperCase();
  for (const [dept, prefixes] of Object.entries(DEPARTMENT_PREFIXES)) {
    if (prefixes.some((p) => upper.startsWith(p))) {
      return dept;
    }
  }
  return null;
}

/**
 * Extract the session ID from an Authorization header that may or may not
 * include a "Bearer " prefix.
 */
export function extractSession(authHeader) {
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return authHeader;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse subject code from a regular (trbgc) row's first cell.
 * The cell text may be "1  2  3  CODE" or just "CODE".
 */
export function parseSubjectCode(fullText) {
  const parts = fullText.trim().split(/\s+/);
  return parts.length > 3 ? parts[3] : parts[0];
}

/**
 * Parse subject code and name from a repeat-attempt (selectbg) row.
 * Expected format: "Repeat Attempt [ CODE - Subject Name ]"
 */
export function parseRepeatAttemptText(text) {
  // Use \S+ instead of \w+ so Greek characters (δ, α, β) in subject codes
  // like MAT112δ are matched correctly.
  const match = text.match(/Repeat Attempt \[\s*(\S+)\s*-\s*(.+?)\s*\]/);
  return match ? { subjectCode: match[1], subjectName: match[2] } : null;
}

// ---------------------------------------------------------------------------
// Credit accumulation
// ---------------------------------------------------------------------------

/**
 * Create a fresh department-credit accumulator object.
 */
export function initDepartmentCredits() {
  const accum = {
    total: { gradePoints: 0, credits: 0 },
  };
  for (const dept of Object.keys(DEPARTMENT_PREFIXES)) {
    accum[dept] = { gradePoints: 0, credits: 0 };
  }
  return accum;
}

/**
 * Add one subject's contribution to the accumulator (mutates `accum`).
 */
export function accumulateCredits(accum, subjectCode, grade) {
  const upperCode = subjectCode.toUpperCase();
  if (NON_CREDIT_SUBJECTS.includes(upperCode)) return;

  const credit = getCreditFromCode(subjectCode);
  const gradePoints = (GRADE_SCALE[grade] ?? 0) * credit;

  accum.total.credits += credit;
  accum.total.gradePoints += gradePoints;

  const dept = getDepartmentKey(subjectCode);
  if (dept && accum[dept]) {
    accum[dept].credits += credit;
    accum[dept].gradePoints += gradePoints;
  }
}

// ---------------------------------------------------------------------------
// GPA formatting
// ---------------------------------------------------------------------------

function safeGpa(gradePoints, credits) {
  return credits > 0 ? (gradePoints / credits).toFixed(2) : "NaN";
}

/**
 * Convert an accumulator into the GPA response shape used by /results and
 * /calculateGPA.
 */
export function calculateGpas(accum) {
  return {
    gpa: safeGpa(accum.total.gradePoints, accum.total.credits),
    mathGpa: safeGpa(accum.math.gradePoints, accum.math.credits),
    cheGpa: safeGpa(accum.chem.gradePoints, accum.chem.credits),
    phyGpa: safeGpa(accum.phy.gradePoints, accum.phy.credits),
    zooGpa: safeGpa(accum.zoo.gradePoints, accum.zoo.credits),
    botGpa: safeGpa(accum.bot.gradePoints, accum.bot.credits),
    csGpa: safeGpa(accum.cs.gradePoints, accum.cs.credits),
  };
}

/**
 * Convert an accumulator into the flat credit-totals shape used by
 * /creditresults.
 */
export function formatCreditTotals(accum) {
  return {
    totalGradePoints: accum.total.gradePoints,
    totalCredits: accum.total.credits,
    mathGradePoints: accum.math.gradePoints,
    mathCredits: accum.math.credits,
    chemGradePoints: accum.chem.gradePoints,
    chemCredits: accum.chem.credits,
    phyGradePoints: accum.phy.gradePoints,
    phyCredits: accum.phy.credits,
    zooGradePoints: accum.zoo.gradePoints,
    zooCredits: accum.zoo.credits,
    botGradePoints: accum.bot.gradePoints,
    botCredits: accum.bot.credits,
    csGradePoints: accum.cs.gradePoints,
    csCredits: accum.cs.credits,
  };
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

/**
 * Count occurrences of each grade across latest attempts.
 * Returns e.g. { "A+": 3, "B": 5, "C+": 2 }
 */
export function computeGradeDistribution(latestAttempts) {
  const dist = {};
  for (const { grade } of Object.values(latestAttempts)) {
    dist[grade] = (dist[grade] || 0) + 1;
  }
  return dist;
}

/**
 * Compute per-level GPAs by grouping subjects based on the level digit
 * in position 3 of the subject code (e.g. MAT1142 → level 1).
 * Returns { level1?: string, level2?: string, level3?: string }
 */
export function computeLevelGpas(latestAttempts) {
  // Create an accumulator per level
  const levelAccums = {
    1: initDepartmentCredits(),
    2: initDepartmentCredits(),
    3: initDepartmentCredits(),
  };

  for (const [code, { grade }] of Object.entries(latestAttempts)) {
    const levelChar = code.length > 3 ? code[3] : null;
    const level = parseInt(levelChar, 10);
    if (level >= 1 && level <= 3) {
      accumulateCredits(levelAccums[level], code, grade);
    }
  }

  const result = {};
  for (const lvl of [1, 2, 3]) {
    const { gradePoints, credits } = levelAccums[lvl].total;
    if (credits > 0) {
      result[`level${lvl}`] = (gradePoints / credits).toFixed(2);
    }
  }
  return result;
}

/**
 * Extract year and semester from a subject code.
 * After stripping the alphabetic prefix, the first digit = year,
 * the second character = semester (1, 2, or a letter like B for bridge).
 */
function extractYearSemester(code) {
  const digits = code.replace(/^[A-Za-z]+/, ""); // strip letter prefix
  const year = parseInt(digits[0], 10) || 0;
  const sem = digits[1] ?? "0"; // keep as string (could be 'B')
  return { year, semester: sem };
}

/**
 * Build a per-subject breakdown from latestAttempts.
 * Returns an array sorted by year then semester then subject code,
 * each entry containing:
 *   subjectCode, subjectName, grade, credit, gradeScale, weightedPoints,
 *   year, semester
 * Excludes non-credit subjects (ENG, ICT etc.).
 */
export function computeSubjectBreakdown(latestAttempts) {
  const rows = [];
  for (const [code, { subjectName, grade }] of Object.entries(latestAttempts)) {
    const upperCode = code.toUpperCase();
    if (NON_CREDIT_SUBJECTS.includes(upperCode)) continue;

    const credit = getCreditFromCode(code);
    const gradeScale = GRADE_SCALE[grade] ?? 0;
    const { year, semester } = extractYearSemester(code);
    rows.push({
      subjectCode: code,
      subjectName,
      grade,
      credit,
      gradeScale,
      weightedPoints: credit * gradeScale,
      year,
      semester,
    });
  }
  // Sort by year → semester → subject code
  rows.sort((a, b) =>
    a.year !== b.year
      ? a.year - b.year
      : a.semester !== b.semester
        ? String(a.semester).localeCompare(String(b.semester))
        : a.subjectCode.localeCompare(b.subjectCode)
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Full HTML → result pipelines
// ---------------------------------------------------------------------------

/**
 * Parse FOSMIS HTML and return structured result data including latest
 * attempts and repeated-subject information.  Used by GET /results.
 *
 * BUG FIX: the original code for selectbg rows had an impossible condition
 * (grade > X && grade === X) — fixed to use || so that better grades or
 * same-grade-newer-year correctly replace the earlier attempt.
 */
export function parseResultsHtml(html) {
  const $ = cheerio.load(html);
  const latestAttempts = {};
  const allAttempts = {};

  // --- regular rows ---
  $("tr.trbgc").each((_i, el) => {
    const fullText = $(el).find("td").eq(0).text().trim();
    const subjectCode = parseSubjectCode(fullText);
    const subjectName = $(el).find("td").eq(1).text().trim();
    const grade = $(el).find("td").eq(2).text().trim();
    const year = parseInt($(el).find("td").eq(3).text().trim(), 10);

    if (!GRADE_SCALE.hasOwnProperty(grade)) return;

    if (!allAttempts[subjectCode]) {
      allAttempts[subjectCode] = { subjectName, attempts: [] };
    }
    allAttempts[subjectCode].attempts.push({ grade, year });

    // First non-repeat occurrence wins
    if (!latestAttempts[subjectCode]) {
      latestAttempts[subjectCode] = { subjectName, grade, year };
    }
  });

  // --- repeat-attempt rows ---
  $("tr.selectbg").each((_i, el) => {
    const parsed = parseRepeatAttemptText(
      $(el).find("td").eq(0).text().trim()
    );
    if (!parsed) return;

    const { subjectCode, subjectName } = parsed;
    const grade = $(el).find("td").eq(1).text().trim();
    const year = parseInt($(el).find("td").eq(2).text().trim(), 10);

    if (!GRADE_SCALE.hasOwnProperty(grade)) return;

    if (!allAttempts[subjectCode]) {
      allAttempts[subjectCode] = { subjectName, attempts: [] };
    }
    allAttempts[subjectCode].attempts.push({ grade, year });

    // FIX: use || instead of && so higher grades actually replace
    if (
      !latestAttempts[subjectCode] ||
      GRADE_SCALE[grade] > GRADE_SCALE[latestAttempts[subjectCode].grade] ||
      (GRADE_SCALE[grade] === GRADE_SCALE[latestAttempts[subjectCode].grade] &&
        year > latestAttempts[subjectCode].year)
    ) {
      latestAttempts[subjectCode] = { subjectName, grade, year };
    }
  });

  // --- identify repeated subjects ---
  // A subject appears here only if its best grade is still below C.
  // Once a student passes (C or above), the subject is removed from
  // this list — even if it was repeated or had an MC attempt before.
  const repeatedSubjects = [];
  for (const [subjectCode, { attempts, subjectName }] of Object.entries(
    allAttempts
  )) {
    attempts.sort((a, b) => b.year - a.year);
    const latest = latestAttempts[subjectCode];
    const needsRepeat = GRADE_SCALE[latest.grade] < GRADE_SCALE["C"];

    if (needsRepeat) {
      repeatedSubjects.push({
        subjectCode,
        subjectName,
        attempts: attempts.map((a) => ({
          grade: a.grade,
          year: a.year,
          isLowGrade: GRADE_SCALE[a.grade] <= GRADE_SCALE["C-"],
        })),
        latestAttempt: latest,
      });
    }
  }

  return { latestAttempts, allAttempts, repeatedSubjects };
}

/**
 * Calculate credit totals from FOSMIS HTML.
 * Optionally applies grade overrides for repeated subjects.
 * Used by GET /creditresults and POST /calculateGPA.
 *
 * BUG FIX: original /creditresults had incorrect subject-code parsing
 * (always used full cell text instead of extracting the code) and was
 * missing the "CSC" prefix for CS subjects.  Both fixed here.
 */
export function calculateCreditTotalsFromHtml(html, gradeOverrides = {}) {
  const $ = cheerio.load(html);
  const latestAttempts = {};

  // --- regular rows ---
  $("tr.trbgc").each((_i, el) => {
    const fullText = $(el).find("td").eq(0).text().trim();
    const subjectCode = parseSubjectCode(fullText);
    const grade = $(el).find("td").eq(2).text().trim();
    const year = parseInt($(el).find("td").eq(3).text().trim(), 10);

    if (GRADE_SCALE.hasOwnProperty(grade) && !latestAttempts[subjectCode]) {
      latestAttempts[subjectCode] = { grade, year };
    }
  });

  // --- repeat-attempt rows ---
  $("tr.selectbg").each((_i, el) => {
    const parsed = parseRepeatAttemptText(
      $(el).find("td").eq(0).text().trim()
    );
    if (!parsed) return;

    const { subjectCode } = parsed;
    const grade = $(el).find("td").eq(1).text().trim();
    const year = parseInt($(el).find("td").eq(2).text().trim(), 10);

    if (!GRADE_SCALE.hasOwnProperty(grade)) return;

    if (
      !latestAttempts[subjectCode] ||
      GRADE_SCALE[grade] > GRADE_SCALE[latestAttempts[subjectCode].grade] ||
      (GRADE_SCALE[grade] === GRADE_SCALE[latestAttempts[subjectCode].grade] &&
        year > latestAttempts[subjectCode].year)
    ) {
      latestAttempts[subjectCode] = { grade, year };
    }
  });

  // --- apply overrides ---
  for (const [subjectCode, grade] of Object.entries(gradeOverrides)) {
    if (latestAttempts[subjectCode] && GRADE_SCALE.hasOwnProperty(grade)) {
      latestAttempts[subjectCode].grade = grade;
    }
  }

  // --- accumulate ---
  const accum = initDepartmentCredits();
  for (const [subjectCode, { grade }] of Object.entries(latestAttempts)) {
    accumulateCredits(accum, subjectCode, grade);
  }
  return accum;
}

/**
 * Add manually-entered subjects to an existing accumulator (mutates it).
 */
export function addManualSubjects(accum, subjects, grades) {
  for (let i = 0; i < subjects.length; i++) {
    const subjectCode = subjects[i];
    const grade = grades[i];
    if (!subjectCode || !grade) continue;
    accumulateCredits(accum, subjectCode, grade);
  }
  return accum;
}
