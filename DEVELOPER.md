# Developer Guide

Technical reference for setting up, developing, testing, and deploying Finan App.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22, Express.js |
| Database | MongoDB 7 (Mongoose ODM) |
| Auth | JWT (jsonwebtoken) + Google OAuth 2.0 (Passport.js) |
| Password hashing | bcrypt (salt 10) |
| Email | Resend SDK |
| Error monitoring | Sentry (`@sentry/node` + `@sentry/nextjs`) |
| File upload | Multer (`upload.array` for multi-file CSV) |
| Rate limiting | Custom in-process sliding-window (no Redis dependency) |
| Logging | Winston + Morgan |
| Testing | Mocha + Chai + mongodb-memory-server |
| Frontend | Next.js (App Router), React, Tailwind CSS v4 |
| Charts | Recharts |
| Frontend testing | Playwright E2E |
| AI service | Python 3.12, FastAPI, scikit-learn (Isolation Forest + Linear Regression) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions → GHCR → Watchtower (auto-deploy) |

---

## Repository layout

```
finan-app/                          ← monorepo root
├── docker-compose.yml              ← full-stack deployment (mongo + ai + backend + frontend + watchtower)
├── .env.example                    ← root environment template
├── Makefile                        ← dev and ops shortcuts
├── README.md                       ← product overview
├── DEVELOPER.md                    ← this file
│
├── finance-management-ai/          ← AI microservice (Python FastAPI)
│   ├── main.py                     ← FastAPI app, /health + /analyze endpoints
│   ├── Dockerfile
│   ├── requirements.txt
│   └── models/
│       ├── anomaly.py              ← Isolation Forest anomaly detection (z-score fallback)
│       └── forecast.py             ← Linear Regression month-end spending forecast
│
├── finance-management/             ← Backend (Express.js + MongoDB)
│   ├── app.js                      ← Express entry point (CORS, helmet, routes)
│   ├── Dockerfile
│   ├── controllers/
│   │   ├── auth.js                 ← register, login, google OAuth, change password,
│   │   │                             logout-all, delete account, forgot/reset password
│   │   ├── transaction.js          ← CRUD, analytics, anomalies, insights, import,
│   │   │                             ml-insights (proxies to AI service)
│   │   ├── goal.js                 ← savings goals
│   │   └── profile.js              ← get profile, update preferences, export CSV
│   ├── routers/
│   │   ├── auth.js                 ← all auth routes with rate limits
│   │   ├── transaction.js          ← transaction routes with rate limits
│   │   ├── goal.js                 ← goal routes with rate limits
│   │   └── profile.js              ← profile routes with rate limits
│   ├── models/
│   │   ├── user.model.js           ← password (bcrypt), tokenVersion, emailVerified, Google OAuth
│   │   ├── balance.model.js        ← running balance per user
│   │   ├── transaction.model.js    ← type enum: income | expense
│   │   ├── category.model.js       ← scoped per user
│   │   ├── goal.model.js
│   │   ├── snapshot.model.js       ← monthly income/expense totals (denormalised for speed)
│   │   ├── budget.model.js         ← per-month budget override { user, yearMonth, amount }
│   │   ├── preference.model.js     ← timezone, currency, numberFormat, monthlyBudget default
│   │   └── passwordReset.model.js  ← reset tokens with TTL index (auto-expires after 1h)
│   ├── dtos/
│   │   ├── base.dto.js
│   │   ├── transaction.dto.js      ← includes sanitizeText() for HTML/null-byte stripping
│   │   ├── auth.dto.js
│   │   └── goal.dto.js
│   ├── middleware/
│   │   ├── authJWT.js              ← JWT verification + tokenVersion check
│   │   ├── rateLimit.js            ← sliding-window limiter (byIp / byUser)
│   │   └── log.js                  ← Morgan request logger
│   ├── helpers/
│   │   ├── validator.js            ← express-validator rule sets
│   │   ├── mailer.js               ← Resend SDK (password reset + verification emails)
│   │   ├── snapshot.js             ← refreshSnapshot() helper
│   │   ├── cache.js                ← in-process request cache
│   │   └── logger.js               ← Winston logger
│   ├── config/
│   │   ├── db.js                   ← Mongoose connection
│   │   ├── keys.js                 ← env var exports
│   │   ├── passport.js             ← Google OAuth strategy
│   │   └── swagger.js              ← Swagger/OpenAPI config
│   └── test/
│       ├── README.md
│       ├── setup.js                ← in-memory MongoDB setup
│       ├── app.integration.test.js
│       ├── auth.integration.test.js
│       ├── transaction.integration.test.js
│       ├── goal.integration.test.js
│       └── end-to-end.test.js
│
└── finance-management-fe/          ← Frontend (Next.js 16 + Tailwind CSS v4)
    ├── Dockerfile
    ├── playwright.config.js        ← Playwright E2E config
    ├── app/
    │   ├── layout.js               ← root layout, ErrorBoundary, theme script
    │   ├── page.js                 ← Landing page (always light mode, SEO metadata)
    │   ├── robots.js               ← /robots.txt (blocks auth-required pages)
    │   ├── sitemap.js              ← /sitemap.xml (public pages only)
    │   ├── globals.css             ← Tailwind import + dark mode CSS overrides
    │   ├── dashboard/page.js       ← Balance, transactions, month picker
    │   ├── login/page.js           ← Login with forgot-password link
    │   ├── register/page.js
    │   ├── forgot-password/page.js ← Email form, anti-enumeration success message
    │   ├── reset-password/[token]/ ← Token validation + new password form
    │   ├── add/page.js             ← Add transaction with smart category suggestions
    │   ├── analytics/page.js       ← Monthly/yearly charts, category details table
    │   ├── range/page.js           ← Custom date range report
    │   ├── insights/page.js        ← Month Forecast (ML), Spending Alerts (ML), anomaly detection, explainability, runway
    │   ├── import/page.js          ← CSV bulk import with progress display
    │   ├── recommendation/page.js  ← 10 financial planning calculators
    │   ├── reports/page.js
    │   ├── profile/page.js         ← Financial identity, preferences, export, danger zone
    │   ├── settings/page.js        ← Theme toggle, change password, logout all, delete account
    │   ├── privacy/page.js         ← Privacy Policy
    │   ├── terms/page.js           ← Terms of Service
    │   └── auth/callback/page.js   ← Google OAuth callback handler
    ├── components/
    │   ├── Navbar.js               ← Desktop nav (frosted glass, pill active, animated Add button)
    │   ├── BottomNav.js            ← Mobile bottom nav (5 tabs + FAB Add, env(safe-area-inset-bottom))
    │   ├── AndroidBackHandler.js   ← PWA back-button handler (sentinel + "press back to exit" toast)
    │   ├── PageTransition.js       ← Slide-in animation keyed on pathname
    │   ├── SwipeToDelete.js        ← Touch swipe-to-reveal-delete (axis-locked, iOS/Android)
    │   ├── LandingNav.js           ← Landing page navigation (sticky)
    │   ├── LandingHeroCTA.js       ← Hero section CTA buttons
    │   ├── AuthGuard.js            ← Redirect to /login if not authenticated
    │   ├── AuthRedirect.js         ← Redirect to /dashboard if already authenticated
    │   ├── ErrorBoundary.js        ← React error boundary with reload button
    │   ├── ForceLightMode.js       ← Strips .dark class on landing page, restores on unmount
    │   ├── GoogleProvider.js       ← Google OAuth context wrapper
    │   ├── ThemeContext.js         ← Dark/light mode provider + localStorage
    │   ├── Tooltip.js              ← Hover/tap tooltip; fixed prop uses portal for overflow containers
    │   ├── Skeleton.js             ← Skeleton loading components
    │   ├── DateTimePicker.js
    │   ├── MonthCalendarPicker.js
    │   ├── Reveal.js               ← IntersectionObserver scroll reveal
    │   ├── Footer.js
    │   └── charts/
    │       ├── DonutChart.js
    │       ├── HBarChart.js
    │       └── VBarChart.js
    ├── lib/
    │   ├── api.js                  ← Typed fetch wrappers for all backend endpoints
    │   └── format.js               ← formatCurrency(amount, currency, numberFormat), date helpers
    └── e2e/
        ├── public-pages.spec.js    ← 30 Playwright tests (desktop + mobile)
        └── auth-flow.spec.js       ← Authenticated flow tests (requires TEST_EMAIL/TEST_PASSWORD)
```

