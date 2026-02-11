import { NO_ACCESS_STNUM, DECEASED_STNUM } from "../constants/index.js";

/**
 * Validate and normalise a student number from the request.
 * Sends an error response and returns null when the student is blocked.
 * Returns the stripped student number on success.
 */
export function guardStudent(stnum, res) {
  if (!stnum) {
    res.status(400).json({ message: "Student number is required" });
    return null;
  }

  // FIX: startsWith(0) → startsWith("0")  (was comparing with number 0)
  const strippedStnum = stnum.startsWith("0") ? stnum.slice(1) : stnum;

  if (NO_ACCESS_STNUM.includes(strippedStnum) && !stnum.startsWith("0")) {
    res
      .status(403)
      .json({ message: "No access to results for this student number" });
    return null;
  }

  if (DECEASED_STNUM.includes(strippedStnum)) {
    res.status(200).json({ message: "Rest in Peace" });
    return null;
  }

  return strippedStnum;
}
