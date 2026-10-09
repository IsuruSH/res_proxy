# ResultView Server (res_proxy)

GPA Calculator API — proxy server for University of Ruhuna FOSMIS student results.

FOSMIS (`https://paravi.ruh.ac.lk/fosmis2019`) is a legacy PHP portal. It has no API: every page is HTML gated behind a `PHPSESSID` cookie, and it sends no CORS headers. A browser therefore cannot talk to it directly. This server sits in the middle — it holds the FOSMIS session, fetches the HTML, parses it with cheerio, and hands the client clean JSON.

```
React SPA (Vercel)  ──►  res_proxy (Render)  ──►  FOSMIS PHP portal
results.isurushanaka.me   res-proxy.onrender.com   paravi.ruh.ac.lk
```

Nothing is persisted. Every request is a live scrape, with a short-lived in-memory cache in front of it.

## Project Structure

```
res_proxy/
├── src/
│   ├── index.js              # Entry point — starts the server, runs the keep-alive ping
│   ├── app.js                # Express app: middleware, /health, route mounting
│   ├── config/               # Environment-based configuration (dotenv)
│   ├── constants/            # Grade scale, credit map, department prefixes, exclusion lists
│   ├── routes/               # Route definitions — one file per feature area
│   ├── controllers/          # Request handling: params in, JSON out
│   ├── services/
│   │   ├── fosmis.service.js  # All outbound FOSMIS calls (login, fetch, retry, timeout)
│   │   ├── cache.service.js   # Per-session in-memory TTL cache
│   │   └── notices.service.js # Global notices store (shared by all students)
│   ├── middleware/           # CORS, error handler, student-number guard
│   └── utils/
│       ├── gpa.js            # Results HTML parsing and GPA/credit maths
│       └── notices.js        # Notice board HTML parsing
├── tests/
│   ├── unit/gpa.test.js          # Parsing + GPA utilities
│   └── integration/routes.test.js # Route behaviour with FOSMIS mocked
├── .env.example              # Template — copy to .env
├── jest.config.js
└── package.json
```

The dependency direction is one-way: `routes → controllers → services → utils`. `utils/gpa.js` is pure — it takes HTML or plain objects and returns data, never touching the network.

## Quick Start

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start dev server (with auto-reload)
npm run dev
```

The server starts on `http://localhost:4000`.

### Production

```bash
npm start
```

## Environment Variables

| Variable | Development | Production |
|----------|-------------|------------|
| `PORT` | `4000` | (set by platform) |
| `NODE_ENV` | `development` | `production` |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | `https://results.isurushanaka.me` |
| `FOSMIS_BASE_URL` | `https://paravi.ruh.ac.lk/fosmis2019` | same |

`CORS_ORIGINS` is a comma-separated list. Defaults live in [src/config/index.js](src/config/index.js).

## Authentication

`POST /init` logs into FOSMIS in three steps, and the third one is not optional:

1. `GET /index.php` to obtain a `PHPSESSID` cookie.
2. `POST /login.php` with `uname` / `upwd`.
3. `GET /index.php` again and check whether the response still contains a login form.

Step 3 exists because **FOSMIS returns HTTP 200 on a failed login** — the status code tells you nothing. The only reliable signal is whether the page you get back is still the login page. See [`getSessionAndLogin`](src/services/fosmis.service.js).

The `sessionId` returned to the client **is** the FOSMIS `PHPSESSID`. Clients send it back on every subsequent request in the `authorization` header, with or without a `Bearer ` prefix — [`extractSession`](src/utils/gpa.js) accepts both. It is also set as a cookie.

Each login gets its own `tough-cookie` jar so concurrent logins cannot contaminate each other's sessions.

**Two failure modes, two status codes.** A rejected password returns **401**; FOSMIS being unreachable throws `FosmisUnreachableError` and returns **503**. Keep these apart — reporting a timeout as "invalid credentials" sends students off to reset a password that was never wrong. Login steps also get a longer per-attempt budget (`LOGIN_TIMEOUT_MS`, 25s) with fewer retries than other calls, because FOSMIS has been seen taking 18s just to send headers.

