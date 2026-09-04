# Finan App

A free, private personal finance tracker built for people who want to know exactly where their money goes — without spreadsheets, subscriptions, or ads.

## Try it live

**[finance.lori.my.id](https://finance.lori.my.id/)**

Sign up in 30 seconds. No credit card required. Google OAuth supported.

---

## The problem it solves

Most people have no clear picture of their finances. They earn money, spend it, and wonder at the end of the month where it went. Finan App gives you that picture: a running balance, spending broken down by category, anomaly alerts when something looks off, and 11 planning tools to answer questions like "can I afford this?", "when can I retire?", and "how should I split this bonus?"

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
- **Analytics** — monthly and yearly charts, category breakdown, savings rate, and "So What?" plain-language insight; year selector bounded to years with actual transactions; filter the charts by category / group / type / amount range (filters and period live in the URL, so a view can be bookmarked); click any chart element — month bar, donut slice, category bar, calendar day — to see the transactions behind it
- **Money flow** — where the month's money actually went: income splits across spending groups and lands in categories, with savings and leftover surplus shown as money you kept rather than money you spent; tap any branch for the transactions behind it
- **Spending calendar** — a day-by-day heatmap of the selected month: shade is relative to your own busiest day, savings transfers are not counted as spend, tap a day to see its transactions
- **Top merchants** — where the money actually went in the selected period: total, visit count and share per place, derived from your own transaction descriptions (no bank feed, no third-party lookup); savings transfers are not counted as spending, one-off purchases are rolled up so repeat spend stands out, and tapping a merchant shows its transactions
- **Period comparison** — this month vs last month or vs your average, with per-category deltas and spike warnings
- **Anomaly detection** — flags unusually large transactions compared to your spending baseline
- **Spending explainability** — shows which categories drive your spending the most, with month-over-month changes stated in money rather than percentages, and one-off purchases marked as such
- **Time-to-zero runway** — estimates when your balance hits zero if current spending continues
- **Money Recap** — a monthly in-app "wrapped": a plain-language narrative plus stat tiles (net saved, spend vs last month, top category, streak, net-worth change) stitched entirely from your own numbers, no AI
- **Payday Runway** — forward safe-to-spend before your next expected income: detects your income cadence, projects the balance forward using upcoming bills and your everyday spending pace, flags the day the balance would run out (degrades to a rolling 30-day view for variable income), and lists any recurring bill whose price went up — what it was, what it is now
- **Category management** — rename categories (updates all transactions automatically) or delete unused ones; 28 default categories pre-loaded for every new account

### Plan
11 built-in financial planning tools — no external apps needed:

| Tool | What it answers |
|------|----------------|
| Can I Afford This? | Will this purchase break my budget this month? |
| 50/30/20 Rule | How should I split my income? |
| Savings Goal | How long until I reach my target? |
| Daily Budget | How much can I safely spend per day for the rest of this month? |
| Emergency Fund | How much should I keep in reserve? Saves the 3- or 6-month target as a tracked goal |
| Debt Payoff | Snowball vs avalanche — which saves more interest? |
| FIRE Calculator | What's my financial independence number? |
| Tax Estimator | Estimate Indonesian PPh 21 tax (progressive + TER awareness); auto-fills from your average income |
| Net Worth | Track assets vs liabilities with a saved monthly trend — one point per month |
| Windfall Planner | Detects a THR / bonus / large one-off income and splits it into your goals, one tap each |
| Zakat Estimator | Estimates zakat-maal (2.5% of zakatable assets) and tracks your giving this year — a clearly-labelled estimate, optional for everyone |

**Smart nudges** on the dashboard turn your data into one-tap actions. The **surplus sweep** nudge appears when last month's income beat its spending: one tap earmarks part of that leftover to a savings goal (added to that goal's own balance — nothing leaves any account), and the nudge clears itself once you act.

### Preferences
- **Currency** — IDR and other currencies; affects all formatting throughout the app
- **Number format** — dot grouping (5.000.000) or comma grouping (5,000,000)
- **Per-month budget** — set a budget for each month independently; optionally update the global default
- **Timezone** — transactions recorded and displayed in your local timezone

---

## Features

