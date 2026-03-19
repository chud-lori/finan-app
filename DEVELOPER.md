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
│   ├── app.js                      ← Express app entry point
│   ├── Dockerfile
│   ├── docker.env.template
│   ├── controllers/
│   │   ├── auth.js                 ← register, login, check, deleteAccount
│   │   ├── transaction.js          ← CRUD, analytics, insights, import
│   │   └── goal.js
│   ├── routers/
│   │   ├── auth.js
│   │   ├── transaction.js
│   │   └── goal.js
│   ├── models/
│   │   ├── user.model.js
│   │   ├── balance.model.js
│   │   ├── transaction.model.js    ← type enum: income | expense
│   │   ├── category.model.js
│   │   └── goal.model.js
│   ├── dtos/
│   │   ├── base.dto.js
│   │   ├── transaction.dto.js
│   │   ├── auth.dto.js
│   │   └── goal.dto.js
│   ├── middleware/
│   │   └── auth.middleware.js      ← JWT verification
│   ├── helpers/
│   │   └── validator.js            ← express-validator rules
│   ├── config/
│   │   └── db.js
│   └── test/
│       ├── setup.js                ← in-memory MongoDB setup
│       ├── app.integration.test.js
│       ├── auth.integration.test.js
│       ├── transaction.integration.test.js
│       ├── goal.integration.test.js
│       └── end-to-end.test.js
│
└── finance-management-fe/          ← Frontend (Next.js 15 + Tailwind CSS v4)
    ├── Dockerfile
    ├── app/
    │   ├── layout.js               ← root layout, theme script, color-scheme meta
    │   ├── page.js                 ← Dashboard
    │   ├── login/page.js
    │   ├── register/page.js
    │   ├── add/page.js             ← Add transaction (income / expense)
    │   ├── analytics/page.js       ← Monthly / yearly charts
    │   ├── range/page.js           ← Date range report
    │   ├── insights/page.js        ← Anomaly detection, explainability, time-to-zero
    │   ├── import/page.js          ← CSV bulk import with animated progress
    │   ├── recommendation/page.js  ← Budget affordability check
    │   ├── settings/page.js        ← Theme toggle, delete account
    │   └── auth/page.js
    ├── components/
    │   ├── Navbar.js
    │   ├── AuthGuard.js            ← Redirect if not authenticated
    │   ├── Skeleton.js             ← Skeleton loading components
    │   ├── DateTimePicker.js
    │   ├── ThemeContext.js         ← Dark/light mode provider
    │   ├── Footer.js
    │   └── charts/
    │       ├── DonutChart.js
    │       ├── HBarChart.js
    │       └── VBarChart.js
    └── lib/
        ├── api.js                  ← Typed fetch wrappers for all endpoints
        └── format.js               ← IDR formatter, date formatter, toTitleCase
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

Copy `.env.example` → `.env` and fill in `SECRET_TOKEN` before running compose:

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_TOKEN` | — **required** | JWT signing secret (any long random string) |
| `DB_URI` | `mongodb://mongo:27017/finan` | MongoDB connection string |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend URL as seen by the browser |

### Backend `.env` (local dev, inside `finance-management/`)

Create `finance-management/.env`:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_URI=mongodb://localhost:27017/finan
SECRET_TOKEN=your_jwt_secret_here
```

### Frontend `.env.local` (local dev, inside `finance-management-fe/`)

Create `finance-management-fe/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

> When running locally without Docker, the backend runs on port `3000` and the frontend on `3001`. When running via Docker Compose, the backend maps to host port `3001` and the frontend to `3000`.

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

Or use the Makefile shortcuts from the repo root:

```bash
make dev-be       # backend only
make dev-fe       # frontend only
```

---

## Docker Compose (full stack)

```bash
# from finan-app/ root
cp .env.example .env
# edit .env — set SECRET_TOKEN

make up           # build + start all services detached
make logs         # tail all container logs
make down         # stop everything
```

Or without Make:

```bash
docker compose up --build -d
docker compose logs -f
docker compose down
```

| Container | Internal port | Host port |
|-----------|--------------|-----------|
| `finan-mongo` | 27017 | — (internal only) |
| `finan-be` | 3000 | **3001** |
| `finan-fe` | 3000 | **3000** |

Start order is enforced by healthchecks: `mongo` → `backend` → `frontend`.

---

## Testing

Tests run against an in-memory MongoDB instance (no real DB required).

```bash
cd finance-management

npm test               # all suites (60 tests)
npm run test:auth      # auth tests only
npm run test:transaction
npm run test:goal
npm run test:e2e
npm run test:app
```

Test suites:

