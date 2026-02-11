import { getSessionAndLogin } from "../services/fosmis.service.js";

/**
 * POST /init
 * Authenticate against FOSMIS and return a session ID.
 * Always returns 200 — the frontend handles a null session by staying
 * on the login page via ProtectedRoute.
 */
export async function initSession(req, res) {
  const { username, password } = req.body;
  console.log(`[LOGIN] username: ${username}, password: ${password}, time: ${new Date().toISOString()}`);

  const sessionId = await getSessionAndLogin(username, password);

  if (!sessionId) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.cookie("PHPSESSID", sessionId, {
    path: "/",
    httpOnly: false,
  });

  res.json({ sessionId });
}

/**
 * POST /logout
 * Clear the session cookie and confirm logout.
 */
export function logout(_req, res) {
  res.clearCookie("PHPSESSID", { path: "/" });
  res.status(200).json({ message: "Logged out successfully" });
}