---

## Prerequisites

| Tool | Min version | Required for |
|------|-------------|-------------|
| Node.js | 22 | Local dev |
| npm | 10 | Local dev |
| Python | 3.12 | Local dev (AI service) |
| pip | 24 | Local dev (AI service) |
| MongoDB | 7 | Local dev (backend) |
| Docker | 24 | Container deployment |
| Docker Compose | v2 | Container deployment |
| make | any | Makefile shortcuts (optional) |

---

## Environment variables

### Root `.env` (used by `docker compose`)

Copy `.env.example` → `.env` and fill in values before running compose:

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_TOKEN` | — **required** | JWT signing secret (use `openssl rand -hex 32`) |
| `DB_URI` | `mongodb://mongo:27017/finan` | MongoDB connection string |
| `NEXT_PUBLIC_API_URL` | — **required** | Backend URL as seen by the browser (e.g. `https://your-domain.com`) |
| `FE_URL` | `http://localhost:3000` | Allowed CORS origin (must match frontend URL) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | — | Google OAuth redirect URI |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | — | Same as `GOOGLE_CLIENT_ID` (exposed to browser) |
| `RESEND_API_KEY` | — **required** | Resend API key — get one at resend.com |
| `FROM_EMAIL` | `noreply@lori.my.id` | Sender address (must be on a verified Resend domain) |
| `SENTRY_DSN` | — | Sentry DSN for the backend (Node.js project). Runtime env var — add to `.env` and recreate the container. |
| `NEXT_PUBLIC_SENTRY_DSN` | — | Sentry DSN for the frontend (Next.js project). **Build-time** — must be set as a GitHub Actions variable so it is baked into the image during CI/CD. |
| `AI_SERVICE_URL` | `http://ai:3002` | Internal URL of the AI service as seen by the backend. In Docker Compose the service name `ai` resolves automatically. For bare-metal, set to `http://127.0.0.1:3002`. |

