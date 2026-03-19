# Finan App

A personal finance tracker for recording income, monitoring spending by category, and staying on top of your monthly budget — all from a clean, mobile-friendly web app.

---

## What it does

Finan gives you a single place to understand your money:

- **Know your balance at a glance** — the dashboard shows your running balance, income this month, and spending this month side by side.
- **Log every transaction** — record income or an expense with a description, amount, category, and exact datetime.
- **Browse by date range** — pull up any period and see a breakdown of every transaction alongside the income/expense totals for that window.
- **Track spending categories** — every expense goes into a category (Food, Transport, Health, etc.) so you can see where money actually goes.
- **Get a budget recommendation** — enter your monthly budget and a planned purchase; the app projects your spending trajectory and tells you whether you can afford it.
- **Import from a spreadsheet** — export your bank or budget sheet as CSV and bulk-import months of history in one upload.
- **Set savings goals** — create a goal (e.g. buy a laptop for Rp 10,000,000), and the app calculates how long it will take based on your 20% savings rate.
- **Spot anomalies** — the Insights page flags transactions that are unusually large compared to your baseline.
- **Understand your spending** — the "Why You're Spending" breakdown explains which categories are driving your costs and by how much.
- **See your runway** — Time-to-Zero tells you roughly when your balance hits zero if current spending continues.
- **Analytics deep-dive** — monthly and yearly charts show income vs. expense trends and a category-level breakdown with share percentages.
- **Dark mode** — follows your system preference; toggle manually from Settings.

---

## Features at a glance

| Feature | Description |
|---------|-------------|
| Dashboard | Balance, monthly income, monthly expense summary |
| Transaction log | Filterable list by month and category |
| Add transaction | Income or expense with category, amount, and datetime |
| Date range report | Custom start/end date with income/expense summary |
| Budget recommendation | Affordability check based on last 7-day burn rate |
| CSV import | Bulk-import from Excel or Google Sheets export |
| Savings goals | Price targets with progress and time-to-achieve |
| Insights | Anomaly detection, spending explainability, time-to-zero runway |
| Analytics | Monthly/yearly charts, category breakdown, savings rate |
| Settings | Theme toggle, delete account |

---

## CSV import format

Export any sheet from your spreadsheet (Excel, Google Sheets) as CSV. The importer accepts these columns (column names are case-insensitive):

| Column | Required | Accepted names | Example |
|--------|----------|---------------|---------|
| Description | Yes | `Title`, `Description` | Grocery shopping |
| Amount | Yes | `Amount` | `250000` or `Rp250,000` |
| Type | Yes | `Type` | `income` or `expense` |
| Category | Yes | `Category` | Food |
| Date/Time | Yes | `Timestamp`, `Date`, `Time` | `1/15/2026 14:30:00` |
| Timezone | No | `Timezone` | `Asia/Jakarta` (default) |

Supported date formats: `M/D/YYYY H:mm:ss` · `YYYY-MM-DD HH:mm:ss` · `D/M/YYYY H:mm:ss` · ISO 8601

For the Type column, anything that isn't `income` is treated as an expense — so `expense`, `outcome`, `debit`, etc. all work.

---

## Expense categories

The app ships with a default set of categories you can seed with one click (or one API call):

Food · Transport · Entertainment · Personal Care · Living Budget · Monthly Budget · Household · Fashion · Gadget · Grocery · Health · Bill · Self Improve · Sharing

You can also type any custom category when adding a transaction and it will be created automatically.

---

## Getting started

The fastest way to run Finan is with Docker Compose:

```bash
git clone <repo-url>
cd finan-app

cp .env.example .env
# Open .env and set SECRET_TOKEN to any long random string

docker compose up --build
```

Then open your browser:

| Page | URL |
|------|-----|
| App | http://localhost:3000 |
| API | http://localhost:3001 |

Register an account at `/login`, then seed the default categories from Settings or via the API.

> For local development without Docker, see [DEVELOPER.md](./DEVELOPER.md).

---

## License

ISC
