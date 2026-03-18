# Lori Finance

Personal finance tracker for recording income, tracking spending by category, and staying on top of your monthly budget.

---

## Features

- **Dashboard** — See your current balance alongside monthly income and outcome totals at a glance
- **Transaction log** — Browse all transactions filtered by month, with timestamps and categories
- **Add transaction** — Log income or outcome with description, amount, category, and datetime
- **Date range report** — Query any date range and get a summary of income vs. outcome
- **Budget recommendation** — Enter your monthly budget and a planned spend; the app tells you whether you can afford it based on your last 7 days of spending
- **CSV import** — Export any sheet from your spreadsheet as CSV and upload it to bulk-import historical transactions

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB |
| Auth | JWT (Bearer token) |
| Container | Docker, Docker Compose |

---

## Quick start (Docker)

```bash
git clone <repo-url>
cd finan-app

cp .env.example .env
# edit .env — set SECRET_TOKEN at minimum

docker compose up --build
```

| Service | URL |
|---------|-----|
| App (frontend) | http://localhost:3000 |
| API (backend) | http://localhost:3001 |
| API docs (Swagger) | http://localhost:3001/api-docs |

Register an account at `/login`, then seed the transaction categories from the Swagger UI (`POST /api/transaction/category`) or via the Makefile:

```bash
make seed TOKEN=<your_jwt_token>
```

---

## CSV import format

Export any sheet from your spreadsheet (Excel, Google Sheets) as CSV. The importer accepts these column names (case-insensitive):

| Column | Required | Example |
|--------|----------|---------|
| `Title` or `Description` | Yes | Grocery shopping |
| `Amount` | Yes | `250000` or `Rp250,000` |
| `Type` | Yes | `income` or `outcome` |
| `Category` | Yes | Food |
| `Timestamp`, `Date`, or `Time` | Yes | `1/15/2026 14:30:00` |
| `Timezone` | No | `Asia/Jakarta` (default) |

Supported date formats: `M/D/YYYY H:mm:ss` · `YYYY-MM-DD HH:mm:ss` · ISO 8601

---

## Categories

Food · Entertainment · Personal Care · Living Budget · Monthly Budget · Household · Transport · Fashion · Gadget · Grocery · Health · Bill · Self Improve · Sharing

---

## License

ISC
