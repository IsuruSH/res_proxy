import { parseCourseRegistrationHtml } from "../../src/utils/courseReg.js";

/**
 * The course registration page has two shapes depending on whether a
 * registration window is open. Both are covered here because the open-window
 * shape previously broke the parser badly enough to dump the whole page into
 * the UI as a single "course".
 */

// --- Shape A: registration OPEN (nested tables + offer table + "Register for") ---
const OPEN_HTML = `
<html><body>
<table>
  <tr><td>
    Registered Subjects for 2025_2026 Academic year and Semester 1
    Closing Date for Registration : 2026-10-11
  </td></tr>
  <tr><td>
    <table>
      <tr><td>Registration For Optional And Non Degree Course Units</td></tr>
      <tr>
        <th>Course Unit</th><th>Course name</th><th>Degree Status</th>
        <th>Prerequisites</th><th>Current Status</th><th>Submit as</th>
      </tr>
      <tr><td>FSC2122</td><td>Active Citizenship (Optional)</td><td>Degree</td><td></td><td>Registered !</td><td></td></tr>
      <tr><td>ZOO2142</td><td>Conservation</td><td>DegreeNon Degree</td><td>All Students</td><td>Not Registered!</td><td></td></tr>
    </table>
    <p>You Have Register for 20.00 Credits for This Semester</p>
    <table>
      <tr><th>Courses Code</th><th>Courses Name</th><th>Degree Status</th><th>Conf. Status</th></tr>
      <tr><td>AMT211β</td><td>Fluid Dynamics</td><td>Degree</td><td>Confirmed</td></tr>
      <tr><td>MAT211β</td><td>Linear Algebra</td><td>Degree</td><td>Confirmed</td></tr>
    </table>
    <p>You have registered 50.00(Confirmed) Credits</p>
    <table>
      <tr><th>Course Code</th><th>Course Name</th><th>Course category</th><th>Degree Status</th><th>Official Confirmation</th></tr>
      <tr><td>AMT111β</td><td>Classical Mechanics I</td><td>Core</td><td>Degree</td><td>Confirmed</td></tr>
      <tr><td>FSC2122</td><td>Active Citizenship</td><td>Optional</td><td>Degree</td><td>Confirmed</td></tr>
      <tr><td>XXX1112</td><td>Some Unit</td><td>Core</td><td>Non Degree</td><td>Confirmed</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

// --- Shape B: registration CLOSED (no offer table, no category column) ---
const CLOSED_HTML = `
<html><body>
  <p>Registered Subjects for 2024_2025 Academic year and Semester 2</p>
  <p>You Have registered for 7.50(Confirm) Credits</p>
  <table>
    <tr><th>Courses Code</th><th>Courses Name</th><th>Degree Status</th><th>Conf. Status</th></tr>
    <tr><td>MAT121β</td><td>Algebra</td><td>Degree</td><td>Confirmed</td></tr>
  </table>
  <p>You have registered 30.00(Confirmed) Credits</p>
  <table>
    <tr><th>Course Code</th><th>Course Name</th><th>Degree Status</th><th>Official Confirmation</th></tr>
    <tr><td>MAT111β</td><td>Vector Analysis</td><td>Degree</td><td>Confirmed</td></tr>
    <tr><td>MAT121β</td><td>Algebra</td><td>Degree</td><td>Confirmed</td></tr>
  </table>
