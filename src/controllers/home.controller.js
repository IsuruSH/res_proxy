import * as cheerio from "cheerio";
import { fetchHomepageHtml } from "../services/fosmis.service.js";
import { extractSession } from "../utils/gpa.js";

/**
 * GET /home-data
 * Scrape the authenticated FOSMIS homepage and return structured JSON
 * with student info, mentor details, and notices.
 */
export async function getHomeData(req, res) {
  const phpsessid = extractSession(req.headers["authorization"]);

  if (!phpsessid) {
    return res.status(401).json({ error: "No session" });
  }

  try {
    const html = await fetchHomepageHtml(phpsessid);
    const $ = cheerio.load(html);

    // --- Student name ---
    // The welcome text looks like: "Welcome! SHANAKA M.W.I.      [ Change My Password ]"
    let studentName = "";
    const bodyText = $("body").text();
    const welcomeMatch = bodyText.match(/Welcome!\s*([A-Z][A-Z\s.]+)/);
    if (welcomeMatch) {
      studentName = welcomeMatch[1].trim();
    }

    // --- Mentor details ---
    const mentor = {
      name: "",
      designation: "",
      department: "",
      email: "",
      internalTp: "",
      residence: "",
      mobile: "",
    };

    // The mentor table has header "Your Mentor's Details"
    $("table").each((_i, table) => {
      const headerText = $(table).find("th").first().text().trim();
      if (headerText.includes("Mentor")) {
        $(table)
          .find("tr")
          .each((_j, tr) => {
            const cells = $(tr).find("td");
            if (cells.length >= 2) {
              const label = $(cells[0]).text().trim().toLowerCase();
              const value = $(cells[1]).text().replace(/^:\s*/, "").trim();
              if (label.includes("name")) mentor.name = value;
              else if (label.includes("designation"))
                mentor.designation = value;
              else if (label.includes("department"))
                mentor.department = value;
              else if (label.includes("e-mail") || label.includes("email"))
                mentor.email = value;
              else if (label.includes("internal"))
                mentor.internalTp = value;
              else if (label.includes("residence"))
                mentor.residence = value;
              else if (label.includes("mobile")) mentor.mobile = value;
            }
          });
      }
    });

    // --- Notices from marquee ---
    let notices = [];
    const marqueeText = $("marquee").text().trim();
    if (marqueeText) {
      // Split by common delimiters found in the ticker
      notices = marqueeText
        .split(/:::News:::|(?=\s{3,})/)
        .map((n) => n.trim())
        .filter((n) => n.length > 5);
    }

    // --- Student photo URL ---
    let photoUrl = "";
    const imgs = $("img");
    imgs.each((_i, img) => {
      const src = $(img).attr("src") || "";
      if (src.includes("user_pictures") || src.includes("student_std_pics")) {
        if (src.startsWith("http")) {
          photoUrl = src;
        } else if (src.startsWith("../")) {
          // Relative to /fosmis/ — go up one level to root
          photoUrl = `https://paravi.ruh.ac.lk/${src.replace("../", "")}`;
        } else if (src.startsWith("/")) {
          photoUrl = `https://paravi.ruh.ac.lk${src}`;
        } else {
          photoUrl = `https://paravi.ruh.ac.lk/fosmis/${src}`;
        }
      }
    });

    res.json({
      studentName,
      mentor,
      notices,
      photoUrl,
    });
  } catch (err) {
    console.error("GET /home-data error:", err.message);
    res.status(500).json({ message: "Error fetching home data" });
  }
}