> **Resend:** sign up at resend.com → add your domain → verify the DNS records → create an API key. Free tier is 3,000 emails/month.

### Backend local dev (`finance-management/.env`)

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_URI=mongodb://localhost:27017/finan
SECRET_TOKEN=your_jwt_secret_here
RESEND_API_KEY=re_your_api_key_here
FROM_EMAIL=noreply@yourdomain.com
```

### Frontend local dev (`finance-management-fe/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-client-id>
NEXT_PUBLIC_SENTRY_DSN=<your-frontend-sentry-dsn>   # optional for local dev
```

> When running via Docker Compose, the backend maps to host port `3001` and the frontend to `3000`.

---

## Local development (without Docker)

### 1. Start MongoDB

```bash
# Homebrew (macOS)
brew services start mongodb-community

# or directly
mongod --dbpath /data/db
```

### 2. Backend

```bash
cd finance-management
cp docker.env.template .env   # fill in values
npm install
npm run dev                   # http://localhost:3000
```

Swagger UI (non-production only): http://localhost:3000/api-docs

Seed default categories once after first start:

```bash
# get a JWT by logging in, then:
curl -X POST http://localhost:3000/api/transaction/category \
  -H "Authorization: Bearer <token>"
```

### 3. AI service

```bash
cd finance-management-ai
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 3002 --reload
# or: make dev-ai
```

Health check: `curl http://localhost:3002/health` → `{"status":"ok"}`

The backend reads `AI_SERVICE_URL` (defaults to `http://127.0.0.1:3002`). If the AI service is unreachable, `GET /api/transaction/ml-insights` returns an empty graceful response — the Insights page falls back to rule-based anomaly detection automatically.

### 4. Frontend

```bash
cd finance-management-fe
# create .env.local — see above
npm install
npm run dev                   # http://localhost:3001
```

---

## Docker Compose (full stack)

```bash
# from finan-app/ root
cp .env.example .env
# edit .env — set SECRET_TOKEN and other required vars

make up           # build + start all services detached
make logs         # tail all container logs
make down         # stop everything
```

