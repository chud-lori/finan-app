# Developer Guide

Technical reference for setting up, running, and deploying Lori Finance.

---

## Repository structure

```
finan-app/                          ← monorepo root
├── docker-compose.yml              ← full-stack deployment
├── .env.example                    ← root environment template
├── Makefile                        ← dev and ops shortcuts
├── README.md                       ← product overview
├── DEVELOPER.md                    ← this file
│
├── finance-management/             ← Backend (Express.js)
│   ├── app.js
│   ├── Dockerfile
│   ├── docker.env.template         ← BE-only env template
│   ├── controllers/
│   ├── routers/
│   ├── models/
│   ├── dtos/
│   ├── middleware/
│   ├── helpers/
│   ├── config/
│   └── test/
│
└── finance-management-fe/          ← Frontend (Next.js)
    ├── Dockerfile
    ├── app/                        ← Next.js App Router pages
    │   ├── page.js                 ← Dashboard
    │   ├── login/page.js
    │   ├── add/page.js
    │   ├── range/page.js
    │   ├── recommendation/page.js
    │   └── import/page.js
    ├── components/
    │   ├── Navbar.js
    │   └── AuthGuard.js
    └── lib/
        ├── api.js                  ← API fetch helpers
        └── format.js               ← IDR formatter, date formatter
```

Each subdirectory (`finance-management/`, `finance-management-fe/`) is also a standalone git repository and can be cloned, built, and deployed independently.

---

## Prerequisites

| Tool | Min version | Required for |
|------|-------------|-------------|
| Node.js | 22 | Local dev |
| npm | 10 | Local dev |
| MongoDB | 7 | Local dev (BE) |
| Docker | 24 | Container deployment |
| Docker Compose | v2 | Container deployment |
| make | any | Makefile shortcuts (optional) |

---

## Environment variables

### Root `.env` (used by `docker compose`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_TOKEN` | — **required** | JWT signing secret |
| `DB_URI` | `mongodb://mongo:27017/finan` | MongoDB connection string |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend URL as seen by the browser |

Copy `.env.example` → `.env` and fill in `SECRET_TOKEN` before running compose.

### Backend `.env` (local dev only, inside `finance-management/`)

Create `finance-management/.env`:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_URI=mongodb://localhost:27017/finan
SECRET_TOKEN=your_jwt_secret_here
```

### Frontend `.env.local` (local dev only, inside `finance-management-fe/`)

Create `finance-management-fe/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

> **Note:** When running locally without Docker, the backend runs on port `3000` and the frontend on `3001` (or the next available port). When running via Docker Compose, the backend is mapped to host port `3001` and the frontend to `3000`.

---

## Running locally (without Docker)

### 1. Start MongoDB

```bash
mongod --dbpath /data/db
# or via Homebrew
brew services start mongodb-community
```

### 2. Backend

```bash
cd finance-management
cp docker.env.template .env   # then fill in values
npm install
npm run dev                   # starts on http://localhost:3000
```

Seed the categories once after first start:

```bash
# get a token first by logging in, then:
curl -X POST http://localhost:3000/api/transaction/category \
  -H "Authorization: Bearer <token>"
```

API docs are at http://localhost:3000/api-docs (non-production only).

### 3. Frontend

```bash
cd finance-management-fe
# create .env.local with NEXT_PUBLIC_API_URL=http://localhost:3000
npm install
npm run dev                   # starts on http://localhost:3001
```

Or use the Makefile from the root:

```bash
make dev          # starts both in background (requires tmux or two terminals)
make dev-be       # backend only
make dev-fe       # frontend only
```

---

## Running with Docker Compose (full stack)

```bash
# from finan-app/ root
cp .env.example .env
# edit .env — set SECRET_TOKEN

make up           # build + start all services detached
make logs         # tail all logs
make down         # stop everything
```

Or without Make:

```bash
docker compose up --build -d
docker compose logs -f
docker compose down
```

Services and ports:

| Container | Internal port | Host port |
|-----------|--------------|-----------|
| `finan-mongo` | 27017 | — (internal) |
| `finan-be` | 3000 | **3001** |
| `finan-fe` | 3000 | **3000** |

Start order enforced by healthchecks: `mongo` → `backend` → `frontend`.

---

## Deploying separately

Both services have their own `Dockerfile` and can be deployed to any platform that runs containers.

### Backend only

```bash
cd finance-management

docker build -t finan-be .

docker run -d \
  -p 3001:3000 \
  -e NODE_ENV=production \
  -e DB_URI=mongodb://<host>:27017/finan \
  -e SECRET_TOKEN=<secret> \
  finan-be
```

