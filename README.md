# Finan App

A free, private personal finance tracker built for people who want to know exactly where their money goes — without spreadsheets, subscriptions, or ads.

## Try it live

**[finance.lori.my.id](https://finance.lori.my.id/)**

Sign up in 30 seconds. No credit card required. Google OAuth supported.

---

## The problem it solves

Most people have no clear picture of their finances. They earn money, spend it, and wonder at the end of the month where it went. Finan App gives you that picture: a running balance, spending broken down by category, anomaly alerts when something looks off, and 10 planning tools to answer questions like "can I afford this?", "when can I retire?", and "how long until my balance hits zero?"

---

## What it does

### Track
- **Running balance** — always up to date after every transaction
- **Income & expenses** — log any transaction with description, amount, category, and exact datetime
- **Smart category suggestions** — predicts your most likely category based on time of day and past habits
- **Inline editing** — fix transaction description or category directly in the dashboard table
- **Multi-file CSV import** — bulk-import months of history from Excel or Google Sheets exports; select or drag multiple files at once
- **CSV export** — download your full transaction history at any time
- **Full timezone support** — records each transaction in the timezone it was made

### Understand
- **Analytics** — monthly and yearly charts, category breakdown, savings rate, and "So What?" plain-language insight; year selector bounded to years with actual transactions; click any bar in yearly view to see that month's transactions
- **Period comparison** — this month vs last month or vs your average, with per-category deltas and spike warnings
- **Anomaly detection** — flags unusually large transactions compared to your spending baseline
- **Spending explainability** — shows which categories drive your spending the most
- **Time-to-zero runway** — estimates when your balance hits zero if current spending continues
- **Category management** — rename categories (updates all transactions automatically) or delete unused ones; 28 default categories pre-loaded for every new account

### Plan
10 built-in financial planning tools — no external apps needed:

| Tool | What it answers |
|------|----------------|
| Can I Afford This? | Will this purchase break my budget this month? |
| 50/30/20 Rule | How should I split my income? |
| Savings Goal | How long until I reach my target? |
| Daily Budget | How much can I safely spend per day for the rest of this month? |
| Emergency Fund | How much should I keep in reserve? |
| Debt Payoff | Snowball vs avalanche — which saves more interest? |
| FIRE Calculator | What's my financial independence number? |
| Inflation Impact | How much is purchasing power eroding over time? |
| Tax Estimator | Estimate Indonesian PPh 21 tax bracket |
| Net Worth | Assets vs liabilities snapshot |

### Preferences
- **Currency** — IDR and other currencies; affects all formatting throughout the app
- **Number format** — dot grouping (5.000.000) or comma grouping (5,000,000)
- **Per-month budget** — set a budget for each month independently; optionally update the global default
- **Timezone** — transactions recorded and displayed in your local timezone

---

## Features

| Page | Description |
|------|-------------|
| Dashboard | Running balance, monthly income/expense, searchable + sortable transaction list with inline editing |
| Add transaction | Income or expense with smart category suggestions |
| Analytics | Monthly/yearly charts, category breakdown, period comparison |
| Insights | Anomaly detection, spending explainability, time-to-zero runway, AI category classification, category management (rename / delete) |
| Recommendation | 10 built-in financial planning calculators |
| Range report | Custom date range with income/expense summary |
| Profile | Financial identity, currency & format preferences, CSV import/export, danger zone |
| Settings | Theme toggle, change password, logout all devices, delete account |
| Password reset | Email-based reset link via Resend (1-hour expiry) |
| Privacy & Terms | Full Privacy Policy and Terms of Service |

---

## Security

- **Passwords hashed with bcrypt** (salt 10) — never stored in plaintext
- **HttpOnly cookie sessions** — JWT never touches JavaScript or localStorage; XSS cannot steal it
- **Stateful session store** — every request validated against a live MongoDB Session document; revoke = instant, no waiting for token expiry
- **Per-device session management** — see and revoke any active session from the profile page
- **Logout all devices** — deletes every session and bumps `tokenVersion`; old tokens are dead immediately
- **Password change / reset** — automatically deletes all sessions across all devices
- **Google OAuth** — sign in without a password; server-side token verification
- **Email verification** — new accounts must verify before full access
- **Anti-enumeration** — forgot-password always returns 200 regardless of whether the email exists
- **CORS** — restricted to the frontend origin with `credentials: true`
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- **Input sanitization** — HTML tags and null bytes stripped from all transaction fields
- **Rate limiting** — IP-based for auth endpoints, user-based for authenticated routes
- **Ownership enforced** — every data query is scoped to the authenticated user; no cross-user data access possible

---

## For developers

See [DEVELOPER.md](./DEVELOPER.md) for setup, environment variables, architecture notes, API reference, and contribution guide.

---

## License

ISC