| Page | Description |
|------|-------------|
| Dashboard | Running balance, monthly income/expense, searchable + sortable transaction list with inline editing and filters by type (income/expense) and category |
| Add transaction | Income or expense with smart category suggestions, plus a savings/investment nudge — log money moved to savings under a savings category so it counts as saved, not spent |
| Analytics | Monthly/yearly charts, money flow (income → group → category), spending calendar heatmap (day-level density for the month), category breakdown, top merchants for the period, period comparison, chart drill-down + shareable filter bar |
| Insights | Money Recap (monthly wrap-up), Payday Runway (safe-to-spend before next income), anomaly detection (seasonal- and lumpy-category aware — an expected Ramadan/Lebaran or social-spending spike isn't flagged), an insight feed ranked by how much money is at stake (changes are measured over two complete 30-day windows rather than a part-finished month, stated in currency rather than as percentages, amounts too small to change your month are left out, and a category you only buy from occasionally is never accused of running above a "pace"), spending explainability, time-to-zero runway, smart category classification, category management (rename / delete), optional envelope-lite group budgets (soft caps per essential / discretionary / savings / social), and dismissable insights — mark a category's insight as expected or unhelpful and it stops repeating, with a "hidden insights" list to bring any of them back. Savings & investment visibility: investing logged as a savings-group expense is treated as saved (not spent) across savings rate, 50/30/20 and anomaly baselines |
| Recommendation | 11 planning tools — data-connected 50/30/20, net-worth tracking, tax estimator, windfall planner, zakat estimator, and more — plus a Seasonal Radar heads-up that pre-warns before your own seasonal spikes with a suggested set-aside |
| Analytics → Custom range | Any custom date range (income/expense summary + breakdown) — folded into Analytics as a tab (no separate Reports page) |
| Profile | Financial identity, currency & format preferences, CSV import/export, danger zone |
| Settings | Theme toggle, change password, logout all devices, delete account |
| Password reset | Email-based reset link via Resend (1-hour expiry) |
| Privacy & Terms | Full Privacy Policy and Terms of Service |

---

## Security

- **Passwords hashed with bcrypt** (salt 10) — never stored in plaintext
- **HttpOnly cookie sessions** — JWT never touches JavaScript or localStorage; XSS cannot steal it
- **Stateful session store** — every request validated against a live MongoDB Session document; revoke = instant, no waiting for token expiry
- **All bearer-style tokens hashed in the database** — JWT session, password-reset, and email-verification tokens are stored as SHA-256 hashes. The raw token only lives in your cookie or your inbox, so a database leak cannot be replayed for account takeover
- **Per-device session management** — see and revoke any active session from the profile page
- **Logout all devices** — deletes every session and bumps `tokenVersion`; old tokens are dead immediately
- **Password change / reset** — automatically deletes all sessions across all devices
- **Account deletion revokes all sessions immediately** — no ghost-session window after you delete your account
- **Google OAuth** — sign in without a password; server-side token verification
- **Email verification** — new accounts must verify before full access
- **Anti-enumeration** — both login and forgot-password return generic, indistinguishable responses regardless of whether the email/username is registered
- **Per-address password-reset throttle** — at most one reset email per address every 10 minutes, on top of the per-IP cap, so a single attacker can't spam victim inboxes
- **CSRF-resistant API** — JSON-only body parser + CORS origin allow-list. Cross-site form posts can't reach the API
- **CORS** — restricted to the frontend origin with `credentials: true`
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- **Input sanitization** — HTML tags and null bytes stripped from all transaction fields
- **Rate limiting** — IP-based for auth endpoints, user-based for authenticated routes; correctly bound to the real client IP behind the reverse proxy
- **PII-scrubbed error reporting** — Sentry events are filtered through a `beforeSend` hook that drops passwords, email addresses, identifiers, and auth headers before any payload leaves the process
- **No PII in login logs** — the user-supplied email/username is never written to log files on failure; only the resolved user id is logged on success
- **Ownership enforced** — every data query is scoped to the authenticated user; no cross-user data access possible

---

## For developers

See [DEVELOPER.md](./DEVELOPER.md) for setup, environment variables, architecture notes, API reference, and contribution guide.

---

## License

ISC
