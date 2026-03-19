# Developer Guide

Technical reference for setting up, developing, testing, and deploying Finan App.

---

## Repository layout

```
finan-app/                          ← monorepo root
├── docker-compose.yml              ← full-stack deployment
├── .env.example                    ← root environment template
├── Makefile                        ← dev and ops shortcuts
├── README.md                       ← product overview
├── DEVELOPER.md                    ← this file
│
├── finance-management/             ← Backend (Express.js + MongoDB)
│   ├── app.js                      ← Express entry point (CORS, helmet, routes)
│   ├── Dockerfile
│   ├── controllers/
│   │   ├── auth.js                 ← register, login, google OAuth, change password,
│   │   │                             logout-all, delete account, forgot/reset password
│   │   ├── transaction.js          ← CRUD, analytics, anomalies, insights, import
│   │   ├── goal.js                 ← savings goals
│   │   └── profile.js              ← get profile, update preferences, export CSV
│   ├── routers/
│   │   ├── auth.js                 ← all auth routes with rate limits
│   │   ├── transaction.js          ← transaction routes with rate limits
│   │   ├── goal.js                 ← goal routes with rate limits
│   │   └── profile.js              ← profile routes with rate limits
│   ├── models/
│   │   ├── user.model.js
│   │   ├── balance.model.js
│   │   ├── transaction.model.js    ← type enum: income | expense
│   │   ├── category.model.js       ← scoped per user
│   │   ├── goal.model.js
│   │   ├── snapshot.model.js       ← monthly income/expense snapshots
│   │   ├── preference.model.js     ← user preferences (timezone, currency)
│   │   └── passwordReset.model.js  ← reset tokens with TTL index (auto-expires)
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
│   │   ├── mailer.js               ← nodemailer Gmail SMTP (password reset emails)
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
    │   ├── insights/page.js        ← Anomaly detection, explainability, runway
    │   ├── import/page.js          ← CSV bulk import with progress display
    │   ├── recommendation/page.js  ← 10 financial planning calculators
    │   ├── reports/page.js
    │   ├── profile/page.js         ← Financial identity, preferences, export, danger zone
    │   ├── settings/page.js        ← Theme toggle, change password, logout all, delete account
    │   ├── privacy/page.js         ← Privacy Policy
    │   ├── terms/page.js           ← Terms of Service
    │   └── auth/callback/page.js   ← Google OAuth callback handler
    ├── components/
    │   ├── Navbar.js
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
    │   ├── api.js                  ← Typed fetch wrappers for all endpoints
    │   └── format.js               ← IDR formatter, date formatter
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
| `USER_EMAIL` | — | Gmail address used to send password reset emails |
| `USER_PASS` | — | Gmail **App Password** (16-char, NOT your real password) |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 = STARTTLS) |

> **Gmail App Password:** go to myaccount.google.com → Security → 2-Step Verification → App Passwords. Generate one for "Mail". The 16-char value (with or without spaces) goes in `USER_PASS`.

### Backend local dev (`finance-management/.env`)

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_URI=mongodb://localhost:27017/finan
SECRET_TOKEN=your_jwt_secret_here
USER_EMAIL=your-gmail@gmail.com
USER_PASS=xxxx xxxx xxxx xxxx
```

### Frontend local dev (`finance-management-fe/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-client-id>
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

### 3. Frontend

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

| Container | Internal port | Host port |
|-----------|--------------|-----------|
| `finan-mongo` | 27017 | — (internal only) |
| `finan-be` | 3000 | **3001** |
| `finan-fe` | 3000 | **3000** |

Start order is enforced by healthchecks: `mongo` → `backend` → `frontend`.

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
| POST | `/api/transaction/import/csv` | 10/min | ✓ | Bulk CSV import (`multipart/form-data`, field: `file`, max 5 MB) |
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
| PATCH | `/api/profile/preferences` | 30/min | ✓ | Update timezone, currency, display preferences |
| GET | `/api/profile/export` | 10/min | ✓ | Export all transactions as CSV |

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

Type values are normalized: anything that is not exactly `"income"` is treated as `"expense"`. If a category in the CSV does not exist, the importer creates it. Rows that fail validation are skipped and reported in the response `errors` array.

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
  -e USER_EMAIL=you@gmail.com \
  -e USER_PASS="xxxx xxxx xxxx xxxx" \
  finan-be
```

### Frontend

`NEXT_PUBLIC_*` vars are baked into the bundle at build time:

```bash
cd finance-management-fe
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://your-domain.com \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id> \
  -t finan-fe .
docker run -d -p 3000:3000 finan-fe
```

---

## Makefile reference

```
make help          show all targets

make dev-be        start backend locally (nodemon)
make dev-fe        start frontend locally (next dev)

make build         docker compose build
make up            docker compose up -d (builds if needed)
make down          docker compose down
make restart       down + up
make restart-be    restart only the backend container
make restart-fe    restart only the frontend container

make logs          tail all container logs
make logs-be       tail backend logs
make logs-fe       tail frontend logs

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