**The login body must be URL-encoded.** It is built with `URLSearchParams`, not string interpolation. Interpolating a raw password silently breaks every account whose password contains `&` (truncated at the separator — `Ama&2004` arrives as `Ama`) or `+` (decoded as a space). That failure is permanent and per-user, so it reads as "login works for most people" rather than as a bug.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check. Returns `{ status, uptime }`. |
| `POST` | `/init` | — | Log in. Body: `{ username, password, stnum?, rlevel? }` → `{ sessionId, results }`. |
| `POST` | `/logout` | cookie | Clear the session cookie and purge its cache entries. |
| `GET` | `/results?stnum=&rlevel=` | yes | Results, all GPAs, and analytics. |
| `GET` | `/creditresults?stnum=&rlevel=` | yes | Flat per-department credit and grade-point totals. |
| `POST` | `/calculateGPA` | yes | GPA with manual subjects and repeated-grade overrides. |
| `GET` | `/home-data` | yes | Student name, mentor details, profile photo URL. |
| `GET` | `/course-registration` | yes | Registered courses, confirmed credits, Non-Degree subjects. |
| `GET` | `/notices` | yes | Notice board as JSON. |
| `GET` | `/notices/stream` | yes | Notice board as Server-Sent Events. |
| `GET` | `/notices/proxy?url=&session=` | — | Re-serve a notice file past CORS. |

`rlevel` is `1`, `2`, `3`, or `4` for all levels.

### `POST /init` — the login pre-fetch

When the client sends `stnum` and `rlevel` (it always does), the server fetches and parses the student's results **inside the same request** and returns them alongside the `sessionId`. This saves a full round-trip on first load, so the client's Results page can paint immediately after login instead of showing a spinner.

If that pre-fetch fails it is swallowed and logged — `sessionId` is still returned, and the client falls back to fetching results itself.

### `GET /results` — response shape

```
{
  data,                // raw FOSMIS HTML, re-rendered by the client's ResultsTable
  repeatedSubjects,    // subjects whose best grade is still below C
  subjectBreakdown,    // per-subject rows, sorted by year → semester → code
  gpa, mathGpa, cheGpa, phyGpa, zooGpa, botGpa, csGpa,
  gradeDistribution,   // { "A+": 3, "B": 5, ... }
  levelGpas,           // { level1, level2, level3 }
  totalCredits, totalGradePoints,
  confirmedCredits,    // from the course registration page
  nonDegreeSubjects
}
```

GPA values are strings fixed to 2 decimals, or the string `"NaN"` when a department has no credits.

### The three notices endpoints

**Notices are identical for every student**, and that fact drives the whole design. The FOSMIS notices page (`form_53_a.php`) carries 6000+ rows, is ~1 MB, and can take 45 seconds to arrive — so fetching and parsing it per student was both the slowest thing the server did and its main source of event-loop stalls.

[notices.service.js](src/services/notices.service.js) therefore holds **one global copy of the parsed result**, not one per session:

- **One entry, 15-minute TTL.** Notices change a few times a week.
- **In-flight deduplication.** Ten students opening the dashboard on a cold cache share one upstream fetch instead of starting ten.
- **Stale-on-error.** If FOSMIS is unreachable, the last known notices are served rather than failing the dashboard.

`GET /notices` returns the board as JSON. `GET /notices/stream` emits the same notices one at a time over SSE — but from memory, so it is normally instant; only the first request after the TTL expires reaches FOSMIS. Previous notices are capped at 50.

Two things in this area must not regress:

1. **Parse once per refresh, never per chunk.** An earlier version called `cheerio.load(fullHtml)` on every network chunk, re-parsing the whole accumulating document. That is O(n²) synchronous CPU — measured at **4.5s of blocking versus 125ms for a single parse**, a 36× waste. Because Node is single-threaded, it starved every other request on the server: timers stopped firing on schedule, so unrelated requests hit their 15s abort deadlines and logins failed with `The operation was aborted`. If you reintroduce incremental parsing, it must not re-parse consumed input.
2. **The SSE handler sets its own `Access-Control-Allow-Origin`.** Deliberate — `res.flushHeaders()` sends headers before the `cors` middleware would otherwise apply. It also tracks `req.on("close")` so a user navigating away stops the write loop.

`GET /notices/proxy` re-serves an individual notice file through this server for files the browser can't embed cross-origin. It only accepts URLs beginning `https://paravi.ruh.ac.lk/fosmis`, and injects a `<base>` tag into HTML responses so their relative asset paths resolve.

## Domain Rules

These are the non-obvious rules the parsing and GPA maths depend on. They live in [src/constants/index.js](src/constants/index.js) and [src/utils/gpa.js](src/utils/gpa.js).

**Credits are encoded in the subject code.** The last character gives the credit value — `MAT1142` is 2 credits. Greek letters mean fractional credits:

| Char | Credits | Char | Credits |
|------|---------|------|---------|
| `0`–`6` | 0–6 | `α` / `a` | 1.5 |
| | | `β` / `b` | 2.5 |
| | | `δ` / `d` | 1.25 |

The Latin `a`, `b`, `d` are accepted because users type them by hand when entering subjects manually. Regexes that touch subject codes must use `\S` rather than `\w`, or they will drop the Greek characters.

**Level, year, and semester** also come from the code. Level is the character at index 3 (`MAT1142` → level 1). Year and semester are the first two characters after the letter prefix. Semester stays a **string**, not a number — it can be a letter such as `B` for bridging courses.

**Two kinds of result rows.** FOSMIS emits regular attempts as `tr.trbgc` and repeat attempts as `tr.selectbg`, formatted `Repeat Attempt [ CODE - Subject Name ]`. A repeat attempt replaces the standing attempt when its grade is **better, or equal and from a later year**.

**Two exclusions from GPA**, applied together: the hardcoded `NON_CREDIT_SUBJECTS` list (English and ICT courses that carry no credit), and every subject marked "Non Degree" on the student's course registration page. The latter is why `/results` fetches the registration page in parallel — it cannot compute a correct GPA without it.

**A subject is "repeated"** only when its *best* grade across all attempts is still below C. Once a student passes, the subject drops off the list even if it was failed or carried an MC before.

**Departments** are matched by code prefix: `AMT`/`IMT`/`MAT` → math, `CHE` → chem, `PHY` → phy, `ZOO` → zoo, `BOT` → bot, `COM`/`CSC` → cs.

`DECEASED_STNUM` in the constants file causes `/results` to return a memorial message instead of results; the client renders it in place of the dashboard.

## Caching and Resilience

There are two independent caches, and the distinction matters: [cache.service.js](src/services/cache.service.js) holds **per-student** data keyed by session, while [notices.service.js](src/services/notices.service.js) holds the **one shared** notice board. Student results must never go in the global store.

**Session cache** — [cache.service.js](src/services/cache.service.js) is a `Map` with a 5-minute TTL, keyed `sessionId:endpoint:...` so sessions never collide. Long enough that navigating between pages is instant, short enough that a manual refresh picks up new results. A 60-second background sweep evicts abandoned entries; the interval is `unref`'d so it can't hold the process open. `POST /logout` deletes every key with the session's prefix.

**Outbound requests** — [`robustFosmisFetch`](src/services/fosmis.service.js) wraps every FOSMIS call with a timeout (15s default, 45s for notices), up to 2 retries with linear backoff on transient failures (`AbortError`, `ECONNRESET`, `ETIMEDOUT`, socket hang-up), and duration logging that warns above 2 seconds. Non-transient errors are not retried.

**Compression** — gzip on responses over 512 bytes, which matters because `/results` ships the raw FOSMIS HTML.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

The `--experimental-vm-modules` flag in the test scripts is required — this project is ESM (`"type": "module"`) and Jest needs it to load the modules under test.

- **`tests/unit/gpa.test.js`** covers [utils/gpa.js](src/utils/gpa.js): credit and department lookup, session extraction, subject-code and repeat-attempt parsing, credit accumulation, GPA formatting, and the full HTML → results pipeline including grade overrides.
- **`tests/integration/routes.test.js`** drives the routes through supertest with FOSMIS mocked out.

Note the gap: `/home-data`, `/course-registration`, and the three notices endpoints have no test coverage.

When adding an export to `fosmis.service.js`, add it to the mock factory at the top of `tests/integration/routes.test.js` too — that factory must cover every name any controller imports, or the whole suite fails to load rather than failing one test.

### Known failure

`npm test` currently reports **43 passing, 1 failing**. The one failure is a stale test, not a defect in the code:

- **`parseResultsHtml › identifies repeated subjects with low grades`.** The fixture has `CHE1013` at C- in 2020 and B+ on repeat in 2021, and the test expects it in `repeatedSubjects`. Under the current rule — a subject is repeated only while its *best* grade is below C — B+ is a pass, so excluding it is correct. The test encodes the older rule and should be updated.

## Deployment

Deployed on **Render**. Set the environment variables from the table above in the dashboard.

On the free tier Render spins a service down after inactivity, and the cold start is slow enough to be visible to users. [src/index.js](src/index.js) works around this by pinging its own `/health` every 45 seconds. It runs only when `NODE_ENV` is not `development`, and targets `localhost` rather than the public URL to avoid a DNS round-trip.
