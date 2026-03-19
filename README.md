# Finan App

A personal finance tracker for recording income, monitoring spending by category, and staying on top of your monthly budget — all from a clean, mobile-friendly web app.

## Try it live

**[finance.lori.my.id](https://finance.lori.my.id/)**

Sign up for a free account and start tracking in under a minute. No credit card required.

---

## What it does

- **Know your balance at a glance** — running balance, monthly income, and monthly spending side by side
- **Log every transaction** — income or expense with description, amount, category, and exact datetime
- **Smart category suggestions** — predicts your most likely category based on time of day and past habits
- **Analytics** — monthly and yearly charts with category breakdown, savings rate, and "So What?" insight
- **Compare periods** — compare this month vs last month or vs your average, with per-category deltas and spike warnings
- **Spot anomalies** — the Insights page flags unusually large transactions compared to your spending baseline
- **Budget check** — enter your monthly budget and a planned purchase; projects whether you can afford it
- **Time-to-zero runway** — estimates when your balance hits zero if current spending continues
- **10 planning tools** — FIRE calculator, debt snowball/avalanche, 50/30/20 budgeting, tax estimator (PPh 21), savings goal, emergency fund, inflation impact, net worth, daily budget, affordability check
- **Import from a spreadsheet** — bulk-import months of history from a CSV export
- **Export transactions** — download your full transaction history as CSV
- **Full timezone support** — records each transaction in the timezone it was made, displays correctly everywhere
- **Password reset** — forgot-password flow with email reset link (expires in 1 hour)
- **Google OAuth** — sign in with Google in one click
- **Dark mode** — manual toggle; landing page always stays in light mode

---

## Features

| Feature | Description |
|---------|-------------|
| Dashboard | Balance, monthly income/expense, searchable + sortable transaction list |
| Add transaction | Income or expense with smart category suggestions |
| Analytics | Monthly/yearly charts, category breakdown, period comparison |
| Insights | Anomaly detection, spending explainability, time-to-zero runway |
| Recommendation | 10 built-in financial planning calculators |
| Range report | Custom date range with income/expense summary |
| CSV import | Bulk-import from Excel or Google Sheets |
| CSV export | Download full transaction history |
| Profile | Financial identity, preferences, export, danger zone |
| Settings | Theme toggle, change password, logout all devices, delete account |
| Password reset | Email-based reset link with 1-hour expiry |
| Privacy & Terms | Full Privacy Policy and Terms of Service pages |

---

## Security

- JWT with `tokenVersion` — changing your password invalidates all existing sessions
- Google OAuth via server-side token verification
- CORS restricted to the frontend origin only
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- Input sanitization — HTML tags and null bytes stripped from all transaction fields
- Rate limiting on all endpoints (IP-based for auth, user-based for authenticated routes)
- Password reset tokens are single-use and expire after 1 hour
- Anti-enumeration: forgot-password always returns 200 regardless of whether the email exists

---

## For developers

See [DEVELOPER.md](./DEVELOPER.md) for setup, environment variables, API reference, and contribution guide.

---

## License

ISC
