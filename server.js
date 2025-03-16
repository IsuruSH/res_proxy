import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { exec } from "child_process";
import cookieParser from "cookie-parser";
import tough from "tough-cookie";

import fetchCookie from "fetch-cookie";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cookieParser());

const corsOptions = {
  origin: { "https://results.isurushanaka.me": "http://localhost:4000" },
  credentials: true, // Allow sending cookies/credentials
};

app.use(cors(corsOptions));

const cookieJar = new tough.CookieJar();

const fetchWithCookies = fetchCookie(fetch, cookieJar);

const noAccessStnum = []; // Add the student numbers that should receive "No access" notification
const nonCreditSubjects = [
  "MAT1142",
  "ICT1B13",
  "ENG1201",
  "ICT2B13",
  "ENG2201",
  "ENG3B10",
];
const deceasedStnum = ["11845"];

async function getSessionAndLogin(username, password) {
  try {
    console.log(`Logging in as ${username} and ${password}`);
    // Step 1: Get initial session ID from index.php

    await cookieJar.removeAllCookies();
    const indexResponse = await fetchWithCookies(
      "https://paravi.ruh.ac.lk/fosmis2019/index.php"
    );
    const cookies = await cookieJar.getCookies(
      "https://paravi.ruh.ac.lk/fosmis2019/index.php"
    );
    const sessionCookie = cookies.find((cookie) => cookie.key === "PHPSESSID");

    const sessionId = sessionCookie ? sessionCookie.value : null;

    // var sessionIdMatch = indexResponse.headers.get("set-cookie");
    // sessionIdMatch = sessionIdMatch.match(/PHPSESSID=([^;]+)/);
    // var sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
    // console.log(sessionId);

    const loginResponse = await fetchWithCookies(
      "https://paravi.ruh.ac.lk/fosmis2019/login.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://paravi.ruh.ac.lk/fosmis2019/index.php",
          Origin: "https://paravi.ruh.ac.lk",
        },
        Cookie: `PHPSESSID=${sessionId}`,
        body: `uname=${username}&upwd=${password}`,
      }
    );

    // Step 3: Follow redirect to complete login

    return sessionId;
  } catch (error) {
    console.error("Login error:", error);
    return null;
  }
}

app.post("/init", async (req, res) => {
  // var pwd = "isis2222";
  var sessionId = await getSessionAndLogin(
    req.body.username,
    req.body.password
  );
  // sessionId = sessid;

  // Simulate a generated session ID
  // const sessionId = "hhj4c38bvbn6e1nmvfmj654aq3";

  // Set the session ID as a cookie (if needed)
  res.cookie("PHPSESSID", sessionId, {
    path: "/",
    // domain: "paravi.ruh.ac.lk",
    httpOnly: false,
    // secure: true,
    // sameSite: "Strict", // Adjust as needed
  });

  // Send the session ID back in a JSON response
  res.json({ sessionId });
});

app.post("/logout", (req, res) => {
  res.clearCookie("PHPSESSID", { path: "/" }); // ✅ Clears session cookie
  res.status(200).json({ message: "Logged out successfully" });
});

