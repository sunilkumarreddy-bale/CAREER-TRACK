# CareerTrack – Smart Job Application & Career Management System

CareerTrack keeps a job search in one place: applications, the status pipeline, interview dates, follow-up reminders, resume versions and analytics. Before this, the same information sat in Excel, Gmail, Calendar, Notes and a resume folder.

Built with the **MERN** stack: MongoDB, Express, React and Node.js.

| Problem (existing system) | CareerTrack solution |
| --- | --- |
| Information scattered across apps | Centralized dashboard |
| Hard to track applications | Status pipeline (Kanban board with drag & drop) |
| Missed follow-ups | Automatic follow-up reminders (in-app + optional email) |
| Forgotten interview dates | Interview calendar + email reminders 24h before |
| Hard to find applications | Search, filters, sorting, CSV export |
| No performance visibility | Analytics dashboard (response, interview, offer rates, trends) |
| Multiple resume versions | Resume management with per-resume performance |

## Features (8 modules)

1. **User / Login.** Register, log in, log out and edit your profile. Sessions use JWT in an httpOnly cookie. Changing your password signs out every other session, and deleting your account erases all of your data.
2. **Application management.** Add, edit, delete and view applications. Each one stores company, position, job link, salary, location, applied date, status, notes and the resume used.
3. **Status / Kanban.** Applied → Screening → Interview → Final Round → Offer / Rejected. Move cards by drag and drop, or with the stage menu on touch devices. Every status change is recorded in a history timeline.
4. **Search & filter.** Live search across company, position, location and notes. Filter by status, position, location, resume or "needs follow-up", then sort and paginate. Filters live in the URL, so a filtered view can be bookmarked, and the list exports to CSV.
5. **Interviews & reminders.** Schedule interviews with round, mode, time, location/link, notes and outcome. View them as a list or a month calendar. Applications with no activity for N days (default 7, configurable) are flagged for follow-up. A reminder bell shows interviews in the next 48h and any follow-ups due.
6. **Analytics.** Totals plus response, interview, offer and rejection rates, applications per month, the interview-conversion trend, status distribution, interviews by round and resume performance.
7. **Resume management.** Upload PDF/DOC/DOCX files (stored in MongoDB GridFS), then preview, download, rename or delete them. Link a resume to an application and see which version gets more interviews.
8. **Dashboard.** Summary stats, the pipeline bar, upcoming interviews, follow-ups due and recent activity.

All rates use the same denominator (total applications). The dashboard, pipeline and analytics therefore always agree.

## Architecture

```
React (Vite) SPA ──REST/JSON──▶ Express API ──Mongoose──▶ MongoDB (data + GridFS resumes)
                                   │
                                   └── node-cron scheduler ──SMTP──▶ email reminders (optional)
```

In production, Express serves the built React app, so the whole system deploys as **one container or service**.

```
├── server/                 Express API
│   ├── src/
│   │   ├── config/         env validation (zod), MongoDB connection
│   │   ├── models/         User, Application, Interview, Resume
│   │   ├── routes/         auth, applications, interviews, resumes, insights (dashboard/analytics/reminders)
│   │   ├── services/       analytics, GridFS storage, mailer, scheduler
│   │   ├── middleware/     auth, CSRF header check, validation, errors
│   │   ├── app.js          Express app (security headers, rate limits, static SPA)
│   │   ├── server.js       entry point with graceful shutdown
│   │   └── seed.js         demo data
│   └── test/               API integration tests (node:test + supertest, real MongoDB)
├── client/                 React 18 + React Router 7 + Recharts
│   └── src/{pages,components,context,hooks,api,utils}
├── Dockerfile              multi-stage production image (non-root, healthcheck)
├── docker-compose.yml      MongoDB + app
└── render.yaml             Render blueprint
```

## Quick start (local development)

Prerequisites: **Node.js ≥ 22.12** and a MongoDB instance: a local server, `docker run -p 27017:27017 mongo:7`, or a free MongoDB Atlas cluster.