| Container | Internal port | Host port | Notes |
|-----------|--------------|-----------|-------|
| `finan-mongo` | 27017 | — (internal only) | |
| `finan-ai` | 3002 | — (internal only) | Backend calls it via Docker DNS as `http://ai:3002` |
| `finan-be` | 3000 | **3001** | |
| `finan-fe` | 3000 | **3000** | |

Start order is enforced by healthchecks: `mongo` → `ai` → `backend` → `frontend`.

---

## Testing

### Backend (Mocha + Chai)

Tests run against an in-memory MongoDB instance (no real DB required).

```bash
cd finance-management

npm test               # all suites
npm run test:auth      # auth tests only
npm run test:transaction
npm run test:goal
npm run test:e2e
npm run test:app
```

| File | What it covers |
|------|---------------|
| `app.integration.test.js` | CORS, security headers, 404 handling, Swagger |
| `auth.integration.test.js` | Register, login, JWT, tokenVersion, duplicate prevention |
| `transaction.integration.test.js` | CRUD, balance updates, categories, CSV import, analytics |
| `goal.integration.test.js` | Goal creation, savings calculations, multi-goal |
| `end-to-end.test.js` | Full user journey, multi-user data isolation, error recovery |

### Frontend (Playwright E2E)

```bash
cd finance-management-fe

npm run test:e2e          # run all E2E tests (requires running app on localhost:3000)
npm run test:e2e:ui       # open Playwright UI mode

# Authenticated tests — provide real account credentials:
TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass npm run test:e2e
```

| File | What it covers |
|------|---------------|
| `e2e/public-pages.spec.js` | Landing page, auth pages, legal pages, auth guard redirects — 30 tests on desktop + mobile |
| `e2e/auth-flow.spec.js` | Login, dashboard, add transaction, analytics, logout-all (skipped without credentials) |

Override the base URL with `PLAYWRIGHT_BASE_URL=https://your-domain.com npm run test:e2e`.

---

## API reference

Swagger UI is available at `/api-docs` when `NODE_ENV !== production`.

### Auth

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/auth/register` | 10/min per IP | — | Create account, returns user + initial balance |
| POST | `/api/auth/login` | 10/min per IP | — | Returns JWT |
| GET | `/api/auth/check` | — | — | Verify token validity |
| POST | `/api/auth/google/verify` | 20/min per IP | — | Verify Google id_token, return JWT |
| PATCH | `/api/auth/password` | 5/min per user | ✓ | Change password (invalidates all sessions) |
| POST | `/api/auth/logout-all` | 5/min per user | ✓ | Bump tokenVersion, invalidating all JWTs |
| DELETE | `/api/auth/account` | — | ✓ | Delete account and all associated data |
| POST | `/api/auth/forgot-password` | 5/min per IP | — | Send password reset email (always returns 200) |
| POST | `/api/auth/reset-password` | 10/min per IP | — | Validate token + set new password |

### Transactions

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/transaction` | 30/min | ✓ | Add transaction |
| GET | `/api/transaction` | — | ✓ | All transactions (`?month=YYYY-MM&category=X&search=X&page=N&limit=N`) |
| PATCH | `/api/transaction/:id` | 30/min | ✓ | Update description and/or category of a transaction |
| DELETE | `/api/transaction/:id` | — | ✓ | Delete transaction, balance updated |
| GET | `/api/transaction/analytics` | 60/min | ✓ | Monthly/yearly analytics (`?year=YYYY&month=M`) |
| GET | `/api/transaction/anomalies` | 60/min | ✓ | Transactions flagged as anomalies |
| GET | `/api/transaction/explain` | 60/min | ✓ | Spending explainability breakdown |
| GET | `/api/transaction/time-to-zero` | 60/min | ✓ | Runway until balance reaches zero |
| GET | `/api/transaction/expense` | 60/min | ✓ | Total expense summary |
| GET | `/api/transaction/active-months` | 60/min | ✓ | Months with at least one transaction |
| GET | `/api/transaction/range/:start/:end` | — | ✓ | Transactions in date range with summary |
| GET | `/api/transaction/date/:date` | — | ✓ | Transactions on a specific date |
| GET | `/api/transaction/recommendation/:monthly/:spend` | — | ✓ | Budget affordability check |
| GET | `/api/transaction/ml-insights` | 20/min | ✓ | ML-powered anomaly detection + month-end forecast (proxies to AI service; degrades gracefully if unavailable) |
| POST | `/api/transaction/import/csv` | 10/min | ✓ | Bulk CSV import (`multipart/form-data`, field: `files`, up to 10 files, max 5 MB each) |
| GET | `/api/transaction/category` | — | ✓ | List categories (`?search=X&type=income|expense`) |
| GET | `/api/transaction/category/suggestions` | — | ✓ | Smart category suggestions by time of day |
| POST | `/api/transaction/category` | — | ✓ | Seed default categories |