| File | What it covers |
|------|---------------|
| `app.integration.test.js` | CORS, security headers, 404 handling, Swagger |
| `auth.integration.test.js` | Register, login, JWT validation, duplicate prevention |
| `transaction.integration.test.js` | CRUD, balance updates, categories, recommendation, CSV |
| `goal.integration.test.js` | Goal creation, savings calculations, progress |
| `end-to-end.test.js` | Full user journey, multi-user isolation, error recovery |

All tests are independent — each test starts with a clean database state.

---

## API reference

Swagger UI is available at `/api-docs` when `NODE_ENV !== production`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account, returns user + initial balance |
| POST | `/api/auth/login` | — | Returns JWT |
| GET | `/api/auth/check` | ✓ | Verify token is valid |
| DELETE | `/api/auth/account` | ✓ | Delete account and all associated data |

### Transactions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/transaction` | ✓ | Add transaction (income or expense) |
| GET | `/api/transaction` | ✓ | All transactions (`?month=YYYY-MM&category=X`) |
| GET | `/api/transaction/income` | ✓ | Income transactions only |
| GET | `/api/transaction/expense` | ✓ | Expense transactions + total |
| DELETE | `/api/transaction/:id` | ✓ | Delete transaction, balance is updated |
| GET | `/api/transaction/range/:start/:end` | ✓ | Transactions in date range with summary |
| GET | `/api/transaction/date/:date` | ✓ | Transactions on a specific date |
| GET | `/api/transaction/recommendation/:monthly/:spend` | ✓ | Budget affordability check |
| POST | `/api/transaction/import/csv` | ✓ | Bulk CSV import (`multipart/form-data`, field: `file`) |
| GET | `/api/transaction/category` | ✓ | List categories (`?search=X`) |
| POST | `/api/transaction/category` | ✓ | Seed default categories |
| GET | `/api/transaction/anomalies` | ✓ | Transactions flagged as anomalies |
| GET | `/api/transaction/explain` | ✓ | Spending explainability breakdown |
| GET | `/api/transaction/time-to-zero` | ✓ | Runway until balance reaches zero |
| GET | `/api/transaction/analytics` | ✓ | Monthly/yearly analytics (`?year=YYYY&month=M`) |

### Goals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/goal/add` | ✓ | Create a savings goal |
| GET | `/api/goal/goals` | ✓ | List all goals |
| GET | `/api/goal/goal/:id` | ✓ | Goal detail with savings projection |

---

## Architecture notes

### Transaction types

Only two valid types: `income` and `expense`. Income transactions do not require a category (it is automatically set to `"income"`). Expense transactions must reference a category that exists in the `categories` collection.

### Balance

Each user has exactly one `Balance` document. It is updated atomically on every transaction create or delete. The running balance can go negative (expenses can exceed income).

### CSV import

The importer normalizes type values: anything that is not exactly `"income"` is treated as `"expense"`. This means `expense`, `outcome`, `debit`, or any other value all import as expenses.

If a category in the CSV does not exist, the importer creates it automatically. Rows that fail validation are skipped and reported in the response `errors` array — the rest still import.

### DTOs

All request data passes through a DTO that validates and normalizes before reaching the controller. All responses use `BaseResponseDTO.success(message, data)` or `BaseResponseDTO.error(message)` for a consistent shape:

```json
{ "status": 1, "message": "...", "data": { ... } }
{ "status": 0, "message": "...", "data": null }
```

### Dark mode

Theme preference is stored in `localStorage`. The root layout injects a blocking inline script in `<head>` to apply the `.dark` class before first paint, preventing flash. `ThemeContext` manages the runtime toggle and keeps `<meta name="color-scheme">` in sync for browser-native elements.

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
  finan-be
```

**Railway / Render / Fly.io:** set `NODE_ENV`, `DB_URI`, `SECRET_TOKEN` in the platform's environment config. The server listens on `0.0.0.0:3000` and respects a `PORT` override.

**MongoDB Atlas:** replace `DB_URI` with your Atlas connection string:
```
mongodb+srv://<user>:<password>@cluster.mongodb.net/finan?retryWrites=true&w=majority
```

### Frontend

`NEXT_PUBLIC_API_URL` is baked into the bundle at build time:

```bash
cd finance-management-fe
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com \
  -t finan-fe .
docker run -d -p 3000:3000 finan-fe
```

**Vercel / Netlify:** set `NEXT_PUBLIC_API_URL` as an environment variable in the dashboard and trigger a redeploy.

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
2. Run `npm test` inside `finance-management/` before opening a PR — all 60 tests must pass.
3. Keep commits focused. One logical change per commit.
4. Update this file if you add new routes, environment variables, or change the repo structure.
