/**
 * Grade scale mapping: grade string -> grade point value.
 */
export const GRADE_SCALE = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  E: 0.0,
  "E*": 0.0,
  "E+": 0.0,
  "E-": 0.0,
  F: 0.0,
  MC: 0.0,
};

/**
 * Credit value mapping: last character of subject code -> credit value.
 * Includes both FOSMIS Greek letters and user-entered Latin equivalents.
 */
export const CREDIT_MAP = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "\u03B1": 1.5, // α (Greek alpha)
  "\u03B2": 2.5, // β (Greek beta)
  "\u03B4": 1.25, // δ (Greek delta)
  a: 1.5, // Latin 'a' (user-entered substitute for α)
  b: 2.5, // Latin 'b' (user-entered substitute for β)
  d: 1.25, // Latin 'd' (user-entered substitute for δ)
};

/**
 * Subjects excluded from GPA calculation (zero-credit or non-academic).
 */
export const NON_CREDIT_SUBJECTS = [
  "MAT1142",
  "ICT1B13",
  "ENG1201",
  "ICT2B13",
  "ENG2201",
  "ENG3B10",
];

/**
 * Student numbers blocked from viewing results.
 */
export const NO_ACCESS_STNUM = [];

/**
 * Deceased student numbers - shown a memorial message instead of results.
 */
export const DECEASED_STNUM = ["11845"];

/**
 * Department prefix mapping for subject-wise GPA calculation.
 */
export const DEPARTMENT_PREFIXES = {
  math: ["AMT", "IMT", "MAT"],
  chem: ["CHE"],
  phy: ["PHY"],
  zoo: ["ZOO"],
  bot: ["BOT"],
  cs: ["COM", "CSC"],
};