The backend has no dependency on the frontend. Point it at any MongoDB instance (Atlas, self-hosted, etc.).

### Frontend only

The frontend build bakes `NEXT_PUBLIC_API_URL` into the bundle at compile time. Pass it as a build argument:

```bash
cd finance-management-fe

docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com \
  -t finan-fe .

docker run -d -p 3000:3000 finan-fe
```

The frontend has no runtime dependency on the backend container — it just needs the browser to be able to reach `NEXT_PUBLIC_API_URL`.

### Platform-specific notes

**Vercel / Netlify (frontend)**

Set `NEXT_PUBLIC_API_URL` as an environment variable in the platform dashboard, then trigger a redeploy (Next.js bakes it in at build time).

**Railway / Render / Fly.io (backend)**

Set the three env vars (`NODE_ENV`, `DB_URI`, `SECRET_TOKEN`) in the platform's environment config. The backend listens on `0.0.0.0:3000` and respects a `PORT` override.

**MongoDB Atlas**

Replace `DB_URI` with your Atlas connection string:
```
mongodb+srv://<user>:<password>@cluster.mongodb.net/finan?retryWrites=true&w=majority
```

---

## CSV import

The `POST /api/transaction/import/csv` endpoint accepts `multipart/form-data` with a `file` field.

Column name mapping (case-insensitive, first match wins):

| Field | Accepted column names |
|-------|-----------------------|
| Description | `Title`, `Description` |
| Amount | `Amount` — plain number or `Rp1,000,000` |
| Type | `Type` — `income` / `outcome` |
| Category | `Category` — must match an existing category |
| DateTime | `Timestamp`, `Date`, `Time` |
| Timezone | `Timezone` — IANA id, defaults to `Asia/Jakarta` |

Accepted date formats: `M/D/YYYY H:mm:ss` · `YYYY-MM-DD HH:mm:ss` · `D/M/YYYY H:mm:ss` · `YYYY-MM-DD` · ISO 8601 · lenient fallback

The response includes per-row error details so partial imports are visible:

```json
{
  "data": {
    "total": 50,
    "success": 48,
    "failed": 2,
    "errors": ["Row 12: category \"Miscellaneous\" not found", "..."]
  }
}
```

---

## API reference

Swagger UI is available at `/api-docs` when `NODE_ENV` is not `production`.

Core endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/check` | ✓ | Verify token |
| GET | `/api/transaction` | ✓ | All transactions (filter: `?month=YYYY-MM&category=X`) |
| POST | `/api/transaction` | ✓ | Add transaction |
| DELETE | `/api/transaction/:id` | ✓ | Delete transaction |
| GET | `/api/transaction/range/:start/:end` | ✓ | Range summary |
| GET | `/api/transaction/recommendation/:monthly/:spend` | ✓ | Budget advice |
| POST | `/api/transaction/import/csv` | ✓ | Bulk CSV import |
| GET | `/api/transaction/category` | — | List categories |
| POST | `/api/transaction/category` | ✓ | Seed categories |
| POST | `/api/goal/add` | ✓ | Add saving goal |
| GET | `/api/goal/goals` | ✓ | List goals |

---

## Testing (backend)

```bash
cd finance-management
npm test              # all suites
npm run test:auth
npm run test:transaction
npm run test:goal
npm run test:e2e
```

Tests use an in-memory MongoDB instance — no real database required.

---

## Git branches

| Repo | Branch | Purpose |
|------|--------|---------|
| `finance-management` | `main` | Stable |
| `finance-management` | `feature/csv-import` | CSV import endpoint + multi-format date parsing |
| `finance-management-fe` | `main` | Stable (original vanilla JS) |
| `finance-management-fe` | `feature/nextjs-rewrite` | Next.js + Tailwind rewrite |
| Root `finan-app` | `main` | Docker Compose, docs, Makefile |

---

## Makefile reference

```
make help         show all targets
make setup        copy .env.example → .env if missing

make dev-be       start backend locally (nodemon)
make dev-fe       start frontend locally (next dev)

make build        docker compose build
make up           docker compose up -d (build if needed)
make down         docker compose down
make restart      down + up
make restart-be   restart only the backend container
make restart-fe   restart only the frontend container

make logs         tail all container logs
make logs-be      tail backend logs
make logs-fe      tail frontend logs

make test         run backend test suite
make seed         seed categories (requires TOKEN=<jwt>)
make clean        stop containers, remove volumes (destructive)
```
