# ResultView Server (res_proxy)

GPA Calculator API — Proxy server for University of Ruhuna FOSMIS student results.

## Project Structure

```
res_proxy/
├── src/
│   ├── index.js        # Entry point — starts the Express server
│   ├── app.js          # Express app setup, middleware, and route handlers
│   ├── config.js       # Environment-based configuration (dotenv)
│   ├── constants.js    # Grade scale, credit map, subject lists
│   ├── fosmis.js       # FOSMIS authentication and data fetching
│   └── gpa.js          # GPA calculation, HTML parsing, credit utilities
├── tests/
│   ├── gpa.test.js     # Unit tests for GPA utilities
│   └── app.test.js     # Integration tests for API routes
├── .env                # Local environment variables (git-ignored)
├── .env.example        # Template for environment variables
├── jest.config.js      # Jest configuration
├── package.json
└── server.js           # Legacy entry point (kept for reference)
```

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

Set environment variables on your hosting platform (e.g. Render):

| Variable | Production Value |
|----------|-----------------|
| `PORT` | (set by platform) |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://results.isurushanaka.me` |
| `FOSMIS_BASE_URL` | `https://paravi.ruh.ac.lk/fosmis2019` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/init` | Login to FOSMIS, returns `sessionId` |
| `POST` | `/logout` | Clear session |
| `GET` | `/results?stnum=&rlevel=` | Fetch results + GPAs |
| `GET` | `/creditresults?stnum=&rlevel=` | Fetch raw credit totals |
| `POST` | `/calculateGPA` | Calculate GPA with manual/repeated subjects |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```