</body></html>`;

describe("parseCourseRegistrationHtml — registration open", () => {
  const r = parseCourseRegistrationHtml(OPEN_HTML);

  it("flags the registration window and its closing date", () => {
    expect(r.registrationOpen).toBe(true);
    expect(r.closingDate).toBe("2026-10-11");
  });

  it("reads both credit totals, including the open-window wording", () => {
    expect(r.totalConfirmedCredits).toBe(50);
    expect(r.currentSemester.credits).toBe(20); // "Register for 20.00 Credits"
  });

  it("keeps the three tables separate despite nesting", () => {
    expect(r.optionalCourses).toHaveLength(2);
    expect(r.currentSemester.courses).toHaveLength(2);
    expect(r.allCourses).toHaveLength(3);
  });

  it("never emits a row whose code is concatenated page text", () => {
    const all = [...r.optionalCourses, ...r.currentSemester.courses, ...r.allCourses];
    for (const c of all) {
      expect(c.code.length).toBeLessThanOrEqual(12);
      expect(c.code).not.toMatch(/\s/);
    }
  });

  it("maps columns by label, not position", () => {
    const amt = r.allCourses.find((c) => c.code === "AMT111β");
    expect(amt.category).toBe("Core");
    expect(amt.degreeStatus).toBe("Degree");
    expect(amt.confirmation).toBe("Confirmed"); // 5th column, previously dropped
  });

  it("carries prerequisites and status for offered units", () => {
    const zoo = r.optionalCourses.find((c) => c.code === "ZOO2142");
    expect(zoo.prerequisites).toBe("All Students");
    expect(zoo.currentStatus).toBe("Not Registered!");
  });

  it("derives Non Degree only from registered courses, not from offers", () => {
    // ZOO2142 is merely *offered* as Non Degree and is Not Registered —
    // including it would wrongly drop it from the student's GPA.
    expect(r.nonDegreeSet.has("ZOO2142")).toBe(false);
    expect(r.nonDegreeSet.has("XXX1112")).toBe(true);
  });
});

describe("parseCourseRegistrationHtml — registration closed", () => {
  const r = parseCourseRegistrationHtml(CLOSED_HTML);

  it("reports no open window", () => {
    expect(r.registrationOpen).toBe(false);
    expect(r.optionalCourses).toHaveLength(0);
  });

  it("reads the closed-window credit wording", () => {
    expect(r.currentSemester.credits).toBe(7.5); // "registered for 7.50(Confirm)"
    expect(r.totalConfirmedCredits).toBe(30);
  });

  it("still separates semester from all-courses without a category column", () => {
    expect(r.currentSemester.courses).toHaveLength(1);
    expect(r.allCourses).toHaveLength(2);
    expect(r.allCourses.map((c) => c.code)).toEqual(["MAT111β", "MAT121β"]);
  });
});

// --- Shape C: registration OPEN, with the "in this semester" wording ---
// This is the shape that produced the bug: two credit sentences, the
// semester one first. Taking the first match reported 17.5 to a student
// who had actually completed 104 credits.
const TWO_TOTALS_HTML = `
<html><body>
  <p>Registered Course Units for 2024_2025 Academic year and Semester 2</p>
  <p>You have registered 17.50 (confirmed) credits in this semester</p>
  <table>
    <tr><th>Course Code</th><th>Course Name</th><th>Degree Status</th><th>Conf. Status</th></tr>
    <tr><td>MSP3144</td><td>Topology</td><td>Degree</td><td>Confirmed</td></tr>
  </table>
  <p>All Course Units That You Are Registered Up Today</p>
  <p>You have registered 104.00 (Confirmed) Credits</p>
  <table>
    <tr><th>Course Code</th><th>Course Name</th><th>Degree Status</th><th>Official Confirmation</th></tr>
    <tr><td>MSP3144</td><td>Topology</td><td>Degree</td><td>Confirmed</td></tr>
    <tr><td>MAT225β</td><td>Statistics</td><td>Non Degree</td><td>Confirmed</td></tr>
  </table>
</body></html>`;

describe("parseCourseRegistrationHtml — two credit sentences", () => {
  const r = parseCourseRegistrationHtml(TWO_TOTALS_HTML);

  it("takes the lifetime total, not the semester figure that precedes it", () => {
    expect(r.totalConfirmedCredits).toBe(104);
  });

  it("still reports the semester figure separately", () => {
    expect(r.currentSemester.credits).toBe(17.5);
  });

  it("does not let the mix-up disturb Non Degree detection", () => {
    expect(r.nonDegreeSet.has("MAT225Β")).toBe(true);
  });
});

describe("credit sentence wordings", () => {
  const totalOf = (sentence) =>
    parseCourseRegistrationHtml(`<html><body><p>${sentence}</p></body></html>`)
      .totalConfirmedCredits;
  const semesterOf = (sentence) =>
    parseCourseRegistrationHtml(`<html><body><p>${sentence}</p></body></html>`)
      .currentSemester.credits;

  it("reads a lifetime total with or without a space before the bracket", () => {
    expect(totalOf("You have registered 50.00(Confirmed) Credits")).toBe(50);
    expect(totalOf("You have registered 104.00 (Confirmed) Credits")).toBe(104);
  });

  it("classifies by 'for' before the number", () => {
    expect(semesterOf("You Have Register for 20.00 Credits for This Semester")).toBe(20);
    expect(semesterOf("You Have registered for 7.50(Confirm) Credits")).toBe(7.5);
    expect(totalOf("You Have registered for 7.50(Confirm) Credits")).toBe(0);
  });

  it("classifies by 'in this semester' after the number", () => {
    const s = "You have registered 17.50 (confirmed) credits in this semester";
    expect(semesterOf(s)).toBe(17.5);
    expect(totalOf(s)).toBe(0);
  });

  it("returns zero rather than a wrong number when nothing matches", () => {
    expect(totalOf("No credit information on this page")).toBe(0);
    expect(semesterOf("No credit information on this page")).toBe(0);
  });
});
