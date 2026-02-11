import { jest } from "@jest/globals";
import {
  getCreditFromCode,
  getDepartmentKey,
  extractSession,
  parseSubjectCode,
  parseRepeatAttemptText,
  initDepartmentCredits,
  accumulateCredits,
  calculateGpas,
  formatCreditTotals,
  parseResultsHtml,
  calculateCreditTotalsFromHtml,
  addManualSubjects,
} from "../../src/utils/gpa.js";

// ---------------------------------------------------------------------------
// getCreditFromCode
// ---------------------------------------------------------------------------
describe("getCreditFromCode", () => {
  it("returns numeric credits for digit characters", () => {
    expect(getCreditFromCode("MAT1232")).toBe(2);
    expect(getCreditFromCode("PHY2143")).toBe(3);
    expect(getCreditFromCode("CHE1001")).toBe(1);
    expect(getCreditFromCode("ENG3B10")).toBe(0);
    expect(getCreditFromCode("COM3456")).toBe(6);
  });

  it("returns correct credits for Greek letter suffixes", () => {
    expect(getCreditFromCode("MAT12α")).toBe(1.5);
    expect(getCreditFromCode("PHY21β")).toBe(2.5);
    expect(getCreditFromCode("CHE10δ")).toBe(1.25);
  });

  it("returns correct credits for Latin letter substitutes", () => {
    expect(getCreditFromCode("MAT12a")).toBe(1.5);
    expect(getCreditFromCode("PHY21b")).toBe(2.5);
    expect(getCreditFromCode("CHE10d")).toBe(1.25);
  });

  it("returns 0 for unrecognised last characters", () => {
    expect(getCreditFromCode("ABCX")).toBe(0);
    expect(getCreditFromCode("TEST_")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDepartmentKey
// ---------------------------------------------------------------------------
describe("getDepartmentKey", () => {
  it("identifies math subjects", () => {
    expect(getDepartmentKey("AMT1232")).toBe("math");
    expect(getDepartmentKey("IMT2001")).toBe("math");
    expect(getDepartmentKey("MAT3142")).toBe("math");
  });

  it("identifies science subjects", () => {
    expect(getDepartmentKey("CHE1012")).toBe("chem");
    expect(getDepartmentKey("PHY2013")).toBe("phy");
    expect(getDepartmentKey("ZOO1012")).toBe("zoo");
    expect(getDepartmentKey("BOT2023")).toBe("bot");
  });

  it("identifies CS subjects including CSC prefix", () => {
    expect(getDepartmentKey("COM1012")).toBe("cs");
    expect(getDepartmentKey("CSC2023")).toBe("cs");
  });

  it("is case-insensitive", () => {
    expect(getDepartmentKey("amt1232")).toBe("math");
    expect(getDepartmentKey("che1012")).toBe("chem");
    expect(getDepartmentKey("com1012")).toBe("cs");
  });

  it("returns null for unknown departments", () => {
    expect(getDepartmentKey("ENG1201")).toBeNull();
    expect(getDepartmentKey("ICT2B13")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractSession
// ---------------------------------------------------------------------------
describe("extractSession", () => {
  it("returns null for falsy input", () => {
    expect(extractSession(null)).toBeNull();
    expect(extractSession(undefined)).toBeNull();
    expect(extractSession("")).toBeNull();
  });

  it("strips Bearer prefix", () => {
    expect(extractSession("Bearer abc123")).toBe("abc123");
  });

  it("returns raw value when no Bearer prefix", () => {
    expect(extractSession("abc123")).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// parseSubjectCode
// ---------------------------------------------------------------------------
describe("parseSubjectCode", () => {
  it("extracts code from multi-part text", () => {
    expect(parseSubjectCode("1  SC  2020  AMT1232")).toBe("AMT1232");
  });

  it("returns full text when only one part", () => {
    expect(parseSubjectCode("AMT1232")).toBe("AMT1232");
  });

  it("handles extra whitespace", () => {
    expect(parseSubjectCode("  1   SC   2020   PHY2013  ")).toBe("PHY2013");
  });
});

// ---------------------------------------------------------------------------
// parseRepeatAttemptText
// ---------------------------------------------------------------------------
describe("parseRepeatAttemptText", () => {
  it("parses valid repeat attempt text", () => {
    const result = parseRepeatAttemptText(
      "Repeat Attempt [ AMT1232 - Applied Mathematics ]"
    );
    expect(result).toEqual({
      subjectCode: "AMT1232",
      subjectName: "Applied Mathematics",
    });
  });

  it("returns null for non-matching text", () => {
    expect(parseRepeatAttemptText("Some random text")).toBeNull();
    expect(parseRepeatAttemptText("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// accumulateCredits + initDepartmentCredits
// ---------------------------------------------------------------------------
describe("accumulateCredits", () => {
  it("adds credits and grade points to the correct department", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "AMT1232", "A+"); // math, 2 credits, 4.0 * 2 = 8.0

    expect(accum.total.credits).toBe(2);
    expect(accum.total.gradePoints).toBe(8.0);
    expect(accum.math.credits).toBe(2);
    expect(accum.math.gradePoints).toBe(8.0);
    expect(accum.chem.credits).toBe(0);
  });

  it("skips non-credit subjects", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "MAT1142", "A+");

    expect(accum.total.credits).toBe(0);
    expect(accum.total.gradePoints).toBe(0);
  });

  it("handles case-insensitive non-credit check", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "mat1142", "A+");
    expect(accum.total.credits).toBe(0);
  });

  it("accumulates across multiple subjects", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "AMT1232", "A+"); // math, 2cr, 8.0 gp
    accumulateCredits(accum, "CHE1013", "B+"); // chem, 3cr, 9.9 gp
    accumulateCredits(accum, "COM1012", "A"); // cs, 2cr, 8.0 gp

    expect(accum.total.credits).toBe(7);
    expect(accum.total.gradePoints).toBeCloseTo(25.9, 1);
    expect(accum.math.credits).toBe(2);
    expect(accum.chem.credits).toBe(3);
    expect(accum.cs.credits).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// calculateGpas
// ---------------------------------------------------------------------------
describe("calculateGpas", () => {
  it("calculates GPAs from accumulator", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "AMT1232", "A+"); // 2 * 4.0 = 8.0
    accumulateCredits(accum, "CHE1013", "B"); // 3 * 3.0 = 9.0

    const gpas = calculateGpas(accum);
    expect(gpas.gpa).toBe("3.40"); // 17.0 / 5
    expect(gpas.mathGpa).toBe("4.00");
    expect(gpas.cheGpa).toBe("3.00");
  });

  it("returns NaN string for departments with no subjects", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "AMT1232", "A+");

    const gpas = calculateGpas(accum);
    expect(gpas.cheGpa).toBe("NaN");
    expect(gpas.phyGpa).toBe("NaN");
  });
});

// ---------------------------------------------------------------------------
// formatCreditTotals
// ---------------------------------------------------------------------------
describe("formatCreditTotals", () => {
  it("formats accumulator into flat object", () => {
    const accum = initDepartmentCredits();
    accumulateCredits(accum, "AMT1232", "A+");

    const result = formatCreditTotals(accum);
    expect(result.totalCredits).toBe(2);
    expect(result.totalGradePoints).toBe(8.0);
    expect(result.mathCredits).toBe(2);
    expect(result.chemCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseResultsHtml
// ---------------------------------------------------------------------------
describe("parseResultsHtml", () => {
  const sampleHtml = `
    <table>
      <tr class="trbgc">
        <td>1  SC  2020  AMT1232</td>
        <td>Applied Mathematics I</td>
        <td>A+</td>
        <td>2020</td>
      </tr>
      <tr class="trbgc">
        <td>2  SC  2020  CHE1013</td>
        <td>Chemistry I</td>
        <td>C-</td>
        <td>2020</td>
      </tr>
      <tr class="selectbg">
        <td>Repeat Attempt [ CHE1013 - Chemistry I ]</td>
        <td>B+</td>
        <td>2021</td>
      </tr>
    </table>
  `;

  it("parses regular rows correctly", () => {
    const { latestAttempts } = parseResultsHtml(sampleHtml);
    expect(latestAttempts["AMT1232"]).toBeDefined();
    expect(latestAttempts["AMT1232"].grade).toBe("A+");
    expect(latestAttempts["AMT1232"].year).toBe(2020);
  });

  it("updates latest attempt for repeat rows with better grades", () => {
    const { latestAttempts } = parseResultsHtml(sampleHtml);
    // CHE1013 had C- in 2020, B+ in repeat 2021 — B+ should win
    expect(latestAttempts["CHE1013"].grade).toBe("B+");
    expect(latestAttempts["CHE1013"].year).toBe(2021);
  });

  it("identifies repeated subjects with low grades", () => {
    const { repeatedSubjects } = parseResultsHtml(sampleHtml);
    expect(repeatedSubjects.length).toBe(1);
    expect(repeatedSubjects[0].subjectCode).toBe("CHE1013");
    expect(repeatedSubjects[0].attempts.length).toBe(2);
  });

  it("returns empty arrays for clean HTML with no results", () => {
    const { latestAttempts, repeatedSubjects } = parseResultsHtml("<div></div>");
    expect(Object.keys(latestAttempts).length).toBe(0);
    expect(repeatedSubjects.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCreditTotalsFromHtml
// ---------------------------------------------------------------------------
describe("calculateCreditTotalsFromHtml", () => {
  const sampleHtml = `
    <table>
      <tr class="trbgc">
        <td>1  SC  2020  AMT1232</td>
        <td>Applied Mathematics I</td>
        <td>A+</td>
        <td>2020</td>
      </tr>
      <tr class="trbgc">
        <td>2  SC  2020  CHE1013</td>
        <td>Chemistry I</td>
        <td>C-</td>
        <td>2020</td>
      </tr>
      <tr class="selectbg">
        <td>Repeat Attempt [ CHE1013 - Chemistry I ]</td>
        <td>B+</td>
        <td>2021</td>
      </tr>
    </table>
  `;

  it("calculates credit totals from HTML", () => {
    const accum = calculateCreditTotalsFromHtml(sampleHtml);
    // AMT1232: 2 credits * 4.0 = 8.0
    // CHE1013: 3 credits * 3.3 (B+ from repeat) = 9.9
    expect(accum.total.credits).toBe(5);
    expect(accum.total.gradePoints).toBeCloseTo(17.9, 1);
  });

  it("applies grade overrides", () => {
    const accum = calculateCreditTotalsFromHtml(sampleHtml, {
      CHE1013: "A", // override B+ to A
    });
    // CHE1013: 3 credits * 4.0 (A) = 12.0
    expect(accum.chem.gradePoints).toBeCloseTo(12.0, 1);
  });
});

// ---------------------------------------------------------------------------
// addManualSubjects
// ---------------------------------------------------------------------------
describe("addManualSubjects", () => {
  it("adds manual subjects to accumulator", () => {
    const accum = initDepartmentCredits();
    addManualSubjects(accum, ["AMT1232", "PHY2013"], ["A+", "B"]);

    expect(accum.total.credits).toBe(5);
    expect(accum.math.credits).toBe(2);
    expect(accum.phy.credits).toBe(3);
  });

  it("skips empty entries", () => {
    const accum = initDepartmentCredits();
    addManualSubjects(accum, ["AMT1232", ""], ["A+", ""]);

    expect(accum.total.credits).toBe(2);
  });

  it("handles Latin letter credit codes (a, b, d)", () => {
    const accum = initDepartmentCredits();
    addManualSubjects(accum, ["AMT123a"], ["A+"]);

    expect(accum.total.credits).toBe(1.5);
    expect(accum.total.gradePoints).toBe(6.0);
  });
});