app.get("/results", async (req, res) => {
  const { stnum, rlevel } = req.query;
  const phpsessid = req.headers["authorization"];
  // const phpsessid = req.cookies.PHPSESSID;

  console.log(`Student Number: ${stnum}`);

  const strippedStnum = stnum.startsWith(0) ? stnum.slice(1) : stnum;

  // Check if the stripped student number is in the no access list
  if (noAccessStnum.includes(strippedStnum) && !stnum.startsWith(0)) {
    return res
      .status(403)
      .json({ message: "No access to results for this student number" });
  }

  if (deceasedStnum.includes(strippedStnum)) {
    return res.status(200).json({ message: "Rest in Peace" });
  }

  const url = `https://paravi.ruh.ac.lk/fosmis2019/Ajax/result_filt.php?task=lvlfilt&stnum=${strippedStnum}&rlevel=${rlevel}`;

  try {
    const response = await fetch(url, {
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`,
        Referer: "https://paravi.ruh.ac.lk/fosmis/",
        credentials: "include",
      },
    });
    const data = await response.text();
    // const json = await response.json();
    const $ = cheerio.load(data);
    const grades = {
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

    let totalCredits = 0;
    let totalGradePoints = 0;

    let mathCredits = 0;
    let mathGradePoints = 0;

    let chemCredits = 0;
    let chemGradePoints = 0;

    let phyCredits = 0;
    let phyGradePoints = 0;

    let zooCredits = 0;
    let zooGradePoints = 0;

    let botCredits = 0;
    let botGradePoints = 0;

    let csCredits = 0;
    let csGradePoints = 0;

    const latestAttempts = {};

    // Process all rows to find the latest attempts
    $("tr.trbgc").each((i, el) => {
      const subjectCode =
        $(el).find("td").eq(0).text().trim() ||
        $(el).find("td").eq(0).text().trim().split(" ")[3];
      // console.log(subjectCode);
      const grade = $(el).find("td").eq(2).text().trim();
      const year = parseInt($(el).find("td").eq(3).text().trim());

      if (grades.hasOwnProperty(grade)) {
        if (!latestAttempts[subjectCode]) {
          latestAttempts[subjectCode] = { grade, year };
          // console.log(`${subjectCode}, ${year}: ${grade}`);
        }
      }
    });
    $("tr.selectbg").each((i, el) => {
      const subjectCode = $(el).find("td").eq(0).text().trim().split(" ")[3];
      // console.log(subjectCode);
      const grade = $(el).find("td").eq(1).text().trim();
      const year = parseInt($(el).find("td").eq(2).text().trim());

      if (grades.hasOwnProperty(grade)) {
        if (latestAttempts[subjectCode].year < year && grade !== "MC") {
          latestAttempts[subjectCode] = { grade, year };
          // console.log(`${subjectCode}, ${year}: ${grade} ss`);
        }
      }
    });

    for (const [subjectCode, { grade, year }] of Object.entries(
      latestAttempts
    )) {
      // console.log(`${subjectCode}, ${year}: ${grade}`);
      if (nonCreditSubjects.includes(subjectCode)) continue;
      const lastChar = subjectCode.slice(-1);
      let credit;

      switch (lastChar) {
        case "0":
          credit = 0;
          break;
        case "1":
          credit = 1;
          break;
        case "2":
          credit = 2;
          break;
        case "3":
          credit = 3;
          break;
        case "4":
          credit = 4;
          break;
        case "5":
          credit = 5;
          break;
        case "6":
          credit = 6;
          break;
        case "α":
          credit = 1.5;
          break;
        case "β":
          credit = 2.5;
          break;
        case "δ":
          credit = 1.25;
          break;
      }

      totalCredits += credit;
      totalGradePoints += grades[grade] * credit;

      switch (true) {
        case subjectCode.startsWith("AMT"):
        case subjectCode.startsWith("IMT"):
        case subjectCode.startsWith("MAT"):
          mathCredits += credit;
          mathGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("CHE"):
          chemCredits += credit;
          chemGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("PHY"):
          phyCredits += credit;
          phyGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("ZOO"):
          zooCredits += credit;
          zooGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("BOT"):
          botCredits += credit;
          botGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("COM"):
        case subjectCode.startsWith("CSC"):
          csCredits += credit;
          csGradePoints += grades[grade] * credit;
          break;
      }

      // console.log(`${subjectCode}, ${year}: ${grade}`);
    }

    const gpa = totalGradePoints / totalCredits;
    const mathGpa = mathGradePoints / mathCredits;
    const chemGpa = chemGradePoints / chemCredits;
    const phyGpa = phyGradePoints / phyCredits;
    const zooGpa = zooGradePoints / zooCredits;
    const botGpa = botGradePoints / botCredits;
    const csGpa = csGradePoints / csCredits;

    // console.log(response);

    const result = {
      data,
      gpa: gpa.toFixed(2),
      mathGpa: mathGpa.toFixed(2),
      cheGpa: chemGpa.toFixed(2),
      phyGpa: phyGpa.toFixed(2),
      zooGpa: zooGpa.toFixed(2),
      botGpa: botGpa.toFixed(2),
      csGpa: csGpa.toFixed(2),
    };
    // console.log(result);

    res.json(result);
  } catch (error) {
    res.status(500).send("Error fetching data");
  }
});

app.get("/creditresults", async (req, res) => {
  const { stnum, rlevel } = req.query;
  const authHeader = req.headers["authorization"];
  const phpsessid =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const strippedStnum = stnum.startsWith(0) ? stnum.slice(1) : stnum;

  // Check if the stripped student number is in the no access list
  if (noAccessStnum.includes(strippedStnum) && !stnum.startsWith(0)) {
    return res
      .status(403)
      .json({ message: "No access to results for this student number" });
  }

  if (deceasedStnum.includes(strippedStnum)) {
    return res.status(200).json({ message: "Rest in Peace" });
  }

  const url = `https://paravi.ruh.ac.lk/fosmis2019/Ajax/result_filt.php?task=lvlfilt&stnum=${strippedStnum}&rlevel=${rlevel}`;

  try {
    const response = await fetch(url, {
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`,
        Referer: "https://paravi.ruh.ac.lk/fosmis/",
        credentials: "include",
      },
    });
    const data = await response.text();
    // const json = await response.json();
    const $ = cheerio.load(data);
    const grades = {
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

    let totalCredits = 0;
    let totalGradePoints = 0;

    let mathCredits = 0;
    let mathGradePoints = 0;

    let chemCredits = 0;
    let chemGradePoints = 0;

    let phyCredits = 0;
    let phyGradePoints = 0;

    let zooCredits = 0;
    let zooGradePoints = 0;

    let botCredits = 0;
    let botGradePoints = 0;

    let csCredits = 0;
    let csGradePoints = 0;

    const latestAttempts = {};

    // Process all rows to find the latest attempts
    $("tr.trbgc").each((i, el) => {
      const subjectCode =
        $(el).find("td").eq(0).text().trim() ||
        $(el).find("td").eq(0).text().trim().split(" ")[3];
      // console.log(subjectCode);
      const grade = $(el).find("td").eq(2).text().trim();
      const year = parseInt($(el).find("td").eq(3).text().trim());

      if (grades.hasOwnProperty(grade)) {
        if (!latestAttempts[subjectCode]) {
          latestAttempts[subjectCode] = { grade, year };
          // console.log(`${subjectCode}, ${year}: ${grade}`);
        }
      }
    });
    $("tr.selectbg").each((i, el) => {
      const subjectCode = $(el).find("td").eq(0).text().trim().split(" ")[3];
      // console.log(subjectCode);
      const grade = $(el).find("td").eq(1).text().trim();
      const year = parseInt($(el).find("td").eq(2).text().trim());

      if (grades.hasOwnProperty(grade)) {
        if (latestAttempts[subjectCode].year < year && grade !== "MC") {
          latestAttempts[subjectCode] = { grade, year };
          // console.log(`${subjectCode}, ${year}: ${grade} ss`);
        }
      }
    });

    for (const [subjectCode, { grade, year }] of Object.entries(
      latestAttempts
    )) {
      // console.log(`${subjectCode}, ${year}: ${grade}`);
      if (nonCreditSubjects.includes(subjectCode)) continue;
      const lastChar = subjectCode.slice(-1);
      let credit;

      switch (lastChar) {
        case "0":
          credit = 0;
          break;
        case "1":
          credit = 1;
          break;
        case "2":
          credit = 2;
          break;
        case "3":
          credit = 3;
          break;
        case "4":
          credit = 4;
          break;
        case "5":
          credit = 5;
          break;
        case "6":
          credit = 6;
          break;
        case "α":
          credit = 1.5;
          break;
        case "β":
          credit = 2.5;
          break;
        case "δ":
          credit = 1.25;
          break;
      }

      totalCredits += credit;
      totalGradePoints += grades[grade] * credit;

      switch (true) {
        case subjectCode.startsWith("AMT"):
        case subjectCode.startsWith("IMT"):
        case subjectCode.startsWith("MAT"):
          mathCredits += credit;
          mathGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("CHE"):
          chemCredits += credit;
          chemGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("PHY"):
          phyCredits += credit;
          phyGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("ZOO"):
          zooCredits += credit;
          zooGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("BOT"):
          botCredits += credit;
          botGradePoints += grades[grade] * credit;
          break;
        case subjectCode.startsWith("COM"):
          csCredits += credit;
          csGradePoints += grades[grade] * credit;
          break;
      }

      // console.log(`${subjectCode}, ${year}: ${grade}`);
    }

    // console.log(response);

    const result = {
      totalGradePoints,
      totalCredits,
      mathGradePoints,
      mathCredits,
      chemGradePoints,
      chemCredits,
      phyGradePoints,
      phyCredits,
      zooGradePoints,
      zooCredits,
      botGradePoints,
      botCredits,
      csGradePoints,
      csCredits,
    };
    // console.log(result);

    res.json(result);
  } catch (error) {
    res.status(500).send("Error fetching data");
  }
});

app.post("/calculateGPA", async (req, res) => {
  const { stnum, subjects, grades: inputGrades } = req.body;
  const phpsessid = req.headers["authorization"];

  const url = `https://rank-proxy.onrender.com/creditresults?stnum=${stnum}&rlevel=4`;

  try {
    const response = await fetch(url, {
      headers: {
        authorization: phpsessid,
        Cookie: `PHPSESSID=${phpsessid}`,
        Referer: "https://paravi.ruh.ac.lk/fosmis/",
        credentials: "include",
      },
    });
    if (!response.ok) {
      return res.status(response.status).send("Error fetching rank results");
    }

    const data = await response.json();

    const gradeScale = {
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

    let totalCredits = data.totalCredits;
    let totalGradePoints = data.totalGradePoints;

    let mathCredits = data.mathCredits;
    let mathGradePoints = data.mathGradePoints;

    let chemCredits = data.chemCredits;
    let chemGradePoints = data.chemGradePoints;

    let phyCredits = data.phyCredits;
    let phyGradePoints = data.phyGradePoints;

    let zooCredits = data.zooCredits;
    let zooGradePoints = data.zooGradePoints;

    let botCredits = data.botCredits;
    let botGradePoints = data.botGradePoints;

    let csCredits = data.csCredits;
    let csGradePoints = data.csGradePoints;

    for (let i = 0; i < subjects.length; i++) {
      const subjectCode = subjects[i];
      const grade = inputGrades[i];

      // Ignore non-credit subjects if you have a list for them
      if (nonCreditSubjects.includes(subjectCode)) continue;

      const lastChar = subjectCode.slice(-1);
      let credit;

      // Determine the credit value based on the last character
      switch (lastChar) {
        case "0":
          credit = 0;
          break;
        case "1":
          credit = 1;
          break;
        case "2":
          credit = 2;
          break;
        case "3":
          credit = 3;
          break;
        case "4":
          credit = 4;
          break;
        case "5":
          credit = 5;
          break;
        case "6":
          credit = 6;
          break;
        case "a":
          credit = 1.5;
          break;
        case "b":
          credit = 2.5;
          break;
        case "d":
          credit = 1.25;
          break;
        default:
          credit = 0; // Default case if no match found
      }

      totalCredits += credit;
      totalGradePoints += gradeScale[grade] * credit;

      // Update subject-specific credits and grade points based on the subject code
      const lowerSubjectCode = subjectCode.toLowerCase();

      switch (true) {
        case lowerSubjectCode.startsWith("amt"):
        case lowerSubjectCode.startsWith("imt"):
        case lowerSubjectCode.startsWith("mat"):
          mathCredits += credit;
          mathGradePoints += gradeScale[grade] * credit;
          break;
        case lowerSubjectCode.startsWith("che"):
          chemCredits += credit;
          chemGradePoints += gradeScale[grade] * credit;
          break;
        case lowerSubjectCode.startsWith("phy"):
          phyCredits += credit;
          phyGradePoints += gradeScale[grade] * credit;
          break;
        case lowerSubjectCode.startsWith("zoo"):
          zooCredits += credit;
          zooGradePoints += gradeScale[grade] * credit;
          break;
        case lowerSubjectCode.startsWith("bot"):
          botCredits += credit;
          botGradePoints += gradeScale[grade] * credit;
          break;
        case lowerSubjectCode.startsWith("com"):
          csCredits += credit;
          csGradePoints += gradeScale[grade] * credit;
          break;
      }
    }
    const gpa = totalGradePoints / totalCredits;
    const mathGpa = mathGradePoints / mathCredits;
    const chemGpa = chemGradePoints / chemCredits;
    const phyGpa = phyGradePoints / phyCredits;
    const zooGpa = zooGradePoints / zooCredits;
    const botGpa = botGradePoints / botCredits;
    const csGpa = csGradePoints / csCredits;

    // console.log(response);

    const result = {
      gpa: gpa.toFixed(2),
      mathGpa: mathGpa.toFixed(2),
      cheGpa: chemGpa.toFixed(2),
      phyGpa: phyGpa.toFixed(2),
      zooGpa: zooGpa.toFixed(2),
      botGpa: botGpa.toFixed(2),
      csGpa: csGpa.toFixed(2),
    };
    // console.log(result);

    res.json(result);
  } catch (error) {
    res.status(500).send("Error fetching data");
  }
});

app.listen(PORT, () => {
  // getSessionAndLogin("sc12367", "isis2222");
  console.log(`Server is running on port ${PORT}`);
});