```bash
npm install
cp .env.example .env          # set MONGODB_URI and JWT_SECRET
npm run seed                  # optional: demo account demo@careertrack.app / Demo@12345
npm run dev                   # API on :5000, web app on http://localhost:5173
```

## Run with Docker (production-like)

```bash
cp .env.example .env          # set JWT_SECRET (MONGODB_URI is provided by compose)
docker compose up -d --build
# open http://localhost:5000
docker compose exec app node server/src/seed.js   # optional demo data
```

## Deploy

**Single service (recommended).** Build the Docker image, or run `npm ci && npm run build && npm start`, on any Node host: Render, Railway, Fly.io, a VPS and so on. Point `MONGODB_URI` at MongoDB Atlas.

- **Render:** push to GitHub → *New → Blueprint* → select this repo (`render.yaml`) → set `MONGODB_URI`.
- Health check endpoint: `GET /api/health`. It returns 503 if the database is unreachable.
- Behind HTTPS, cookies are `Secure` automatically (`NODE_ENV=production`).

**Separate frontend (optional).** Host `client/dist` on Vercel or Netlify with `VITE_API_URL=https://your-api`. Set `CLIENT_ORIGIN=https://your-frontend` and `COOKIE_SAMESITE=none` on the API.

### Environment variables

See [`.env.example`](.env.example). Only `MONGODB_URI` and `JWT_SECRET` (≥ 32 chars) are required. The server refuses to start if the configuration is invalid. Email reminders turn on when `SMTP_HOST` is set and the user enables them in **Settings**.

## Security

- Passwords are hashed with bcrypt (12 rounds). The JWT lives in an `httpOnly`, `SameSite` cookie, and a token version allows server-side session revocation.
- CSRF protection: state-changing requests must carry an `X-Requested-With` header, which cross-origin pages can't send without passing CORS.
- Every input is validated with zod and coerced to primitives, which blocks NoSQL operator injection. Every query is scoped to the logged-in user.
- Helmet sets security headers, including a strict CSP. Auth endpoints and the API are rate-limited, and the JSON body is capped at 100 KB.
- Uploads are checked by extension, MIME type and magic bytes, with a size limit. Files are streamed from GridFS only to their owner.
- CSV export neutralises spreadsheet formula injection. Email HTML is escaped.
- The Docker image runs as a non-root user.

## Testing

```bash
MONGODB_URI_TEST=mongodb://127.0.0.1:27017 npm test   # API (33 tests) + client (11 tests)
npm run lint
npm run build
```

API tests run against a real MongoDB, each test file in its own throw-away database. They cover auth, per-user data isolation, validation, search and filters, the status history, follow-ups, interviews, resume uploads (including spoofed files and size limits), the analytics math and the email reminder scheduler. CI (`.github/workflows/ci.yml`) runs lint, tests, the build, `npm audit` and a Docker build on every push and pull request.

## API overview

All routes are prefixed with `/api`. Everything except `auth/register`, `auth/login` and `health` requires a session.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Session management |
| GET / PATCH / DELETE | `/auth/me` | Profile & settings / delete account |
| POST | `/auth/change-password` | Change password (revokes other sessions) |
| GET / POST | `/applications` | List (q, status, position, location, resume, followUp, sort, page, limit) / create |
| GET | `/applications/filters`, `/applications/export` | Filter options / CSV export |
| GET / PATCH / DELETE | `/applications/:id` | Detail (with interviews) / update / delete |
| PATCH | `/applications/:id/status` | Change status |
| POST | `/applications/:id/follow-up` | Mark as followed up |
| GET / POST | `/interviews` | List (from, to, application, upcoming, outcome) / create |
| PATCH / DELETE | `/interviews/:id` | Update / delete |
| GET / POST | `/resumes` | List / upload (multipart: `file`, `label`) |
| GET | `/resumes/:id/download` | Download (`?inline=true` previews PDFs) |
| PATCH / DELETE | `/resumes/:id` | Rename / delete |
| GET | `/dashboard`, `/analytics?months=6`, `/reminders` | Insights |
| GET | `/health` | Liveness + DB status |

## Team

P. Bhargav · Pothana Varshith Sai · Bale Sunil Kumar Reddy · Vinay Babu