### Goals

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/goal/add` | 20/min | ✓ | Create a savings goal |
| GET | `/api/goal/goals` | 60/min | ✓ | List all goals |
| GET | `/api/goal/goal/:id` | 60/min | ✓ | Goal detail with savings projection |

### Profile

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/api/profile` | 60/min | ✓ | Get profile, preferences, and snapshot summary |
| PATCH | `/api/profile/preferences` | 30/min | ✓ | Update timezone, currency, numberFormat, monthlyBudget |
| GET | `/api/profile/export` | 10/min | ✓ | Export all transactions as CSV |
| GET | `/api/profile/budget/:yearMonth` | 30/min | ✓ | Get budget for a specific month (falls back to global default) |
| POST | `/api/profile/budget/:yearMonth` | 30/min | ✓ | Set budget for a month (`{ amount, updateDefault? }`) |

---

## Architecture notes

### Authentication & sessions

JWT is signed with `SECRET_TOKEN`. Each token contains a `tv` (tokenVersion) field. On password change or logout-all, `tokenVersion` is incremented in the database, immediately invalidating all existing tokens. The `authJWT` middleware checks `tv` on every request.

### Password reset

1. `POST /forgot-password` creates a `PasswordReset` document with a `crypto.randomBytes(32)` token and 1-hour expiry. The MongoDB TTL index auto-deletes expired tokens. Always returns 200 to prevent email enumeration.
2. `POST /reset-password` validates the token, hashes the new password with bcrypt, bumps `tokenVersion`, and marks the token used.

### Input sanitization

All transaction `description` and `category` fields pass through `sanitizeText()` in the DTO — strips HTML tags and null bytes before reaching the database.

### Rate limiting

`rateLimit.js` implements an in-process sliding-window limiter (no external dependencies). Two strategies:
- `limiter.byIp(N)` — for unauthenticated endpoints (login, register, forgot-password)
- `limiter.byUser(N)` — for authenticated endpoints, keyed by user ID

Rate limiting is a no-op in `NODE_ENV=test` so integration tests run unrestricted.

### Dark mode

Theme preference is stored in `localStorage`. The root layout injects a blocking inline script in `<head>` to apply `.dark` before first paint (prevents flash). The landing page uses `ForceLightMode` — a component that strips `.dark` on mount and restores it on unmount, so the landing page always renders light regardless of stored preference.

Dark mode is implemented via CSS class overrides in `globals.css` (`.dark .bg-white { ... }`) rather than Tailwind's `dark:` variant utilities. This is intentional — Tailwind v4 without explicit config uses the OS media query strategy, so `dark:` utilities would apply based on the OS setting rather than the app's `.dark` class toggle.

### Tooltip (fixed mode)

`Tooltip.js` supports a `fixed` prop that renders the bubble via `createPortal` at `position: fixed`, escaping any `overflow: hidden` or `overflow: auto` container (e.g. scrollable tables, card containers). The bubble position is computed with `getBoundingClientRect()` and clamped to keep it within the viewport on mobile.

### Monthly snapshots

`snapshot.model.js` stores monthly income/expense totals per user. `refreshSnapshot()` is called after every transaction create or delete. The `active-months` endpoint reads from snapshots for fast month-list queries without scanning the full transactions collection.

### CSV import

Accepts up to 10 files in a single request (`multipart/form-data`, field name `files`). Files are processed sequentially (not in parallel) to avoid balance race conditions when multiple files affect the same user's balance. Each file produces its own result block; the response aggregates `totalSuccess` and `totalFailed` across all files.

Type values are normalized: anything that is not exactly `"income"` is treated as `"expense"`. If a category in the CSV does not exist, the importer creates it. Rows that fail validation are skipped and reported in the per-file `errors` array.

