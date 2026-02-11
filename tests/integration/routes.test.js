import { jest } from "@jest/globals";

// Define mock functions externally so we have guaranteed references
const mockGetSessionAndLogin = jest.fn();
const mockFetchResultsHtml = jest.fn();

// Mock fosmis service before importing app
jest.unstable_mockModule("../../src/services/fosmis.service.js", () => ({
  getSessionAndLogin: mockGetSessionAndLogin,
  fetchResultsHtml: mockFetchResultsHtml,
}));

const { default: app } = await import("../../src/app.js");
const { default: request } = await import("supertest");

beforeEach(() => {
  mockGetSessionAndLogin.mockReset();
  mockFetchResultsHtml.mockReset();
});

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.uptime).toBeDefined();
  });
});

describe("POST /init", () => {
  it("returns sessionId on successful login", async () => {
    mockGetSessionAndLogin.mockResolvedValue("test-session-id");

    const res = await request(app)
      .post("/init")
      .send({ username: "sc12345", password: "MOCK_TEST_VALUE" });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe("test-session-id");
  });

  it("returns 200 with null sessionId when FOSMIS is unreachable", async () => {
    mockGetSessionAndLogin.mockResolvedValue(null);

    const res = await request(app)
      .post("/init")
      .send({ username: "sc12345", password: "MOCK_TEST_VALUE" });

    // Matches original behavior: always 200, frontend handles null session
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeNull();
  });
});

describe("POST /logout", () => {
  it("returns success message", async () => {
    const res = await request(app).post("/logout");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");
  });
});

describe("GET /results", () => {
  const sampleHtml = `
    <table>
      <tr class="trbgc">
        <td>1  SC  2020  AMT1232</td>
        <td>Applied Mathematics I</td>
        <td>A+</td>
        <td>2020</td>
      </tr>
    </table>
  `;

  it("returns 400 when stnum missing", async () => {
    const res = await request(app).get("/results?rlevel=4");
    expect(res.status).toBe(400);
  });

  it("returns results with GPAs", async () => {
    mockFetchResultsHtml.mockResolvedValue(sampleHtml);

    const res = await request(app)
      .get("/results?stnum=12345&rlevel=4")
      .set("authorization", "test-session");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.gpa).toBeDefined();
    expect(res.body.repeatedSubjects).toBeDefined();
  });

  it("returns Rest in Peace for deceased students", async () => {
    const res = await request(app).get("/results?stnum=11845&rlevel=4");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Rest in Peace");
  });
});

describe("GET /creditresults", () => {
  const sampleHtml = `
    <table>
      <tr class="trbgc">
        <td>1  SC  2020  AMT1232</td>
        <td>Applied Mathematics I</td>
        <td>A+</td>
        <td>2020</td>
      </tr>
    </table>
  `;

  it("returns credit totals", async () => {
    mockFetchResultsHtml.mockResolvedValue(sampleHtml);

    const res = await request(app)
      .get("/creditresults?stnum=12345&rlevel=4")
      .set("authorization", "Bearer test-session");

    expect(res.status).toBe(200);
    expect(res.body.totalCredits).toBeDefined();
    expect(res.body.mathCredits).toBeDefined();
  });
});

describe("POST /calculateGPA", () => {
  const sampleHtml = `
    <table>
      <tr class="trbgc">
        <td>1  SC  2020  AMT1232</td>
        <td>Applied Mathematics I</td>
        <td>A+</td>
        <td>2020</td>
      </tr>
    </table>
  `;

  it("calculates GPA with manual subjects", async () => {
    mockFetchResultsHtml.mockResolvedValue(sampleHtml);

    const res = await request(app)
      .post("/calculateGPA")
      .set("authorization", "Bearer test-session")
      .send({
        stnum: "12345",
        manualSubjects: {
          subjects: ["CHE1013"],
          grades: ["B+"],
        },
        repeatedSubjects: { subjects: [], grades: [] },
      });

    expect(res.status).toBe(200);
    expect(res.body.gpa).toBeDefined();
    expect(parseFloat(res.body.gpa)).toBeGreaterThan(0);
  });

  it("calculates GPA with repeated subject overrides", async () => {
    mockFetchResultsHtml.mockResolvedValue(sampleHtml);

    const res = await request(app)
      .post("/calculateGPA")
      .set("authorization", "Bearer test-session")
      .send({
        stnum: "12345",
        manualSubjects: { subjects: [], grades: [] },
        repeatedSubjects: {
          subjects: ["AMT1232"],
          grades: ["B+"],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.gpa).toBeDefined();
  });
});
