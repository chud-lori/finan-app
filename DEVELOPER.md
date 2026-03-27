# Developer Guide

Technical reference for the Finan App monorepo: architecture, data schemas, API contract, local setup, testing, and deployment.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Repository layout](#repository-layout)
3. [System architecture](#system-architecture)
   - [Service topology](#service-topology)
   - [Request lifecycle](#request-lifecycle)
   - [Authentication flow](#authentication-flow)
   - [Category taxonomy & AI classification](#category-taxonomy--ai-classification)
   - [ML insights pipeline](#ml-insights-pipeline)
   - [Snapshot system](#snapshot-system)
4. [Data schemas](#data-schemas)
5. [AI service models](#ai-service-models)
6. [Environment variables](#environment-variables)
7. [Local development](#local-development-without-docker)
8. [Docker Compose](#docker-compose-full-stack)
9. [Testing](#testing)
10. [API reference](#api-reference)
11. [Architecture decision notes](#architecture-decision-notes)
12. [CI/CD pipeline](#cicd-pipeline)
13. [Error monitoring](#error-monitoring)
14. [Contributing](#contributing)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22, Express.js |
| Database | MongoDB 7 (Mongoose ODM, single-node replica set `rs0`) |
| Auth | JWT (jsonwebtoken) in HttpOnly cookies + Google OAuth 2.0 (Passport.js) + stateful session store (MongoDB) |
| Password hashing | bcrypt (salt 10) |
| Email | Resend SDK |
| Error monitoring | Sentry (`@sentry/node` + `@sentry/nextjs`) |
| File upload | Multer (`upload.array` for multi-file CSV) |
| Rate limiting | Custom in-process sliding-window (no Redis dependency) |
| Logging | Winston + Morgan (JSON access log + daily-rotate file) |
| Testing | Mocha + Chai + mongodb-memory-server |
| Frontend | Next.js 14 (App Router), React, Tailwind CSS v4 |
| Charts | Recharts |
| Frontend testing | Playwright E2E |
| AI service | Python 3.12, FastAPI, scikit-learn (Isolation Forest + Linear Regression + TF-IDF) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions → GHCR → Watchtower (auto-deploy) |

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
├── finance-management-ai/          ← AI microservice (Python FastAPI)
│   ├── main.py                     ← FastAPI app: /health + /classify + /analyze
│   ├── Dockerfile
│   ├── requirements.txt
│   └── models/
│       ├── anomaly.py              ← Isolation Forest anomaly detection (z-score fallback)
│       ├── forecast.py             ← Linear Regression month-end spending forecast
│       └── classifier.py          ← TF-IDF keyword classifier for category taxonomy
│
├── finance-management/             ← Backend (Express.js + MongoDB)
│   ├── app.js                      ← Express entry point (CORS, Helmet, Sentry, routes)
│   ├── Dockerfile
│   ├── controllers/
│   │   ├── auth.js                 ← register, login, Google OAuth, sessions, password reset; seeds default categories on new signup
│   │   ├── transaction.js          ← CRUD, analytics, insights, import/export, ML proxy; lazy category seed on first getCategory call
│   │   ├── category.js             ← group summary (includes _id), classify-all, group override, list, rename, delete (all mutations by _id)
│   │   ├── goal.js                 ← savings goals
│   │   ├── profile.js              ← profile, preferences, CSV export, balance reconcile
│   │   ├── gamification.js         ← streaks, budget wins, goal rings
│   │   └── recommendation.js       ← rule-based personalised nudges
│   ├── routers/
│   │   ├── auth.js
│   │   ├── transaction.js
│   │   ├── category.js
│   │   ├── goal.js
│   │   ├── profile.js
│   │   ├── gamification.js
│   │   └── recommendation.js
│   ├── models/                     ← Mongoose schemas (see Data schemas section)
│   │   ├── user.model.js
│   │   ├── session.model.js
│   │   ├── transaction.model.js
│   │   ├── balance.model.js
│   │   ├── category.model.js
│   │   ├── snapshot.model.js
│   │   ├── goal.model.js
│   │   ├── budget.model.js
│   │   ├── preference.model.js
│   │   ├── mlinsight.model.js
│   │   ├── passwordReset.model.js
│   │   └── emailVerification.model.js
│   ├── middleware/
│   │   ├── authJWT.js              ← JWT cookie verification + Session doc lookup
│   │   ├── rateLimit.js            ← sliding-window limiter (byIp / byUser)
│   │   └── log.js                  ← Morgan request logger
│   ├── dtos/
│   │   ├── base.dto.js
│   │   ├── transaction.dto.js      ← request validation + sanitizeText()
│   │   ├── auth.dto.js
│   │   └── goal.dto.js
│   ├── helpers/
│   │   ├── categoryClassifier.js   ← AI classify proxy + user-override learning hints
│   │   ├── seedDefaultCategories.js ← idempotent per-user upsert of default categories from categories.json
│   │   ├── validator.js            ← express-validator rule sets
│   │   ├── mailer.js               ← Resend SDK (password reset + email verification)
│   │   ├── snapshot.js             ← refreshSnapshot() + applySnapshotDelta()
│   │   ├── cache.js                ← in-process request cache
│   │   └── logger.js               ← Winston logger
│   ├── config/
│   │   ├── db.js                   ← Mongoose connection (maxPoolSize 10)
│   │   ├── keys.js                 ← env var exports + REQUIRED_IN_PRODUCTION guard
│   │   ├── passport.js             ← Google OAuth strategy
│   │   └── swagger.js              ← Swagger/OpenAPI config
│   └── test/
│       ├── README.md
│       ├── setup.js
│       ├── app.integration.test.js
│       ├── auth.integration.test.js
│       ├── transaction.integration.test.js
│       ├── goal.integration.test.js
│       └── end-to-end.test.js
│
└── finance-management-fe/          ← Frontend (Next.js 14 + Tailwind CSS v4)
    ├── Dockerfile
    ├── playwright.config.js
    ├── app/
    │   ├── layout.js               ← root layout, ErrorBoundary, theme script
    │   ├── page.js                 ← Landing page (always light mode)
    │   ├── dashboard/page.js       ← Balance, transactions, month picker
    │   ├── analytics/page.js       ← Monthly/yearly charts, category breakdown; year nav bounded by availableYears; clicking a bar in yearly view opens month transaction modal
    │   ├── insights/page.js        ← ML insights, anomaly, explainability, group summary, ManageCategories (rename/delete)
    │   ├── recommendation/page.js  ← 10 financial planning calculators
    │   ├── profile/page.js         ← Financial identity, preferences, import/export
    │   └── settings/page.js        ← Theme, password change, sessions, delete account
    ├── components/
    │   ├── GamificationBanner.js   ← streaks, budget wins, goal rings
    │   ├── Tooltip.js              ← fixed prop for portal rendering on mobile
    │   └── ...
    ├── lib/
    │   ├── api.js                  ← typed fetch wrappers for all backend endpoints
    │   └── format.js               ← formatCurrency(), date helpers
    └── e2e/
        ├── public-pages.spec.js
        └── auth-flow.spec.js
```

---

## System architecture

### Service topology

```
┌────────────────────────────────────────────────────────────────┐
│  Client (Browser / PWA)                                        │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼───────────────────────────────────────┐
│  nginx  (reverse proxy — TLS termination, HSTS, HTTP/2)        │
└──────────┬──────────────────────────────┬──────────────────────┘
           │ :3000                        │ :3001
┌──────────▼──────────────┐   ┌──────────▼──────────────────────┐
│  Frontend               │   │  Backend (Express / Node.js)     │
│  Next.js 14 App Router  │   │  container port 3000             │
│  SSR + static assets    │   │  host port 3001                  │
│  Tailwind CSS v4        │   │  JWT · rate limiting · REST API  │
└─────────────────────────┘   └─────────────┬───────────┬────────┘
                                            │           │
                               ┌────────────▼──┐  ┌─────▼──────────────┐
                               │  MongoDB 7     │  │  AI Service         │
                               │  rs0 replica   │  │  FastAPI / Python   │
                               │  set (single)  │  │  port 3002          │
                               │  internal only │  │  internal only      │
                               └────────────────┘  └────────────────────┘
```

**Network isolation:** MongoDB and the AI service are not exposed to the host. Only the backend (port 3001) and frontend (port 3000) are published. The backend reaches MongoDB via the Docker network hostname `mongo` and the AI service via `ai`.

**Startup order** (enforced by Docker Compose healthchecks):

```
mongo (healthy) → mongo-init (completes) → ai (starts) → backend (healthy) → frontend
```

---

### Request lifecycle

A typical authenticated API request:

```
Browser
  │
  ├─ HTTPS request with HttpOnly cookie (token=<JWT>)
  │
nginx
  │
  ├─ Proxies to backend :3001
  │
Express
  ├─ CORS check (origin must match FE_URL)
  ├─ Helmet headers applied
  ├─ Body size limit enforced (100 kb JSON / URL-encoded)
  ├─ authJWT middleware
  │    ├─ Extracts JWT from req.cookies.token
  │    ├─ Verifies JWT signature (SECRET_TOKEN)
  │    ├─ SHA-256 hashes the token
  │    ├─ Looks up Session document by tokenHash
  │    ├─ Returns 403 if session not found (revoked or expired)
  │    └─ Attaches req.user, req.token, req.sessionId; fires lastSeen update
  ├─ Rate limiter (sliding-window, byUser)
  ├─ Controller handler
  │    ├─ Reads/writes MongoDB via Mongoose
  │    └─ (optional) calls AI service via internal HTTP
  └─ Response JSON
```

---

### Authentication flow

**Session creation (login / Google OAuth):**

1. Credentials validated → bcrypt compare or Google id_token verified server-side
2. `jwt.sign({ id, username }, SECRET_TOKEN, { expiresIn: '7d' })` → raw JWT
3. SHA-256 hash of JWT stored as `tokenHash` in a new `Session` document (raw token never persisted)
4. `User-Agent` parsed → `device.name`, `browser`, `os` stored on the Session
5. `expiresAt = now + 7 days` (MongoDB TTL index auto-deletes expired sessions)
6. JWT set as `HttpOnly; SameSite=none (prod) / lax (dev); Secure (prod)` cookie

**Every authenticated request:**

```
req.cookies.token
    → jwt.verify()          fails → 403 Forbidden
    → SHA-256 hash
    → Session.findOne({ tokenHash })
        not found → 403 (revoked or expired)
        found     → attach req.user; fire lastSeen update (non-blocking)
```

**Revocation paths:**

| Action | Effect |
|--------|--------|
| `POST /logout` | Deletes current Session doc + clears cookie |
| `DELETE /sessions/:id` | Deletes one Session by ID (can't revoke current) |
| `POST /logout-all` | `Session.deleteMany({ user })` + bumps `tokenVersion` + clears cookie |
| Password change | `Session.deleteMany({ user })` + clears cookie |
| Password reset | `Session.deleteMany({ user })` + clears cookie |
| TTL expiry | MongoDB auto-deletes Session docs past `expiresAt` |

---

### Category taxonomy & AI classification

Categories are stored per-user and classified into one of six semantic spending groups:

| Group | Meaning | Examples |
|-------|---------|---------|
| `essential` | Survival / fixed costs | groceries, rent, utilities, transport, health, insurance |
| `discretionary` | Lifestyle / wants | dining out, coffee, shopping, travel, gym, subscriptions |
| `savings` | Wealth-building / investments | tabungan, saham, reksa dana, crypto, dana darurat |
| `social` | Outflows to others | gifts, donations, zakat, family transfer, wedding |
| `income` | Money coming in | salary, freelance, dividend, bonus, cashback |
| `other` | Unclassified fallback | anything not matched |

**Classification pipeline:**

```
New transaction added
        │
        ▼
Category document upserted (group = 'other' by default)
        │
        ▼ (fire-and-forget)
categoryClassifier.js
        │
        ├─ 1. Load user's groupOverridden=true categories from MongoDB
        │      (learning hints from past manual overrides)
        │
        ├─ 2. Exact match against override names  → confidence 1.0
        ├─ 3. Substring match against override names → confidence 0.85
        ├─ 4. Shared-token match (word overlap >2 chars) → confidence 0.75
        │
        └─ 5. If still unmatched → POST /classify to AI service
                    │
                    ├─ classifier.py
                    │    ├─ Exact keyword match     → confidence 1.0
                    │    ├─ Substring keyword match → confidence 0.9
                    │    └─ TF-IDF char-ngram cosine similarity → confidence if > 0.25
                    │    └─ Fallback: 'other', confidence 0.0
                    └─ Returns group + confidence
        │
        ▼
Category.updateOne({ group, groupConfidence })
   (skipped if result is still 'other')
```

**User override learning:** When a user manually moves a category to a different group (`PATCH /api/category/:id/group`), `groupOverridden: true` is set. On the next classification run for that user, the overridden categories are loaded and used as learning hints — so future categories with similar names are matched to the user-defined group before the AI service is consulted.

**Default categories:** 28 expense + 9 income categories are seeded per-user from `categories.json` via `seedDefaultCategories()`. This runs fire-and-forget on new user registration (email/password and Google OAuth). For existing users with zero categories, `GET /api/transaction/category` triggers a passive seed before returning results — no manual migration needed.

**`classifyAll` (`POST /api/category/classify-all`):** Processes all categories where `group === 'other'` AND `groupOverridden !== true`. Safe to call repeatedly. Called automatically on the Insights page load.

---

### ML insights pipeline

```
GET /api/transaction/ml-insights
        │
        ├─ Check MLInsight cache: does a doc exist for this user+yearMonth
        │   with txCountSnapshot matching current expense count?
        │       Yes → return cached result
        │       No  → continue
        │
        ├─ Fetch 6 months of expense transactions + daily totals + budget
        │
        ├─ POST /analyze to AI service (8s timeout)
        │    ├─ detect_anomalies()   → Isolation Forest / z-score per category
        │    └─ forecast_month_spend() → Linear Regression on cumulative daily spend
        │
        ├─ Store result in MLInsight collection
        │   (auto-expires after 24h via TTL index)
        │
        └─ Return { anomalies, anomaly_count, forecast }

POST /api/transaction/ml-insights/refresh
        Same flow but with txCountSnapshot check bypassed (?force=true equivalent)
```

**Graceful degradation:** If the AI service is unreachable or times out, both endpoints return `{ anomalies: [], forecast: { available: false } }` with HTTP 200. The Insights page falls back to rule-based anomaly detection silently.

---

### Snapshot system

`Snapshot` documents store pre-computed monthly `income`, `expense`, `txCount`, and `byCategory` totals. They are used by analytics, profile financial identity, and the active-months list — avoiding full transaction scans for common read paths.

| Operation | Method | Notes |
|-----------|--------|-------|
| Single transaction add | `applySnapshotDelta()` | Atomic `$inc` + `arrayFilters` — O(1) |
| Transaction delete | `refreshSnapshot()` | Full recompute from ledger — always correct |
| CSV import | `refreshSnapshot()` | Full recompute after all rows inserted |

`refreshSnapshot()` never throws to the caller. If it fails, it logs and swallows the error — snapshots are advisory, not canonical. The `POST /api/profile/reconcile-balance` endpoint recomputes the balance from the raw transaction ledger if snapshots drift.

---

## Data schemas

### User

```
Collection: users
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `name` | String | required, max 100 | |
| `username` | String | required, unique, max 100 | |
| `email` | String | required, unique | |
| `password` | String | min 8 | nullable — Google OAuth users have no password |
| `googleId` | String | unique, sparse | null for password accounts |
| `lastLoginAt` | Date | | |
| `lastActivityAt` | Date | | |
| `lastActivityType` | String | | |
| `tokenVersion` | Number | default 0 | bumped on logout-all / password change |
| `emailVerified` | Boolean | default true | false for new password-only accounts until verified |
| `streakDays` | Number | default 0 | current consecutive days with a transaction |
| `streakLastDate` | String | `YYYY-MM-DD` | last day a transaction was logged |
| `longestStreak` | Number | default 0 | all-time best streak |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### Session

```
Collection: sessions
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, indexed | |
| `tokenHash` | String | required, unique, indexed | SHA-256 of the raw JWT |
| `device.name` | String | default 'Unknown device' | parsed from User-Agent |
| `device.browser` | String | | |
| `device.os` | String | | |
| `device.ip` | String | | |
| `createdAt` | Date | default now | |
| `lastSeen` | Date | default now | updated fire-and-forget on each request |
| `expiresAt` | Date | required, TTL index | MongoDB auto-deletes after expiry |

**Indexes:** `{ tokenHash: 1 }` unique, `{ user: 1 }`, `{ expiresAt: 1 }` (TTL)

---

### Transaction

```
Collection: transactions
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User | |
| `description` | String | required | HTML tags + null bytes stripped at DTO layer |
| `category` | String | required | lowercased; references Category by name |
| `amount` | Number | required | always positive |
| `currency` | String | required | 3-letter ISO 4217 code (e.g. `IDR`) |
| `type` | String | enum: `income \| expense` | |
| `time` | Date | required | stored as UTC; original timezone in `transaction_timezone` |
| `transaction_timezone` | String | required | IANA identifier (e.g. `Asia/Jakarta`) |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

**Indexes:**
- `{ user: 1, time: -1 }` — dashboard list, analytics, anomalies
- `{ user: 1, type: 1, time: -1 }` — expense-only queries

---

### Balance

```
Collection: balances
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User | |
| `amount` | Number | required | running balance; updated via atomic `$inc` on every transaction add/delete |
| `updatedAt` | Date | auto | |

Never read-modify-write. Always use `Balance.findOneAndUpdate({ user }, { $inc: { amount: delta } })`.

---

### Category

```
Collection: categories
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | scoped per user |
| `name` | String | required, max 100 | stored lowercase |
| `type` | String | enum: `income \| expense` | default `expense` |
| `group` | String | enum: `essential \| discretionary \| savings \| social \| income \| other` | default `other`; set by AI classifier |
| `groupConfidence` | Number | 0–1, default 0 | confidence score from AI |
| `groupOverridden` | Boolean | default false | when true, `classifyAll` skips this category; used as a learning hint for future classifications |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

**Indexes:** `{ user: 1, name: 1 }` unique

---

### Snapshot

```
Collection: snapshots
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `yearMonth` | String | required, format `YYYY-MM` | |
| `income` | Number | default 0 | sum of all income transactions for the month |
| `expense` | Number | default 0 | sum of all expense transactions for the month |
| `txCount` | Number | default 0 | total transaction count for the month |
| `byCategory` | Array | `[{ category, total, count }]` | expense breakdown, sorted by total desc |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

**Indexes:** `{ user: 1, yearMonth: 1 }` unique, `{ user: 1, yearMonth: -1 }`

---

### Goal

```
Collection: goals
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User | |
| `description` | String | required | goal name / description |
| `achieve` | Number | enum: `0 \| 1` | 0 = not yet, 1 = achieved |
| `price` | Number | required | target amount |
| `savedAmount` | Number | default 0, min 0 | amount saved so far; progress = `savedAmount / price * 100` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

**Note:** `savedAmount` is goal-specific. Do not use balance or any shared pool.

---

### Budget

```
Collection: budgets
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `yearMonth` | String | required, pattern `YYYY-MM` | |
| `amount` | Number | required, min 0 | monthly budget override |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

**Indexes:** `{ user: 1, yearMonth: 1 }` unique

When reading, the backend first looks for a `Budget` document; falls back to `Preference.monthlyBudget` if none exists. Writing updates `Preference.monthlyBudget` only when `updateDefault: true` is explicitly passed.

---

### Preference

```
Collection: preferences
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required, unique | |
| `currency` | String | default `IDR` | 3-letter ISO 4217 code |
| `timezone` | String | default `Asia/Jakarta` | IANA identifier |
| `weekStartsOn` | String | enum: `monday \| sunday` | default `monday` |
| `numberFormat` | String | enum: `dot \| comma` | `dot` = 5.000.000; `comma` = 5,000,000 |
| `monthlyBudget` | Number | default 0, min 0 | global default budget; per-month overrides live in Budget collection |

---

### MLInsight

```
Collection: mlinsights
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `yearMonth` | String | required, format `YYYY-MM` | |
| `generatedAt` | Date | required | TTL base — auto-expires after 24h |
| `txCountSnapshot` | Number | required | expense tx count at generation time; cache invalidated when this changes |
| `anomalies` | Array | default `[]` | from AI service |
| `anomalyCount` | Number | default 0 | |
| `forecast` | Object | default null | from AI service |

**Indexes:** `{ user: 1, yearMonth: 1 }` unique, `{ generatedAt: 1 }` TTL (expireAfterSeconds: 86400)

---

### PasswordReset

```
Collection: passwordresets
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `token` | String | required, unique | `crypto.randomBytes(32).toString('hex')` |
| `expiresAt` | Date | required, TTL index | auto-deleted after 1 hour |
| `used` | Boolean | default false | |

---

### EmailVerification

```
Collection: emailverifications
```

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `token` | String | required, unique | |
| `expiresAt` | Date | required, TTL index | auto-deleted after expiry |

---

## AI service models

### Classifier (`models/classifier.py`)

Classifies category names into semantic groups using a three-pass strategy:

| Pass | Method | Confidence |
|------|--------|-----------|
| 1 | Exact keyword match | 1.0 |
| 2 | Substring / partial match | 0.9 |
| 3 | TF-IDF char-ngram (2–4) cosine similarity vs. keyword corpus | score if > 0.25 |
| fallback | — | `other`, 0.0 |

The TF-IDF vectorizer is fitted once at module load from `KEYWORD_RULES`. No per-request model training.

**Endpoint:** `POST /classify` — `{ categories: string[] }` → `{ results: [{ category, group, confidence }] }`

---

### Anomaly detection (`models/anomaly.py`)

Groups the last 6 months of expense transactions by category and scores current-month transactions:

| Samples per category | Algorithm | Threshold |
|----------------------|-----------|-----------|
| ≥ 10 | Isolation Forest (`contamination=0.1`, 100 estimators) | `prediction == -1` |
| 3–9 | Z-score | `|z| ≥ 2.0` |
| < 3 | Skipped | insufficient context |

Returns top 10 results sorted by anomaly score, each with `severity` (high/medium/low), `multiple` (Nx vs category average), and a plain-English `label`.

**Severity thresholds:** `multiple ≥ 3` or `score ≥ 0.7` → high; `multiple ≥ 1.8` → medium; else low.

---

### Forecast (`models/forecast.py`)

Fits a Linear Regression on cumulative daily spend to predict month-end total:

```
X = [day_1, day_2, ..., current_day]
y = cumulative_spend[X]
predict at day = days_in_month
result = max(prediction, spent_so_far)  ← can't be less than already spent
```

| R² | Confidence |
|----|-----------|
| ≥ 0.85 | high |
| ≥ 0.55 | medium |
| < 0.55 | low |

Requires ≥ 4 days of data. Returns `{ available: false }` otherwise.

**Endpoint:** `POST /analyze` — accepts `{ transactions, daily_totals, current_day, days_in_month, budget? }` → `{ anomalies, anomaly_count, forecast }`

---

## Environment variables

### Root `.env` (used by Docker Compose)

Copy `.env.example` → `.env` and fill in values:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_TOKEN` | — | **production** | JWT signing secret — `openssl rand -hex 32` |
| `DB_URI` | `mongodb://mongo:27017/finan?replicaSet=rs0` | | MongoDB connection string |
| `NEXT_PUBLIC_API_URL` | — | **always** | Backend URL as seen by the browser |
| `FE_URL` | `http://localhost:3000` | | Allowed CORS origin (must match frontend URL) |
| `GOOGLE_CLIENT_ID` | — | | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/api/auth/google/callback` | | Google OAuth redirect URI |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | — | | Same as `GOOGLE_CLIENT_ID` (exposed to browser) |
| `RESEND_API_KEY` | — | **always** | Resend API key |
| `FROM_EMAIL` | `noreply@lori.my.id` | | Sender address (must be on a verified Resend domain) |
| `SENTRY_DSN` | — | | Backend Sentry DSN (runtime env var) |
| `NEXT_PUBLIC_SENTRY_DSN` | — | | Frontend Sentry DSN (**build-time** — set as GitHub Actions variable) |
| `AI_SERVICE_URL` | `http://ai:3002` | | Internal AI service URL — use `http://127.0.0.1:3002` for bare-metal |

### Backend local dev (`finance-management/.env`)

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_URI=mongodb://localhost:27017/finan
SECRET_TOKEN=your_jwt_secret_here
RESEND_API_KEY=re_your_api_key_here
FROM_EMAIL=noreply@yourdomain.com
AI_SERVICE_URL=http://127.0.0.1:3002
```

### Frontend local dev (`finance-management-fe/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-client-id>
NEXT_PUBLIC_SENTRY_DSN=<optional>
```

---

## Local development (without Docker)

### Prerequisites

| Tool | Min version | Required for |
|------|-------------|-------------|
| Node.js | 22 | Backend + frontend |
| npm | 10 | Backend + frontend |
| Python | 3.12 | AI service |
| pip | 24 | AI service |
| MongoDB | 7 | Backend |
| Docker | 24 | Container deployment |
| Docker Compose | v2 | Container deployment |

### 1. Start MongoDB

```bash
# Homebrew (macOS)
brew services start mongodb-community

# or directly (without replica set — transactions unavailable)
mongod --dbpath /data/db

# with replica set (recommended — enables multi-document transactions)
mongod --replSet rs0 --dbpath /data/db
# in another terminal, once only:
mongosh --eval "rs.initiate()"
```

### 2. AI service

```bash
cd finance-management-ai
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 3002 --reload
# or: make dev-ai
```

Health check: `curl http://localhost:3002/health` → `{"status":"ok"}`

### 3. Backend

```bash
cd finance-management
cp docker.env.template .env   # fill in values
npm install
npm run dev                   # nodemon, http://localhost:3000
# or: make dev-be
```

Swagger UI (non-production): `http://localhost:3000/api-docs`

### 4. Frontend

```bash
cd finance-management-fe
# create .env.local — see above
npm install
npm run dev                   # http://localhost:3001
# or: make dev-fe
```

---

## Docker Compose (full stack)

```bash
# from finan-app/ root
cp .env.example .env
# edit .env — set SECRET_TOKEN and other required vars

make up      # docker compose up -d (builds if needed)
make logs    # tail all container logs
make down    # stop everything
```

### Container summary

| Container | Image | Internal port | Host port | Memory limit |
|-----------|-------|--------------|-----------|-------------|
| `finan-mongo` | `mongo:7` | 27017 | — | 1 GB |
| `finan-mongo-init` | `mongo:7` | — | — | — (exits after init) |
| `finan-ai` | `ghcr.io/.../finan-app-ai` | 3002 | — | 512 MB |
| `finan-be` | `ghcr.io/.../finan-app-backend` | 3000 | **3001** | 512 MB |
| `finan-fe` | `ghcr.io/.../finan-app-frontend` | 3000 | **3000** | 256 MB |
| `finan-watchtower` | `containrrr/watchtower` | — | — | 64 MB |

MongoDB is capped at 512 MB WiredTiger cache (`--wiredTigerCacheSizeGB 0.5`) to prevent it consuming all RAM on a small VPS.

### Watchtower auto-deploy

Watchtower polls GHCR every 30 seconds. Only containers with label `com.centurylinklabs.watchtower.enable=true` are watched (backend, frontend, AI service). On a new `:latest` image, Watchtower pulls and recreates the container in-place.

---

## Testing

### Backend (Mocha + Chai)

```bash
cd finance-management

npm test               # all suites
npm run test:auth
npm run test:transaction
npm run test:goal
npm run test:e2e
npm run test:app
```

| File | What it covers |
|------|---------------|
| `app.integration.test.js` | CORS, security headers, 404 handling, Swagger availability |
| `auth.integration.test.js` | Register, login, JWT, tokenVersion, duplicate prevention |
| `transaction.integration.test.js` | CRUD, balance updates, categories, CSV import, analytics |
| `goal.integration.test.js` | Goal creation, savings calculations, multi-goal |
| `end-to-end.test.js` | Full user journey, multi-user data isolation, error recovery |

Tests run against `mongodb-memory-server` — no real DB connection required. Rate limiting is disabled in `NODE_ENV=test`.

### Frontend (Playwright E2E)

```bash
cd finance-management-fe

npm run test:e2e          # requires running app on localhost:3000
npm run test:e2e:ui       # Playwright UI mode

# Authenticated tests
TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass npm run test:e2e

# Against a remote environment
PLAYWRIGHT_BASE_URL=https://your-domain.com npm run test:e2e
```

| File | What it covers |
|------|---------------|
| `public-pages.spec.js` | Landing, auth pages, legal pages, auth guard redirects — 30 tests desktop + mobile |
| `auth-flow.spec.js` | Login, dashboard, add transaction, analytics, logout-all (skipped without credentials) |

---

## API reference

All responses follow `{ status: 1|0, message: string, data: any }`. Swagger UI at `/api-docs` when `NODE_ENV !== production`.

### Auth

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/auth/register` | 10/min per IP | — | Create account; returns user + balance |
| POST | `/api/auth/login` | 10/min per IP | — | Credentials login — sets HttpOnly session cookie |
| GET | `/api/auth/check` | — | ✓ | Verify session validity; returns current user |
| POST | `/api/auth/google/verify` | 20/min per IP | — | Verify Google `id_token` — sets HttpOnly session cookie |
| POST | `/api/auth/logout` | — | ✓ | Delete current session + clear cookie |
| POST | `/api/auth/logout-all` | 5/min per user | ✓ | Delete all sessions + bump tokenVersion + clear cookie |
| GET | `/api/auth/sessions` | — | ✓ | List all active sessions with device info |
| DELETE | `/api/auth/sessions/:id` | — | ✓ | Revoke a specific session (cannot revoke current) |
| PATCH | `/api/auth/password` | 5/min per user | ✓ | Change password (deletes all sessions) |
| DELETE | `/api/auth/account` | — | ✓ | Delete account and all associated data |
| POST | `/api/auth/forgot-password` | 5/min per IP | — | Send password reset email (always returns 200) |
| POST | `/api/auth/reset-password` | 10/min per IP | — | Validate token + set new password (deletes all sessions) |

### Transactions

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/transaction` | 30/min | ✓ | Add transaction; body: `{ description, amount, category, type, time, transaction_timezone, currency? }` |
| GET | `/api/transaction/:type?` | — | ✓ | List transactions; query: `?month=YYYY-MM&category=X&search=X&page=N&limit=N&type=income\|expense` |
| PATCH | `/api/transaction/:id` | 30/min | ✓ | Update description and/or category (at least one required) |
| DELETE | `/api/transaction/:id` | — | ✓ | Delete transaction; balance updated atomically |
| GET | `/api/transaction/expense` | 60/min | ✓ | Total expense summary (all time) |
| GET | `/api/transaction/analytics` | 60/min | ✓ | Monthly/yearly analytics; query: `?year=YYYY&month=M` |
| GET | `/api/transaction/anomalies` | 60/min | ✓ | Rule-based anomaly detection (z-score on rolling average) |
| GET | `/api/transaction/explain` | 60/min | ✓ | Spending explainability breakdown by category |
| GET | `/api/transaction/time-to-zero` | 60/min | ✓ | Runway — days until balance reaches zero at current burn rate |
| GET | `/api/transaction/active-months` | 60/min | ✓ | List of months with at least one transaction (reads from Snapshots) |
| PUT | `/api/transaction/budget/:yearMonth` | 30/min | ✓ | Set budget for a month; body: `{ amount, updateDefault? }` |
| GET | `/api/transaction/ml-insights` | 20/min | ✓ | ML anomaly detection + month-end forecast (cached; degrades gracefully) |
| POST | `/api/transaction/ml-insights/refresh` | 10/min | ✓ | Force-refresh ML insights; bypasses tx-count cache check |
| POST | `/api/transaction/import/csv` | 10/min | ✓ | Bulk CSV import; `multipart/form-data`, field: `files`, up to 10 files, max 5 MB each; MulterErrors return 400 |
| GET | `/api/transaction/category` | — | ✓ | List categories; query: `?search=X&type=income\|expense` |
| GET | `/api/transaction/category/suggestions` | — | ✓ | Smart category suggestions based on time of day and past habits |
| POST | `/api/transaction/category` | — | ✓ | Seed default categories (idempotent) |
| GET | `/api/transaction/date/:date` | — | ✓ | Transactions on a specific date; `YYYY-MM-DD` |
| GET | `/api/transaction/range/:start/:end` | — | ✓ | Transactions in date range with income/expense summary |
| GET | `/api/transaction/recommendation/:monthly/:spend` | — | ✓ | Budget affordability check (legacy calculator) |

**CSV import column mapping (case-insensitive):**

| CSV header | Field | Notes |
|------------|-------|-------|
| `Title` or `Description` | description | sanitized |
| `Amount` | amount | strips `Rp`, commas, dots |
| `Type` | type | anything not `income` treated as `expense` |
| `Category` | category | created if not exists |
| `Timestamp`, `Date`, or `Time` | time | ISO 8601, `M/D/YYYY H:mm:ss`, `YYYY-MM-DD HH:mm:ss` |
| `Timezone` | transaction_timezone | IANA, defaults to `Asia/Jakarta` |

### Goals

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/goal/add` | 20/min | ✓ | Create a savings goal; body: `{ description, price }` |
| GET | `/api/goal/goals` | 60/min | ✓ | List all goals with progress percentage |
| GET | `/api/goal/goal/:id` | 60/min | ✓ | Goal detail with savings projection |

### Profile

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/api/profile` | 60/min | ✓ | Profile, preferences, and snapshot summary |
| PATCH | `/api/profile/identity` | 10/min | ✓ | Update name, username |
| PATCH | `/api/profile/preferences` | 30/min | ✓ | Update timezone, currency, numberFormat, monthlyBudget |
| GET | `/api/profile/export` | 10/min | ✓ | Export all transactions as CSV |
| POST | `/api/profile/reconcile-balance` | 5/min | ✓ | Recompute balance from raw transaction ledger |

### Category management

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/category/classify-all` | 10/min | ✓ | Classify all unclassified categories (`group === 'other'`) for the user; skips `groupOverridden` |
| GET | `/api/category/group-summary` | 30/min | ✓ | Spending totals by semantic group; query: `?month=YYYY-MM&tz=IANA`. Each category entry includes `_id` |
| GET | `/api/category` | 60/min | ✓ | List all user categories with `_id`, `name`, `type`, `group`, `groupOverridden` |
| PATCH | `/api/category/:id/group` | 30/min | ✓ | Override a category's spending group; body: `{ group }` — sets `groupOverridden: true` |
| PATCH | `/api/category/:id/rename` | 30/min | ✓ | Rename a category; body: `{ name }`. Updates all referencing transactions atomically. 409 if new name already exists |
| DELETE | `/api/category/:id` | 30/min | ✓ | Delete a category. 409 if any transaction uses it (returns count). 400 if `:id` is not a valid ObjectId |

### Gamification

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/api/gamification/summary` | 30/min | ✓ | Streak count, budget win, goal ring progress |

### Recommendations (smart nudges)

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/api/recommendations` | 20/min | ✓ | 1–5 personalised rule-based nudges; query: `?tz=IANA` |

---

## Architecture decision notes

### MongoDB replica set

Single-node `rs0` (`--replSet rs0`) so multi-document transactions are available. A standalone MongoDB does not support transactions. The `mongo-init` container initiates it idempotently on first boot.

### Balance updates

Use atomic `$inc` — never read-modify-write. Balance is a derived value. `POST /api/profile/reconcile-balance` recomputes from the transaction ledger if the balance ever drifts.

### Input sanitization

`sanitizeText()` in `transaction.dto.js` strips HTML tags (`/<[^>]*>/g`) and null bytes (`/\0/g`) from all `description` and `category` fields before they reach the database. Prevents stored XSS.

### Rate limiting

`rateLimit.js` is an in-process sliding-window limiter. Two strategies:

- `limiter.byIp(N)` — unauthenticated endpoints (keyed by `req.ip`)
- `limiter.byUser(N)` — authenticated endpoints (keyed by `req.user.id`)

No external dependencies (no Redis). **Scaling note:** replace with `express-rate-limit` + Redis store when running multiple backend instances.

Rate limiting is disabled in `NODE_ENV=test`.

### Connection pool

MongoDB connection pool is capped at `maxPoolSize: 10`, `minPoolSize: 2`. The default of 100 would waste sockets on a small VPS.

### Dark mode

Theme preference is stored in `localStorage`. The root layout injects a blocking inline script before first paint to apply `.dark` (prevents flash). Dark mode is implemented via CSS class overrides in `globals.css` (`.dark .bg-white { ... }`) — not Tailwind's `dark:` variant — because Tailwind v4 without explicit config uses the OS media query strategy, which would bypass the app's own toggle.

### Tooltip (fixed mode)

`Tooltip.js` supports a `fixed` prop that renders the bubble via `createPortal` at `position: fixed`, escaping any `overflow: hidden` / `overflow: auto` container. Always use `<Tooltip text="..." fixed />` in dashboards and tight layouts to prevent viewport clipping on mobile.

### Currency

The app is multi-currency. Never hardcode `Rp`, `IDR`, or `jt` in UI text. Use `formatAmount()` / `useCurrency()` from `CurrencyContext` for all amounts.

### Per-month budget resolution

1. Check for `Budget` document with `{ user, yearMonth }`
2. If none, fall back to `Preference.monthlyBudget`

Writing a budget updates `Preference.monthlyBudget` only when `updateDefault: true` is explicitly passed — prevents one-off month overrides from silently becoming the global default.

### Category mutations use `_id`, not `:name`

All category mutation routes (`PATCH /:id/group`, `PATCH /:id/rename`, `DELETE /:id`) address categories by MongoDB `_id`, not by name. Reasons:

- **Stability** — the URL is unchanged even after a rename.
- **Performance** — `_id` lookup is an indexed equality scan; name-based regex matching is slower and requires escaping special characters.
- **Correctness** — `encodeURIComponent` edge cases (parentheses, `+`, etc.) are avoided entirely.

`getGroupSummary` includes `_id` in each category entry so the frontend can address categories by id after a single data fetch. `listCategories` (`GET /api/category`) also returns `_id` for use by the ManageCategories UI.

Regex escaping is still applied internally in `deleteCategory` and `renameCategory` when updating `Transaction` documents by category name (transactions store the name as a string, not an `_id` reference).

---

## CI/CD pipeline

Two workflows in `.github/workflows/`:

**`ci.yml`** — runs on pull requests to `main`. Uses `dorny/paths-filter` to detect which subtree changed. Backend tests (`npm test`) only run when `finance-management/**` changed; frontend build check only runs when `finance-management-fe/**` changed.

**`cd.yml`** — runs on push to `main`. Same path filtering — only rebuilds changed images. Backend, frontend, and AI service build jobs run in parallel. Images tagged `:latest` pushed to GHCR. Watchtower on the server polls GHCR every 30s and redeploys automatically.

**Important:** Changing `docker-compose.yml` or other root-level files does **not** trigger an image rebuild — those changes require a manual `git pull` + `docker compose up -d` on the server.

---

## Error monitoring

Two separate Sentry projects:

| Service | SDK | DSN env var | When applied |
|---------|-----|-------------|--------------|
| Backend (Express) | `@sentry/node` | `SENTRY_DSN` | Runtime — add to `.env`, recreate container |
| Frontend (Next.js) | `@sentry/nextjs` | `NEXT_PUBLIC_SENTRY_DSN` | **Build-time** — set as GitHub Actions variable, triggers on next image build |

**Backend:** `Sentry.init()` runs before all other imports in `app.js`, guarded by `NODE_ENV === 'production' && SENTRY_DSN`. `Sentry.setupExpressErrorHandler(app)` registered after all routes. `uncaughtException` also calls `Sentry.captureException()`.

**Frontend:** `sentry.client.config.js` initialises Session Replay (5% of sessions, 100% on error). `instrumentation.js` initialises the server SDK via the Next.js instrumentation hook.

---

## Contributing

1. Fork the repo and create a branch from `main`.
2. Run `npm test` inside `finance-management/` — all tests must pass.
3. Run `npm run test:e2e` inside `finance-management-fe/` against a running instance.
4. Keep commits focused — one logical change per commit.
5. Update this file if you add new routes, models, environment variables, or change service topology.