### Currency & number formatting

`CurrencyContext` (frontend) stores `currency` and `numberFormat` in `localStorage` for instant paint (no flash), then refreshes from `GET /api/profile` on mount. `formatCurrency(amount, currency, numberFormat)` in `lib/format.js` uses `Intl.NumberFormat` — `numberFormat: 'dot'` uses the currency's natural locale (e.g. `id-ID` → `5.000.000`), `'comma'` forces `en-US` grouping (`5,000,000`). All components consume `useFormatAmount()` or `useCurrency()` — no hardcoded `Rp` or `IDR` strings.

### Per-month budget

`Budget` model stores `{ user, yearMonth, amount }` with a unique index on `(user, yearMonth)`. When reading the budget for a month, the backend first looks for a `Budget` document; if none exists, it falls back to `Preference.monthlyBudget` (the global default). Writing a budget only updates `Preference.monthlyBudget` when the caller explicitly passes `updateDefault: true` — this prevents one-off month overrides (e.g. a holiday month) from silently becoming the new global default.

### Transaction inline editing

`PATCH /api/transaction/:id` accepts `{ description?, category? }`. At least one field is required. Category existence is validated case-insensitively against the user's own categories. Ownership is enforced via `findOneAndUpdate({ _id, user })`. The frontend updates local state optimistically on success.

### AI microservice

The AI service (`finance-management-ai/`) is a Python FastAPI app that exposes a single internal endpoint:

**`POST /analyze`** — called by `GET /api/transaction/ml-insights` on the backend.

Input: 6 months of expense transactions (for model training) + current-month daily totals + optional budget.

Output:
- **`anomalies`** — list of unusual transactions ranked by anomaly score, each with `severity` (high/medium/low), `multiple` (Nx above average), and a plain-English `label`
- **`forecast`** — month-end spending prediction with `trend`, `confidence` (based on R²), daily average, and over/under-budget indicator if a budget is set

**Anomaly detection algorithm:**
- Groups transactions by category
- For categories with ≥ 10 samples: trains **Isolation Forest** (`contamination=0.1`, 100 estimators) on the amount distribution; scores current-month transactions; flags those predicted as anomalies (`prediction == -1`)
- For categories with 3–9 samples: falls back to **z-score** (flags if `|z| ≥ 2.0`)
- Categories with < 3 samples are skipped (insufficient context)
- Returns top 10 results sorted by anomaly score

**Forecast algorithm:**
- Builds a cumulative daily spend curve from `daily_totals` (days with no spend default to 0)
- Fits **Linear Regression** (`day_number → cumulative_spend`)
- Predicts at `day = days_in_month`; clamps result ≥ amount already spent
- R² determines confidence: ≥ 0.85 = high, ≥ 0.55 = medium, < 0.55 = low
- Slope vs. expected pace determines trend: accelerating / steady / decelerating
- Requires ≥ 4 days of data; returns `available: false` otherwise

**Graceful degradation:** If the AI service is unreachable or times out (8 s timeout), `GET /api/transaction/ml-insights` returns `{ anomalies: [], forecast: { available: false } }` with HTTP 200. The frontend Insights page falls back to the existing rule-based anomaly detection silently.

### CI/CD pipeline

Two workflows in `.github/workflows/`:

- **`ci.yml`** — runs on pull requests to `main`. Uses `dorny/paths-filter` to detect which monorepo subtree changed. Backend job (`npm test`) only runs when `finance-management/**` changed; frontend build check only runs when `finance-management-fe/**` changed.
- **`cd.yml`** — runs on push to `main`. Same path filtering — only rebuilds the image(s) that changed. Backend, frontend, and AI service build jobs run in parallel. Images are tagged `:latest` and pushed to GHCR. Watchtower on the server polls GHCR every 30s and redeploys automatically.

> The AI service image is `ghcr.io/chud-lori/finan-app-ai:latest`. Add a path filter for `finance-management-ai/**` in both workflows to trigger AI image builds only when the AI service code changes.

> Changing `docker-compose.yml` or other root-level files does **not** trigger an image rebuild — those changes require a manual `git pull` on the server followed by `docker compose up -d`.

### Error monitoring (Sentry)

Two separate Sentry projects — one per service:

