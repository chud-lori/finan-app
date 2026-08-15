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
   - [Category taxonomy & ML classification](#category-taxonomy--ml-classification)
   - [ML insights pipeline](#ml-insights-pipeline)
   - [Snapshot system](#snapshot-system)
4. [Data schemas](#data-schemas)
5. [ML modules](#ml-modules-servicesml)
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
| Backend | Bun 1.x runtime, Express.js (CommonJS via Bun's Node compat) |
| Database | MongoDB 7 (Mongoose ODM, single-node replica set `rs0`) |
| Auth | JWT (jsonwebtoken) in HttpOnly cookies + Google OAuth 2.0 (Passport.js) + stateful session store (MongoDB) |
| Password hashing | bcrypt (salt 10) |
| Email | Resend SDK |
| Error monitoring | Sentry (`@sentry/node` + `@sentry/nextjs`) |
| File upload | Multer (`upload.array` for multi-file CSV) |
| Rate limiting | Custom in-process sliding-window (no Redis dependency) |
| Logging | Winston + Morgan (JSON access log + daily-rotate file) |
| Testing | Mocha + Chai + mongodb-memory-server |
| Frontend | Next.js 16 (App Router), React, Tailwind CSS v4 |
| Charts | Recharts |
| Frontend testing | Playwright E2E |
| Smart insights | `finance-management/services/ml/` — zero-dep JS modules: keyword + TF-IDF classifier, median/MAD anomaly detector, linear-regression forecast, gated recurring/subscription detector |
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
├── finance-management/             ← Backend (Bun + Express.js + MongoDB)
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
│   ├── services/
│   │   └── ml/                     ← in-process JS smart insights and classification
│   │       ├── index.js            ← facade: classifyBatch() + analyze()
│   │       ├── classifier.js       ← keyword + TF-IDF char-ngram cosine
│   │       ├── anomaly.js          ← per-category median/MAD outlier detector
│   │       ├── recurring.js        ← subscription/bill detection (category + amount + cadence gate)
│   │       ├── forecast.js         ← linear-regression month-end forecast
│   │       └── keywords.js         ← bilingual EN/ID taxonomy
│   ├── helpers/
│   │   ├── categoryClassifier.js   ← user-override pre-resolver; delegates remaining names to services/ml
│   │   ├── seedDefaultCategories.js ← idempotent per-user upsert of default categories from categories.json
│   │   ├── validator.js            ← express-validator rule sets
│   │   ├── mailer.js               ← Resend SDK (password reset + email verification)
│   │   ├── snapshot.js             ← refreshSnapshot() + applySnapshotDelta()
│   │   ├── spendingVolatility.js  ← classifyVolatility() — CV-based fixed/flexible category class
│   │   ├── savingsCategories.js   ← getSavingsCategoryNames() — group==='savings' names to exclude from spend
│   │   ├── financialHealth.js     ← computeFinancialHealth() — 0-100 score from 4 pillars
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
│       ├── ml.anomaly.test.js
│       ├── ml.recurring.test.js
│       ├── spendingVolatility.test.js
│       ├── financialHealth.test.js
│       ├── dataIntegrity.integration.test.js
│       ├── explain.integration.test.js
│       └── end-to-end.test.js
│
└── finance-management-fe/          ← Frontend (Next.js 16 + Tailwind CSS v4)
    ├── Dockerfile
    ├── playwright.config.js
    ├── app/
    │   ├── layout.js               ← root layout, ErrorBoundary, theme script
    │   ├── page.js                 ← Landing page (always light mode)
    │   ├── dashboard/page.js       ← Balance, transactions, month picker
    │   ├── analytics/page.js       ← Monthly/yearly charts, category breakdown; year nav bounded by availableYears; clicking a bar in yearly view opens month transaction modal
    │   ├── insights/page.js        ← ML insights, anomaly, explainability, group summary, ManageCategories (rename/delete)
    │   ├── recommendation/page.js  ← 11 financial planning tools (incl. Windfall Planner, Zakat Estimator)
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
│  Frontend               │   │  Backend (Express / Bun runtime) │
│  Next.js 16 App Router  │   │  container port 3000             │
│  SSR + static assets    │   │  host port 3001                  │
│  Tailwind CSS v4        │   │  JWT · rate limiting · REST API  │
└─────────────────────────┘   └─────────────┬────────────────────────┘
                                            │  (ML runs in-process — services/ml)
                               ┌────────────▼──┐
                               │  MongoDB 7     │
                               │  rs0 replica   │
                               │  set (single)  │
                               │  internal only │
                               └────────────────┘
```

**Network isolation:** MongoDB is not exposed to the host. Only the backend (port 3001) and frontend (port 3000) are published. The backend reaches MongoDB via the Docker network hostname `mongo`.

**Startup order** (enforced by Docker Compose healthchecks):

```
mongo (healthy) → mongo-init (completes) → backend (healthy) → frontend
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
  │    └─ (optional) calls services/ml in-process (synchronous, no network)
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
| `DELETE /account` | `Session.deleteMany({ user })` + clears cookie before user doc deletion — prevents a ~7-day ghost-session window where the JWT cookie would still authenticate against a removed user |
| TTL expiry | MongoDB auto-deletes Session docs past `expiresAt` |

**Anti-enumeration:**

| Endpoint | Behavior |
|----------|----------|
| `POST /login` | Returns generic `401 Invalid credentials` for both "no such user" and "wrong password". `EMAIL_NOT_VERIFIED` (403) is distinguishable so the FE can show a resend-verification CTA. Google-only accounts get a distinct 400 (UX exception) |
| `POST /forgot-password` | Always returns 200, regardless of whether the email is registered |
| `POST /resend-verification` | Always returns 200, regardless of whether the email is registered or already verified |

**Token hashing — all bearer-style tokens are stored as SHA-256 hashes:**

| Token | Model | Raw lives in | Stored as |
|-------|-------|--------------|-----------|
| JWT session | `Session` | HttpOnly cookie | `tokenHash` |
| Password reset | `PasswordReset` | Email body (1h TTL) | `tokenHash` |
| Email verification | `EmailVerification` | Email body (24h TTL) | `tokenHash` |

A database leak therefore cannot be replayed against the auth endpoints — every consumer-side handler SHA-256s the user-supplied token before `findOne`. The schema migration helper at `helpers/migrateTokenIndexes.js` drops the legacy `token_1` unique index on first startup after this change is deployed.

---

### Category taxonomy & ML classification

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
        └─ 5. If still unmatched → services/ml.classifyBatch() (in-process)
                    │
                    ├─ services/ml/classifier.js
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

**User override learning:** When a user manually moves a category to a different group (`PATCH /api/category/:id/group`), `groupOverridden: true` is set. On the next classification run for that user, the overridden categories are loaded and used as learning hints — so future categories with similar names are matched to the user-defined group before the in-process classifier is consulted.

**Default categories:** 31 expense + 9 income categories are seeded per-user from `categories.json` via `seedDefaultCategories()`. This runs fire-and-forget on new user registration (email/password and Google OAuth). For existing users with zero categories, `GET /api/transaction/category` triggers a passive seed before returning results — no manual migration needed. Three of the expense defaults (`savings`, `reksa dana`, `stocks`) carry a `group: "savings"` in `categories.json`; `seedDefaultCategories()` writes that group **only on insert** (`$setOnInsert`), so a later user re-group is never clobbered by an idempotent re-seed, and because the seeded group is not `'other'`, `classifyAll` leaves it untouched.

**`classifyAll` (`POST /api/category/classify-all`):** Processes all categories where `group === 'other'` AND `groupOverridden !== true`. Safe to call repeatedly. Called automatically on the Insights page load.

---

### Savings & investment visibility

Transaction `type` is only `income | expense` — there is no `transfer`. Investing (reksa dana / DCA / a deposit) leaves spendable cash but is **not consumption**, so users would otherwise skip recording it and only enter leftover income, corrupting the savings rate, 50/30/20 split and net-worth flow.

**Option A convention:** record the *full* income and log the investment as an **expense in a `group === 'savings'` category**. The atomic `$inc` balance still decrements (the cash really left), but every "spend" metric treats savings-group outflow as *saved, not spent*:

| Metric | Where | Treatment |
|--------|-------|-----------|
| Savings rate | `controllers/gamification.js#computeHealth` | `(income − nonSavingsExpense) / income` — savings-group outflow is excluded from the expense figure (also excluded from the emergency-fund avg-expense and budget-pace denominators). |
| Explainability spend | `controllers/transaction.js#getExplainability` | savings-group txns dropped from `totalOutcome`, top categories and the MoM baseline. |
| Anomaly baseline (rule) | `controllers/transaction.js#getAnomalies` | savings-group txns removed from the current set, historical baseline and the "first-time category" signal. |
| Anomaly baseline (ML) | `services/ml/anomaly.js#detectAnomalies` | skips any tx flagged `is_savings`; the flag is set in `_runMLPipeline` and savings-group outflow is also excluded from the forecast's `daily_totals`. |
| 50/30/20 | `finance-management-fe/lib/ruleSplit.js#buildRuleSplit` | savings bucket = `savingsGroup + max(income − nonSavingsExpense − savingsGroup, 0)`. |

**The double-count trap (50/30/20):** if savings-group outflow is excluded from expense, the surplus rises by exactly that amount. Adding both the raised surplus *and* the savings-group total to the savings bucket would count the invested rupiah twice. `buildRuleSplit` computes the surplus against **income − total outflow** (`income − nonSavingsExpense − savingsGroup`, i.e. the old `income − totalExpense`), so each rupiah lands in exactly one place: invested money in `savingsGroup`, idle cash in the surplus. Covered by a regression test in `lib/ruleSplit.test.js`.

The category → savings lookup is centralised in `helpers/savingsCategories.js#getSavingsCategoryNames(userId)` (a lowercased `Set` of `group === 'savings'` category names).

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
        ├─ services/ml.analyze({ transactions, daily_totals, current_day, days_in_month, budget }) — in-process, synchronous
        │    ├─ detectAnomalies()        → per-category median/MAD (modified z ≥ 3.5, samples ≥ 3)
        │    └─ forecastMonthSpend()     → closed-form least-squares on cumulative daily spend
        │
        ├─ Store result in MLInsight collection
        │   (auto-expires after 24h via TTL index)
        │
        └─ Return { anomalies, anomaly_count, forecast }

POST /api/transaction/ml-insights/refresh
        Same flow but with txCountSnapshot check bypassed (?force=true equivalent)
```

**Graceful degradation:** Native ML is synchronous and never throws on well-formed input — the empty-payload paths return `{ anomalies: [], forecast: { available: false, reason: ... } }` directly.

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
| `group` | String | enum: `essential \| discretionary \| savings \| social \| income \| other` | default `other`; set by ML classifier |
| `groupConfidence` | Number | 0–1, default 0 | confidence score from ML classifier |
| `groupOverridden` | Boolean | default false | when true, `classifyAll` skips this category; used as a learning hint for future classifications |
| `isUtility` | Boolean | default false | utility bill (electricity/internet/`bill`) — recurring detection loosens only its amount gate for these; set from seed defaults, overridable per category |
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

### Allocation

```
Collection: allocations
```

Records a one-tap allocation of a cash-flow surplus or an income windfall into a
`Goal`. **Not a money-movement ledger and never a shared pool** — the money moves
onto the target goal's own `savedAmount` (atomic `$inc`). The row exists so the
prompting nudge can suppress itself: a surplus month or windfall transaction with
an `Allocation` is "handled" and no longer nudged.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required, indexed | |
| `source` | String | enum: `surplus \| windfall`, required | what prompted the allocation |
| `sourceKey` | String | required, ≤64 chars | `surplus` → `'YYYY-MM'` of the surplus month; `windfall` → the income transaction id |
| `goal` | ObjectId | ref: Goal, required | the funded goal |
| `amount` | Number | required, min 0 | amount added to the goal's `savedAmount` |
| `createdAt` / `updatedAt` | Date | auto | |

**Indexes:** `{ user: 1, source: 1, sourceKey: 1 }` (non-unique — a windfall can be
split across several goals). In `userScopedModels`, so `deleteAccount` clears it.

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

### NetWorth

```
Collection: networths
```

Current holdings — exactly one document per user. User-declared, not derived from the ledger (the app knows cash flow, not houses or car loans). Each entry in `assets` / `liabilities` is a `Holding`: `{ label (≤60 chars), amount (≥0), type }`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required, unique | one doc per user |
| `assets` | Array | `[{ label, amount, type }]` | `type` ∈ cash, investment, property, vehicle, receivable, other |
| `liabilities` | Array | `[{ label, amount, type }]` | `type` ∈ loan, mortgage, credit_card, bnpl, payable, other |
| `createdAt` / `updatedAt` | Date | auto | |

**Seed row:** `GET /api/networth` copies the app cash `Balance` into a draft `cash` asset row when no holdings exist yet — a read-only copy; `Balance` is never written from here.

### NetWorthSnapshot

```
Collection: networthsnapshots
```

One reading per user per calendar month — the trend history. `assets` / `liabilities` are the totals at write time (row breakdown deliberately not copied; the trend only needs the two sums).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `user` | ObjectId | ref: User, required | |
| `yearMonth` | String | required, `YYYY-MM` | |
| `assets` | Number | default 0 | total assets at write time |
| `liabilities` | Number | default 0 | total liabilities at write time |
| `netWorth` | Number | default 0 | `assets − liabilities` |
| `createdAt` / `updatedAt` | Date | auto | |

**Indexes:** `{ user: 1, yearMonth: 1 }` unique, `{ user: 1, yearMonth: -1 }`

**Endpoints** (all `authenticateJWT` + per-user rate limits):

| Method | Path | Limit | Behaviour |
|--------|------|-------|-----------|
| `GET` | `/api/networth` | 60/min | current holdings + derived net worth (seeds Balance as a draft asset; does not persist) |
| `PUT` | `/api/networth` | 30/min | replace holdings → recompute → **upsert** this month's snapshot (edit twice in a month = overwrite, not append) |
| `GET` | `/api/networth/history` | 60/min | monthly snapshots for the trend line (`?limit=`, default 12, oldest-first) |

Both `NetWorth` and `NetWorthSnapshot` are in `userScopedModels`, so `deleteAccount` clears them (asserted in `test/dataIntegrity.integration.test.js`).

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
| `anomalies` | Array | default `[]` | from `services/ml.analyze()` |
| `anomalyCount` | Number | default 0 | |
| `forecast` | Object | default null | from `services/ml.analyze()` |

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

## ML modules (`services/ml/`)

All smart insights and category classification run in-process inside the backend via zero-dependency JS modules.

### Classifier (`services/ml/classifier.js`)

Three-pass strategy with confidence rounded to 3 decimals:

| Pass | Method | Confidence |
|------|--------|-----------|
| 1 | Exact keyword match | 1.0 |
| 2 | Substring / partial match | 0.9 |
| 3 | TF-IDF char-ngram (2–4, `char_wb`) cosine similarity vs. keyword corpus | score if > 0.25 |
| fallback | — | `other`, 0.0 |

The TF-IDF corpus + IDF + L2-normalised keyword vectors are precomputed once at module load. Every classify call is O(grams_in_input). No per-request model fitting.

**API:** `classifyBatch(names)` → `[{ category, group, confidence }, ...]`

---

### Anomaly detection (`services/ml/anomaly.js`)

Per-category outlier detector. Each current-month transaction is scored against a **leave-one-out** baseline — the other transactions in the same category — using the median and MAD (median absolute deviation), via the Iglewicz–Hoaglin modified z-score `M = 0.6745 · (x − median) / MAD` with the conventional 3.5 cutoff. User-visible severity is driven by `multiple = amount / median` plus that score, and each result carries `baseline_count` so the UI can state what the comparison was made against.

Two properties this design exists for:

- **Small categories can fire.** The earlier implementation scored a transaction against a population that included itself using population stddev, which caps the attainable z at `(n−1)/√n` — 1.15 at n=3, 1.50 at n=4, 1.79 at n=5, all below the old 2.0 threshold. A category with fewer than 6 transactions could therefore never produce an anomaly regardless of amount.
- **Outliers don't mask each other.** Mean and stddev are dragged by extreme values, so two large purchases in one category each inflated the baseline the other was measured against and neither was flagged. Median and MAD have a 50% breakdown point, so a minority of extremes cannot move them.

Guards: only over-spending is reported, and a baseline with no spread at all (`MAD = 0`, e.g. fixed rent) falls back to a pure ratio test. Covered by `test/ml.anomaly.test.js`.

**Volatility-gated sensitivity.** The thresholds are not fixed — they scale with how much the category's monthly total normally swings, classified from its prior months via `classifyVolatility` (the current, in-progress month is excluded so the spike being judged can't soften its own gate). A naturally spiky category (sharing, food) needs a much bigger jump before it alerts, because spikiness is its normal state; a flat category (rent, a utility) alerts on a small deviation, because any jump there is genuinely unexpected:

| Class | min multiple | modified-z |
|-------|-------------|-----------|
| `fixed`    | 1.3 | 3.5 |
| `semi`     | 1.5 | 3.5 |
| `flexible` | 3.0 | 5.0 |
| `unknown`  | 1.3 | 3.5 (too little history → default) |

The rule-based fallback `getAnomalies` applies the same idea to its mean-ratio test: flag threshold is `{ fixed: 1.5, semi: 2, flexible: 4, unknown: 2 }`×.

| Samples per category | Algorithm | Threshold |
|----------------------|-----------|-----------|
| ≥ 3 (leave-one-out ≥ 2) | Median + MAD, Iglewicz–Hoaglin modified z | `M` and `multiple` gated by category volatility (see table above) |
| < 3 | Skipped | insufficient context |

---

### Category volatility & pace-corrected insights (`helpers/spendingVolatility.js` + `getExplainability`)

The rule-based insight feed ("What your data is saying") weights each category by whether the user can actually *act* on it, derived from data rather than a fixed taxonomy — the `essential`/`discretionary` group is too coarse (rent and food are both `essential` yet behave oppositely).

**Classification.** `classifyVolatility(monthlyTotals, txPerMonth)` computes the coefficient of variation (`std / mean`, sample stddev) of a category's monthly totals across the trailing 6 complete months:

| Class | Rule | Meaning |
|-------|------|---------|
| `fixed` | CV ≤ 0.15 **and** ≤ 1.5 tx/month | committed cost (rent, insurance) — not a monthly lever |
| `flexible` | CV ≥ 0.35 | discretionary (food, shopping) — the actionable lever |
| `semi` | between the two | variable bill (some utilities) |
| `unknown` | < 3 active months | not enough history — treated like flexible |

Thresholds are tunable defaults, **not** tuned on production data. Unit-tested in `test/spendingVolatility.test.js`.

**Pace-corrected delta.** `getExplainability` no longer compares a partial current month against a *full* previous month (which made every accruing category read "down ~75% — great progress" early in the month). Instead:
- `fixed` categories are compared **posted-vs-posted** (no pro-rating — you don't pro-rate a rent payment); `delta` is `null` until this month's charge exists.
- everything else is compared against the previous month **pro-rated to the elapsed fraction** of the current month, so on-pace spending reads ≈ 0%.

Each `topCategories` entry carries `volatility` and `cv`. The frontend `buildInsights` branches on `volatility`: it suppresses the "high dependency" warning for fixed costs (stating them neutrally), treats a fixed-cost change as an informational "new baseline?" at a low threshold, and reserves the actionable "you can trim this" / "great progress" framing for flexible categories at higher thresholds. The field is additive, so cached pre-upgrade payloads degrade to the prior behaviour. Covered by `test/explain.integration.test.js`.

Returns top 10 results sorted by anomaly score, each with `severity` (high/medium/low), `multiple` (Nx vs category average), and a plain-English `label`.

**Severity thresholds:** `multiple ≥ 3` or `score ≥ 0.7` → high; `multiple ≥ 1.8` → medium; else low.

---

### Forecast (`services/ml/forecast.js`)

Closed-form least-squares linear regression on cumulative daily spend:

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

Requires ≥ 4 days of data. Returns `{ available: false, reason, days_tracked }` otherwise.

**API:** `analyze({ transactions, daily_totals, current_day, days_in_month, budget? })` → `{ anomalies, anomaly_count, forecast }`

---

### Recurring detection (`services/ml/recurring.js`)

Groups expenses by a normalized merchant key (lowercase, digits/punctuation stripped, first 3 tokens), then reads the median gap between consecutive charges to pick a cadence bucket (daily → yearly).

Periodicity alone is **not** enough to call a group a subscription — a fixed-price lunch bought roughly monthly is indistinguishable from a streaming bill on cadence and amount alone. A group is promoted to a subscription/bill only when **all three gates** pass:

| Gate | Rule | Why |
|------|------|-----|
| Category | dominant category not on `BLOCKED_CATEGORY_TERMS` (food, coffee, snack, cigar, grocery, sharing, … EN + ID, whole-word match) | This is the discriminator that separates real bills from look-alike food/drink repeats |
| Amount | coefficient of variation (stddev/mean) ≤ `0.12` (≤ `0.35` for flagged utility categories) | Removes variable-amount spend; deliberately **not** MAD-based, so a single price hike still registers as drift |
| Cadence | canonical period ≥ 26 days **and** `MAD(gaps)/median(gaps)` ≤ `0.15` | Real bills post on a precise ~30-day schedule; coincidental spend is irregular and often sub-weekly |

The category rule is a **blocklist, not an allowlist** — a bill the user filed under an odd or invented category still gets detected, which an allowlist would have silently dropped. The group's category is the *dominant* one across its transactions, so one stray re-tag can't knock out a year-long bill.

**Utility amount leeway.** Utilities (electricity, internet, the catch-all `bill`) post on a tight monthly schedule but the *amount* genuinely swings with usage — the flat `0.12` amount gate would drop them, and being monthly they can't fall back to `frequent[]` either, so a real bill would vanish. The caller passes `utilityCategories` (a Set of exact lowercased category names) and those categories get the looser `0.35` amount ceiling while keeping the tight cadence gate. This is a **structured signal** — `Category.isUtility`, seeded on electricity/internet/`bill` and overridable per category — never a fuzzy match on the category text. The controller unions the seed defaults (`DEFAULT_UTILITY_CATEGORY_NAMES`) with any category the user has flagged, so existing users are covered without a migration.

**Missing-bill and price-jump alerts fire only for groups that clear all three gates.** Anything that fails them is either dropped or filed as frequent spend, and neither can raise an alert.

Stable sub-monthly repeats (a weekly gym pass, a near-daily coffee) are surfaced separately in `frequent[]` — informational only: no `nextDue`, no alerts, a looser CV ceiling (`0.20`), and, below weekly cadence, a minimum of 5 occurrences before a handful of charges counts as a habit. Blocklisted categories are welcome here; a daily coffee is exactly what the list is for.

Grouping is unchanged by this gate — this is a classification step, not a clustering one. No external AI, no embeddings, no fuzzy merchant matching: those would only add false-*merge* risk (joining two merchants that share a word) for no benefit.

**API:** `detectRecurring(transactions, { asOf, utilityCategories })` → `{ recurring[], monthlyTotal, count, alerts[], frequent[], frequentMonthlyTotal }`. `utilityCategories` is an optional Set of exact lowercased category names that earn the looser amount gate. Also exports `merchantKey()` and `isBlockedCategory()`.

### Money Recap (`services/ml/recap.js`)

A rule-based, fully in-process monthly "wrapped" — no LLM, nothing leaves the box. `buildRecap(input)` is a pure function that stitches a plain-language `narrative[]` and a set of stat `tiles[]` out of signals the app already computes: the monthly `Snapshot` (this month vs the one before), the Financial Health score (`computeHealth`, reused from `controllers/gamification.js`), the logging streak, the net-worth reading (`NetWorthSnapshot`), the ML anomaly count (`MLInsight`) and the per-category top mover.

Narrative discipline: lines never bake in a formatted amount — they speak in percentages, counts, category names and month labels so they read correctly in any currency. Raw amounts ride only on `tiles`, which the frontend formats via `useFormatAmount()`. Each tile carries `{ key, label, value, format: 'currency'|'percent'|'number', tone, delta? }`.

Graceful degradation: `buildRecap` returns `{ available: false, reason }` when either the target month or its prior month is missing — a recap needs ≥1 full prior month to compare against. The `getRecap` controller reads snapshots O(1), caches per `(month, tz)`, and is invalidated by `cache.invalidateUser` on any transaction mutation. Covered by `test/ml.recap.test.js` (pure) and `test/recap.integration.test.js`.

### Payday Runway (`services/ml/runway.js`)

A forward-looking "safe to spend before your next income". Pure math, fully in-process. `detectIncomeCadence(incomeEvents, asOf)` reads the income rhythm (weekly / biweekly / monthly) from the median gap between income transactions and projects the next pay date; `computeRunway(input)` walks the balance forward day by day — subtracting a discretionary daily run-rate, subtracting recurring bills on their due dates (from `services/ml/recurring.js` `nextDue` + `typicalAmount`), and adding projected income on pay dates — to answer two questions: how much is safe to spend before the next payday, and the day the balance would go negative (the runway).

The `getRunway` controller supplies the balance, the income history (9 months), the upcoming recurring bills, and a discretionary run-rate computed as last-30-day expense minus the recurring monthly share (so bills are not double-counted). It caches per `tz` (invalidated by `cache.invalidateUser`).

Graceful degradation: when income cadence can't be read (variable / gig income — fewer than 3 events or an irregular schedule), it falls back to `mode:'rolling'` — a plain rolling runway with no payday horizon. Framed as a guide, not a guarantee (`note` is always returned). Covered by `test/ml.runway.test.js` (pure) and `test/runway.integration.test.js`.

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
NEXT_PUBLIC_SENTRY_DSN=<optional>
```

---

## Local development (without Docker)

### Prerequisites

| Tool | Min version | Required for |
|------|-------------|-------------|
| Bun | 1.3 | Backend runtime + package manager (`curl -fsSL https://bun.sh/install \| bash`) |
| Node.js | 22 | Frontend (Next.js still uses Node) |
| npm | 10 | Frontend |
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

### 2. Backend

```bash
cd finance-management
cp docker.env.template .env   # fill in values
bun install
bun run dev                   # bun --watch, http://localhost:3000
# or: make dev-be
```

Swagger UI (non-production): `http://localhost:3000/api-docs`

### 3. Frontend

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
| `finan-be` | `ghcr.io/.../finan-app-backend` | 3000 | **3001** | 512 MB |
| `finan-fe` | `ghcr.io/.../finan-app-frontend` | 3000 | **3000** | 256 MB |
| `finan-watchtower` | `containrrr/watchtower` | — | — | 64 MB |

MongoDB is capped at 512 MB WiredTiger cache (`--wiredTigerCacheSizeGB 0.5`) to prevent it consuming all RAM on a small VPS.

### Watchtower auto-deploy

Watchtower polls GHCR every 30 seconds. Only containers with label `com.centurylinklabs.watchtower.enable=true` are watched (backend, frontend). On a new `:latest` image, Watchtower pulls and recreates the container in-place.

---

## Backups & server migration

`scripts/backup.sh` produces a single tarball with: a live `mongodump --archive --gzip` of the `finan` database, a **redacted** `.env`, and the current `docker-compose.yml`. The tarball lands in `./backups/` (gitignored).

```bash
# On the host finan-app is running on:
./scripts/backup.sh
# → ./backups/finan-YYYYMMDD-HHMMSSZ.tar.gz

# Or pull from a remote server to your laptop in one shot:
./scripts/backup.sh --from root@vps.example:/root/finan-app
# Same output path, but on your laptop.
```

The script uses `mongodump`'s live archive stream — no container downtime needed. `.env` keys matching `SECRET|TOKEN|PASSWORD|KEY|CLIENT_ID|DSN` are replaced with `<redacted>` so the tarball is safe to `scp` around. Non-secret keys (`DB_URI`, URLs, `FROM_EMAIL`) are preserved.

### What's in the tarball

```
./env.redacted              ← secrets stripped, hand-fill on restore
./docker-compose.yml        ← snapshot of compose at backup time (useful for diffing)
./finan.archive.gz          ← mongodump --archive --gzip stream of the `finan` DB
```

The tarball is the only thing that needs to leave the host. Move it to encrypted storage (S3 with KMS, an encrypted external drive, your laptop's FileVault disk, etc.) — the redacted `.env` is safe, but the database dump still contains user PII and transaction history.

---

### Full migration runbook — moving to a new VPS

This is the end-to-end procedure to move finan-app from VPS A to VPS B. Plan for ~30 minutes of total downtime depending on your DNS TTL; the data window where new writes might be lost is the gap between the final backup and DNS cutover.

#### Phase A — On VPS A (the host that's currently live)

1. **Take a fresh backup just before the move:**
   ```bash
   ssh root@vpsA
   cd /root/finan-app
   ./scripts/backup.sh
   exit
   ```
2. **Pull the tarball to your laptop:**
   ```bash
   # From your laptop
   scp root@vpsA:/root/finan-app/backups/finan-*.tar.gz ~/finan-migration/
   ```
3. **(Optional) Stop accepting new writes** if data consistency matters more than uptime — `docker compose stop backend` on VPS A. Otherwise leave it running and accept that the few minutes of writes after the backup may be lost.

#### Phase B — On VPS B (the fresh target)

4. **Provision the VPS** with enough resources to match the [2 GB constraint](#docker-compose-full-stack) (mongo 1G + backend 512M + frontend 256M + watchtower 64M = ~2 GB stack ceiling). Ubuntu 22.04 LTS or 24.04 LTS works.
5. **Install Docker + Compose:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   # Compose is bundled with the modern docker-ce package — verify:
   docker compose version
   ```
6. **Authenticate to GHCR** so Docker (and Watchtower) can pull the private `ghcr.io/chud-lori/finan-app-*` images. Generate a GitHub PAT with `read:packages` scope at https://github.com/settings/tokens, then:
   ```bash
   echo "<your-pat>" | docker login ghcr.io -u <your-github-username> --password-stdin
   # Watchtower reads /root/.docker/config.json (the file `docker login` just wrote)
   # — the compose mount `/root/.docker/config.json:/config.json:ro` handles the rest.
   ```
7. **Clone the repo:**
   ```bash
   cd /root
   git clone https://github.com/chud-lori/finance-management.git finan-app
   cd finan-app
   ```
8. **Extract the backup and restore `.env`:**
   ```bash
   mkdir -p /tmp/finan-restore
   tar -xzf ~/finan-migration/finan-YYYYMMDD-HHMMSSZ.tar.gz -C /tmp/finan-restore
   cp /tmp/finan-restore/env.redacted .env
   # Hand-fill every <redacted> value:
   #   SECRET_TOKEN, RESEND_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
   #   NEXT_PUBLIC_GOOGLE_CLIENT_ID, SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, GEMINI_API_KEY (if used)
   nano .env
   ```
9. **Boot mongo only and wait for it to be healthy:**
   ```bash
   docker compose up -d mongo mongo-init
   until docker exec finan-mongo mongosh --quiet --eval 'db.adminCommand("ping")' >/dev/null 2>&1; do sleep 1; done
   ```
10. **Restore the database:**
    ```bash
    docker exec -i finan-mongo mongorestore --archive --gzip --drop --nsInclude='finan.*' \
      < /tmp/finan-restore/finan.archive.gz
    ```
    `--drop` is destructive — it wipes existing `finan.*` collections before restoring. On a fresh VPS there's nothing to drop, but if you're re-running the restore for any reason, double-check you're on the right host.
11. **Bring up the rest of the stack:**
    ```bash
    docker compose up -d
    ```
12. **Smoke test locally on the VPS** (before touching DNS):
    ```bash
    curl -s http://localhost:3001/ -w '\n%{http_code}\n'        # backend health
    curl -s http://localhost:3000/ -o /dev/null -w '%{http_code}\n'  # frontend
    docker compose ps                                          # all services healthy
    docker compose logs --tail 50 backend                      # no errors
    ```

#### Phase C — DNS cutover

13. **Update DNS A-record(s)** at your registrar / Cloudflare to point `finance.lori.my.id` to VPS B's IP. If you use Cloudflare's proxy (orange cloud), the change propagates in seconds. If using raw DNS, propagation depends on your TTL — set TTL to 60s a day before the move to shorten the window.
14. **Verify from outside the VPS:**
    ```bash
    # From your laptop
    curl -s https://finance.lori.my.id/api/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"identifier":"nobody","password":"wrong"}'
    # → {"status":0,"message":"Invalid credentials"} from the NEW server
    ```
    Confirm the response includes a recently-added user's name by logging in as yourself.
15. **Watch Sentry** for ~30 minutes for any new error spikes — `@sentry/node` will tag events with the new server's hostname so you can tell old vs new.

#### Phase D — Decommission VPS A

16. Once VPS B has been serving traffic cleanly for 24 hours **and** you have a second backup on your laptop, stop services on VPS A: `docker compose down` then `docker volume rm finan-app_mongo_data` if you want to wipe the data. Keep the VPS itself for another week as an emergency rollback before destroying it.

### Things the migration **doesn't** handle automatically

- **Frontend env-var changes**: `NEXT_PUBLIC_API_URL` is baked into the frontend image at GitHub Actions build time (see `cd.yml` line ~110). If the new VPS uses a *different* domain, update the GitHub Actions variable `NEXT_PUBLIC_API_URL` and push any small change to `finance-management-fe/` to trigger a frontend rebuild. Same-domain migrations don't need this.
- **Cloudflare WAF rules**: per-zone, follow the domain — no action needed.
- **TLS certificates**: terminated at Cloudflare, also follows the domain.
- **GHCR rate limits**: anonymous pulls are limited; the `docker login` in step 6 raises your quota.
- **Watchtower's docker config**: the file at `/root/.docker/config.json` is created by `docker login` (step 6). If it's missing, Watchtower silently fails to pull and you'll never get auto-deploys.

---

## Testing

### Backend (Mocha + Chai)

```bash
cd finance-management

bun run test            # all suites (mocha runs via `bun x mocha` under the hood)
bun run test:auth
bun run test:transaction
bun run test:goal
bun run test:e2e
bun run test:app
```

| File | What it covers |
|------|---------------|
| `app.integration.test.js` | CORS, security headers, 404 handling, Swagger availability |
| `auth.integration.test.js` | Register, login, JWT, tokenVersion, duplicate prevention |
| `transaction.integration.test.js` | CRUD, balance updates, categories, CSV import, analytics |
| `goal.integration.test.js` | Goal creation, savings calculations, multi-goal |
| `end-to-end.test.js` | Full user journey, multi-user data isolation, error recovery |

Tests run against `mongodb-memory-server` — no real DB connection required. Rate limiting is disabled in `NODE_ENV=test`.

### Frontend (Vitest unit + Playwright E2E)

Pure frontend logic (no DOM) is unit-tested with Vitest — colocated `*.test.js`
next to the module. Config: `vitest.config.mjs` (node env, `@/` alias mirrors
jsconfig). CI runs `npm run test` on any `finance-management-fe/**` change.

```bash
cd finance-management-fe

npm run test              # Vitest unit tests (run once)
npm run test:watch        # Vitest watch mode

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
| DELETE | `/api/auth/account` | 3/min | ✓ | Delete account and **every** user-scoped document: transactions, categories, goals, budgets, preferences, snapshots, ML insights, password-reset and email-verification tokens, balance and sessions. Any new user-scoped collection must be added to `userScopedModels` in `deleteAccount`, or the "all data deleted" response becomes a false claim |
| POST | `/api/auth/forgot-password` | 5/min per IP | — | Send password reset email (always returns 200) |
| POST | `/api/auth/reset-password` | 10/min per IP | — | Validate token + set new password (deletes all sessions) |

### Transactions

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| POST | `/api/transaction` | 30/min | ✓ | Add transaction; body: `{ description, amount, category, type, time, transaction_timezone, currency? }` |
| GET | `/api/transaction/:type?` | — | ✓ | List transactions; query: `?month=YYYY-MM&category=X&search=X&page=N&limit=N&type=income\|expense` |
| PATCH | `/api/transaction/:id` | 30/min | ✓ | Update `description`, `category`, `amount` and/or `time` (at least one required; optional `transaction_timezone` alongside `time`). An `amount` change adjusts Balance by the signed difference inside the same atomic transaction; a `time` change can move the row to another month, so both the old and new month's snapshot and ML-insight cache are refreshed. `type` and `currency` are immutable — delete and re-add instead |
| DELETE | `/api/transaction/:id` | — | ✓ | Delete transaction; balance updated atomically |
| GET | `/api/transaction/expense` | 60/min | ✓ | Total expense summary (all time) |
| GET | `/api/transaction/analytics` | 60/min | ✓ | Monthly/yearly analytics; query: `?year=YYYY&month=M` |
| GET | `/api/transaction/anomalies` | 60/min | ✓ | Rule-based anomaly detection (z-score on rolling average) |
| GET | `/api/transaction/explain` | 60/min | ✓ | Top-5 category breakdown with `pct`, pace-corrected `delta`, and `volatility`/`cv` (fixed/semi/flexible/unknown) per category — see Category volatility section |
| GET | `/api/transaction/recurring` | 60/min | ✓ | Detected subscriptions/bills: `recurring[]` (merchant, cadence, typicalAmount, monthlyEquivalent, nextDue, confidence), `monthlyTotal`, `count`, and `alerts[]` (missing bill / price jump). Only groups clearing the category-blocklist + amount-stability (CV ≤ 0.12, or ≤ 0.35 for flagged utility categories) + monthly-or-longer-precise-cadence gate appear here or raise alerts. Stable sub-monthly repeats come back separately in `frequent[]` / `frequentMonthlyTotal` — no due dates, never alerted. 13-month window; yearly cadences not detected |
| GET | `/api/transaction/recap` | 30/min | ✓ | Money Recap — rule-based, fully in-process monthly "wrapped". Query: `?month=YYYY-MM` (defaults to the most recent complete month). Returns `{ available, month, monthLabel, narrative[], tiles[] }` stitched from the monthly Snapshot (this month vs prior), Financial Health score, streak, net-worth delta, ML anomaly count and top category mover. `available:false` with a `reason` until there is ≥1 full prior month. Narrative lines are currency-free; raw amounts ride only on `tiles` for the FE to format |
| GET | `/api/transaction/runway` | 30/min | ✓ | Payday Runway — forward "safe to spend before next income". Infers income cadence from income history, projects the balance to the next expected payday using upcoming recurring bills + a discretionary run-rate, and returns `{ mode:'payday'\|'rolling', nextIncomeDate, daysUntilIncome, expectedIncome, safeToSpend, safeToSpendPerDay, billsBeforeIncome[], billsTotal, runwayDays, runwayDate, status, note }`. Degrades to a rolling-30-day runway when income cadence is unclear. A guide, not a guarantee |
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
| GET | `/api/gamification/summary` | 30/min | ✓ | Streak count, budget win, goal ring progress, and `health` — the Financial Health Score (0–100 + band + per-pillar breakdown) |

### Recommendations (smart nudges)

| Method | Path | Rate limit | Auth | Description |
|--------|------|-----------|------|-------------|
| GET | `/api/recommendations` | 20/min | ✓ | 1–5 personalised rule-based nudges; query: `?tz=IANA` |
| POST | `/api/recommendations/allocate` | 30/min | ✓ | one-tap allocation of a surplus/windfall into a goal; body: `{ source, sourceKey, goalId, amount }` |
| GET | `/api/recommendations/windfall` | 30/min | ✓ | detect a recent unusually large income (THR/bonus) + active goals to split into; query: `?tz=IANA` |
| GET | `/api/recommendations/zakat` | 30/min | ✓ | zakat-maal estimate from net-worth + social-group giving YTD; query: `?tz=IANA`, optional `?nisab=` |

**Every nudge CTA must lead to a persistent action.** A nudge is only suppressed by
state stored in the database, so its CTA has to be able to create that state — a link
into a pure calculator is a dead end and the nudge reappears forever. The
emergency-fund nudge is the reference case: it is suppressed by any `Goal` whose
description matches `/emergency/i` (achieved or not — hence the goal query is
unfiltered on `achieve`), and its CTA carries `?tool=emergency&monthly=&saved=` so the
Emergency Fund tool prefills and offers a one-click "Track this as a goal".

**Surplus-sweep nudge (`surplus_sweep`).** When the last completed month ran a
surplus (`Snapshot.income − Snapshot.expense > 0`) and the user has an unachieved
goal, the nudge invites them to earmark part of that surplus to a goal. Its CTA
carries `?tool=goal&sweep=YYYY-MM&amount=N`, opening the Savings Goal tool with a
one-tap "sweep here" button per active goal. Tapping it calls `POST
/api/recommendations/allocate` with `source: 'surplus'`, `sourceKey: 'YYYY-MM'`,
which (a) increments that goal's **own** `savedAmount` via an atomic `$inc` — never
a shared pool — and (b) writes an `Allocation` row. The nudge query suppresses
itself the moment an `Allocation` exists for `(user, source: 'surplus', sourceKey:
that month)`. Copy never claims money was moved anywhere real — it is cash-flow
surplus, a suggestion, and the amount is carried only in CTA params so the FE
formats it in the user's currency (the server never embeds a currency figure).

The same `allocate` endpoint backs the windfall planner with `source: 'windfall'`
and `sourceKey` = the large income transaction's id (see the Windfall section).

**Windfall planner (`GET /api/recommendations/windfall`).** `helpers/windfall.js`
`detectWindfall()` finds the largest income in the last 45 days and calls it a
windfall when it is ≥ 1.8× the median of the user's income over the last 365 days
(median is robust — a single windfall barely moves it). The endpoint returns the
detected windfall (with `allocated` / `remaining` / `handled` derived from existing
`Allocation` rows for that transaction) plus the user's active goals. The FE
Windfall Planner tool pre-fills a suggested split (`lib/windfallSplit.js`, fill
goals oldest-first up to each goal's remaining need) and each "Allocate" button
calls `/allocate` with `source: 'windfall'`. The `windfall_<txnId>` dashboard nudge
appears when a windfall is detected and the user has an active goal, and suppresses
itself once any `Allocation` exists for that transaction id. Emergency fund and
debt payoff are not special-cased — they are just goals; there is no debt-account
model, so a debt-payoff target is a user-created goal.

**Zakat estimator (`GET /api/recommendations/zakat`).** `helpers/zakat.js`
`estimateZakat()` returns 2.5% of a zakatable base = liquid assets
(`cash + investment + receivable` holding types) − short-term debts
(`credit_card + bnpl + payable + loan`), with illiquid personal-use assets
(property, vehicle, mortgage) excluded. Giving YTD sums this year's **expense**
transactions in categories grouped `social` (zakat / donation / sharing). Nisab is
an optional `?nisab=` input — below it, `zakatDue` is 0 (`meetsNisab: false`). It is
an **estimate, not a fatwa** (no haul tracking); the FE labels it as such and lets
any user hide the tool. The zakatable-asset and deductible-liability type lists live
in `helpers/zakat.js` and are keyed to the `NetWorth` holding `type` enum.

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

**`ci.yml`** — runs on pull requests to `main`. Uses `dorny/paths-filter` to detect which subtree changed. Backend tests (`bun run test`) only run when `finance-management/**` changed; frontend build check only runs when `finance-management-fe/**` changed. CI installs Bun via `oven-sh/setup-bun@v1`.

**`cd.yml`** — runs on push to `main`. Same path filtering — only rebuilds changed images. Backend and frontend build jobs run in parallel. Images tagged `:latest` pushed to GHCR. Watchtower on the server polls GHCR every 30s and redeploys automatically.

**Important:** Changing `docker-compose.yml` or other root-level files does **not** trigger an image rebuild — those changes require a manual `git pull` + `docker compose up -d` on the server.

---

## Error monitoring

Two separate Sentry projects:

| Service | SDK | DSN env var | When applied |
|---------|-----|-------------|--------------|
| Backend (Express) | `@sentry/node` | `SENTRY_DSN` | Runtime — add to `.env`, recreate container |
| Frontend (Next.js) | `@sentry/nextjs` | `NEXT_PUBLIC_SENTRY_DSN` | **Build-time** — set as GitHub Actions variable, triggers on next image build |

**Backend:** `Sentry.init()` runs before all other imports in `app.js`, guarded by `NODE_ENV === 'production' && SENTRY_DSN`. `Sentry.setupExpressErrorHandler(app)` registered after all routes. `uncaughtException` also calls `Sentry.captureException()`. Bun runtime is supported by `@sentry/node` via its Node compatibility layer — verify AsyncLocalStorage-based request context still tags errors with `req.user.id` after any future SDK upgrade.

**Frontend:** `sentry.client.config.js` initialises Session Replay (5% of sessions, 100% on error). `instrumentation.js` initialises the server SDK via the Next.js instrumentation hook.

---

## Contributing

1. Fork the repo and create a branch from `main`.
2. Run `bun run test` inside `finance-management/` — all tests must pass.
3. Run `npm run test:e2e` inside `finance-management-fe/` against a running instance.
4. Keep commits focused — one logical change per commit.
5. Update this file if you add new routes, models, environment variables, or change service topology.
