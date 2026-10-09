import * as cheerio from "cheerio";

/**
 * Course registration page parsing (index.php?view=admin&admin=1).
 *
 * The page shape changes depending on whether a registration window is open.
 * When one is, FOSMIS adds an "Optional And Non Degree Course Units" offer
 * table and switches the semester-credit wording. Two structural traps:
 *
 *   1. **The tables are nested.** One outer table wraps all the others, so
 *      cheerio's `.find("tr")` walks into the inner tables and the wrapper
 *      appears to have a header row with every inner header concatenated.
 *      Always read a table's OWN rows — see `ownRows`.
 *   2. **Column counts differ per table** (4, 5 and 6 columns). Reading cells
 *      by index silently mismatches, so columns are resolved by header label.
 */

/** Rows belonging to this table, excluding rows of tables nested inside it. */
function ownRows($, table) {
  return $(table)
    .find("tr")
    .filter((_, tr) => $(tr).closest("table").is(table));
}

/** Cells belonging to this row, excluding cells of nested tables. */
function ownCells($, tr, selector) {
  return $(tr)
    .find(selector)
    .filter((_, c) => $(c).closest("tr").is(tr));
}

function norm(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Build a { field -> column index } map from a header row, plus the `kind` of
 * table it describes.
 *
 * `kind` is decided by the labels unique to each table rather than by column
 * count, because the "Course category" column is only present for some
 * students. The confirmation label is the reliable discriminator:
 *   "Conf. Status"          -> current semester
 *   "Official Confirmation" -> all registered courses
 *
 * Returns null when the row carries no recognisable course columns.
 */
function mapColumns(labels) {
  const map = {};
  let kind = null;

  labels.forEach((raw, i) => {
    const l = norm(raw);
    if (l === "course code" || l === "courses code" || l === "course unit") map.code = i;
    else if (l === "course name" || l === "courses name") map.name = i;
    else if (l === "course category") map.category = i;
    else if (l === "degree status") map.degreeStatus = i;
    else if (l === "official confirmation") {
      map.confirmation = i;
      kind = "all";
    } else if (l === "conf. status") {
      map.confirmation = i;
      kind = "semester";
    } else if (l === "prerequisites") {
      map.prerequisites = i;
      kind = "optional";
    } else if (l === "current status") map.currentStatus = i;
  });

  if (map.code === undefined || map.name === undefined) return null;

  // Fall back on the category column if no confirmation label was recognised.
  if (!kind) kind = map.category !== undefined ? "all" : "semester";

  return { ...map, kind };
}

/**
 * A real subject code is short and has no spaces. This rejects the giant
 * concatenated rows FOSMIS emits for layout, which previously rendered as a
 * "course" whose code was the entire page.
 */
function isPlausibleCode(code) {
  return Boolean(code) && code.length <= 12 && !/\s/.test(code);
}

/** Read one table's data rows using a header-derived column map. */
function readTable($, table, columns) {
  const rows = ownRows($, table);
  const out = [];

  rows.each((_, tr) => {
    const cells = ownCells($, tr, "td");
    if (cells.length === 0) return; // header row

    const cell = (idx) =>
      idx === undefined || idx >= cells.length
        ? ""
        : $(cells[idx]).text().replace(/\s+/g, " ").trim();

    const code = cell(columns.code);
    if (!isPlausibleCode(code)) return;

    out.push({
      code,
      name: cell(columns.name),
      category: cell(columns.category),
      degreeStatus: cell(columns.degreeStatus),
      confirmation: cell(columns.confirmation),
      prerequisites: cell(columns.prerequisites),
      currentStatus: cell(columns.currentStatus),
    });
  });

  return out;
}

/**
 * Parse the FOSMIS course registration page HTML.
 *
 * Returns:
 *   - currentSemester   { academicYear, semester, credits, courses[] }
 *   - allCourses        every unit the student is registered for
 *   - optionalCourses   optional / non-degree units offered this window (may be [])
 *   - registrationOpen  whether an offer table is present
 *   - closingDate       registration closing date, when advertised
 *   - totalConfirmedCredits
 *   - departments
 *   - nonDegreeSet      Set<string> of upper-cased codes actually registered as Non Degree
 */
export function parseCourseRegistrationHtml(html) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");

  // --- Credit totals ---
  // "You have registered 50.00(Confirmed) Credits"
  const totalMatch = bodyText.match(
    /have registered\s+([\d.]+)\s*\(Confirmed\)\s*Credits/i
  );
  const totalConfirmedCredits = totalMatch ? parseFloat(totalMatch[1]) : 0;

  // Two wordings exist, depending on whether registration is open:
  //   "You Have Register for 20.00 Credits for This Semester"   (window open)
  //   "You Have registered for 7.50(Confirm) Credits"           (window closed)
  const semCreditsMatch = bodyText.match(
    /Have Register(?:ed)?\s+for\s+([\d.]+)\s*(?:\(Confirm(?:ed)?\))?\s*Credits/i
  );

  const semMatch = bodyText.match(
    /Registered Subjects for\s+(\S+)\s+Academic year and Semester\s+(\d)/i
  );
  const closingMatch = bodyText.match(
    /Closing Date for Registration\s*:\s*([\d-]+)/i
  );

  // --- Departments ---
  // FOSMIS lists these as <li> items, but only while a registration window is
  // open. Students outside a window get none, so fall back to deriving them
  // from the course-code prefixes further below.
  const departments = [];
  const deptRegex = /<li>\s*([^<]+?)\s*<\/li>/gi;
  let deptMatch;
  while ((deptMatch = deptRegex.exec(html)) !== null) {
    const text = deptMatch[1].trim();
    if (text && text.length < 60) departments.push(text);
  }

  // --- Classify each table by its header labels ---
  let semesterCourses = [];
  let allCourses = [];
  let optionalCourses = [];

  $("table").each((_i, table) => {
    const rows = ownRows($, table);
    if (rows.length === 0) return;

    // The header is whichever of this table's own rows declares the columns.
    let columns = null;
    rows.each((_r, tr) => {
      if (columns) return;
      const ths = ownCells($, tr, "th");
      if (ths.length === 0) return;
      const labels = ths.map((_, c) => $(c).text()).get();
      columns = mapColumns(labels);
    });
    if (!columns) return;

    const parsed = readTable($, table, columns);
    if (parsed.length === 0) return;

    if (columns.kind === "optional") optionalCourses = parsed;
    else if (columns.kind === "all") allCourses = parsed;
    else semesterCourses = parsed;
  });

  // Fallback: no <li> list (registration window closed) — derive the
  // departments from the prefixes of the courses actually registered.
  if (departments.length === 0 && allCourses.length > 0) {
    const PREFIX_TO_DEPT = {
      CSC: "Computer Science",
      COM: "Computer Science",
      MAT: "Mathematics",
      MSP: "Mathematics", // Mathematics Special course units
      AMT: "Applied Mathematics",
      IMT: "Industrial Mathematics",
      PHY: "Physics",
      CHE: "Chemistry",
      ZOO: "Zoology",
      BOT: "Botany",
      ENG: "English",
      ICT: "Information Technology",
      FSC: "Faculty Common",
    };
    const seen = new Set();
    for (const c of allCourses) {
      const prefix = c.code.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
      const dept = PREFIX_TO_DEPT[prefix];
      if (dept && !seen.has(dept)) {
        seen.add(dept);
        departments.push(dept);
      }
    }
  }

  // --- Non Degree set ---
  // ONLY from the authoritative all-courses table. The offer table lists units
  // a student *could* take as Non Degree; treating those as registered wrongly
  // excludes them from the GPA computed in results.controller.js.
  const nonDegreeSet = new Set();
  for (const c of allCourses) {
    const status = `${c.degreeStatus} ${c.confirmation}`.toLowerCase();
    if (status.includes("non degree")) nonDegreeSet.add(c.code.toUpperCase());
  }

  return {
    currentSemester: {
      academicYear: semMatch ? semMatch[1] : "",
      semester: semMatch ? semMatch[2] : "",
      credits: semCreditsMatch ? parseFloat(semCreditsMatch[1]) : 0,
      courses: semesterCourses,
    },
    allCourses,
    optionalCourses,
    registrationOpen: optionalCourses.length > 0,
    closingDate: closingMatch ? closingMatch[1] : "",
    totalConfirmedCredits,
    departments,
    nonDegreeSet,
  };
}