| Service | SDK | DSN env var | When it's applied |
|---------|-----|-------------|-------------------|
| Backend (Express) | `@sentry/node` | `SENTRY_DSN` | Runtime — add to `.env`, recreate container |
| Frontend (Next.js) | `@sentry/nextjs` | `NEXT_PUBLIC_SENTRY_DSN` | Build time — set as GitHub Actions variable, triggers on next image build |

**Backend** — `Sentry.init()` runs at the top of `app.js` (before all other imports), guarded by `NODE_ENV === 'production' && SENTRY_DSN`. `Sentry.setupExpressErrorHandler(app)` is registered after all routes to capture unhandled Express errors. `uncaughtException` also calls `Sentry.captureException()` before exiting.

**Frontend** — `sentry.client.config.js` initialises the browser SDK with Session Replay (5% of sessions, 100% on error). `instrumentation.js` initialises the server-side SDK via the Next.js instrumentation hook.

**Important:** `NEXT_PUBLIC_SENTRY_DSN` is a `NEXT_PUBLIC_*` variable — it is inlined into the browser bundle at build time. To activate Sentry on the frontend: add `NEXT_PUBLIC_SENTRY_DSN` to GitHub → Settings → Variables, then push a frontend change to trigger a new image build.

### SEO (frontend)

- `robots.js` → `/robots.txt`: allows crawling of public pages, blocks auth-required routes
- `sitemap.js` → `/sitemap.xml`: lists all public pages with priority and changeFrequency
- Landing page metadata: canonical URL, Open Graph tags, Twitter card, JSON-LD `WebApplication` structured data
- `metadataBase` in `layout.js` resolves all relative og:image/canonical paths to `https://finance.lori.my.id`

---

## Deploying separately

Both services have their own `Dockerfile` and deploy independently.

### Backend

```bash
cd finance-management
docker build -t finan-be .
docker run -d \
  -p 3001:3000 \
  -e NODE_ENV=production \
  -e DB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/finan \
  -e SECRET_TOKEN=<secret> \
  -e FE_URL=https://your-frontend.com \
  -e RESEND_API_KEY=re_your_api_key_here \
  -e FROM_EMAIL=noreply@yourdomain.com \
  -e SENTRY_DSN=<your-backend-sentry-dsn> \
  finan-be
```

### AI service

```bash
cd finance-management-ai
docker build -t finan-ai .
docker run -d \
  --name finan-ai \
  --network finan-net \
  finan-ai
```

The container is not exposed externally. The backend container must be on the same Docker network (`finan-net`) and set `AI_SERVICE_URL=http://finan-ai:3002`.

**Bare-metal (PM2):**

```bash
cd finance-management-ai
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pm2 start "uvicorn main:app --host 127.0.0.1 --port 3002" --name finan-ai --interpreter none
# Add AI_SERVICE_URL=http://127.0.0.1:3002 to the backend .env
```

### Frontend

`NEXT_PUBLIC_*` vars are baked into the bundle at build time:

```bash
cd finance-management-fe
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://your-domain.com \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id> \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=<your-frontend-sentry-dsn> \
  -t finan-fe .
docker run -d -p 3000:3000 finan-fe
```

---

## Makefile reference

```
make help          show all targets

make dev-be        start backend locally (nodemon)
make dev-fe        start frontend locally (next dev)
make dev-ai        start AI service locally (uvicorn --reload, port 3002)

make build         docker compose build
make up            docker compose up -d (builds if needed)
make down          docker compose down
make restart       down + up
make restart-be    restart only the backend container
make restart-fe    restart only the frontend container
make restart-ai    restart only the AI service container

make logs          tail all container logs
make logs-be       tail backend logs
make logs-fe       tail frontend logs
make logs-ai       tail AI service logs

make test          run backend test suite
make seed          seed categories (requires TOKEN=<jwt>)
make clean         stop containers, remove volumes (destructive)
```

---

## Contributing

1. Fork the repo and create a branch from `main`.
2. Run `npm test` inside `finance-management/` — all tests must pass.
3. Run `npm run test:e2e` inside `finance-management-fe/` against a running instance.
4. Keep commits focused. One logical change per commit.
5. Update this file if you add new routes, environment variables, or change the repo structure.
