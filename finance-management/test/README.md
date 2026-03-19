# Backend Integration Tests

Comprehensive integration tests for the Finance Management API.

---

## Test structure

| File | What it covers |
|------|---------------|
| `setup.js` | In-memory MongoDB setup shared by all suites |
| `app.integration.test.js` | CORS policy, security headers, 404 handling, Swagger availability |
| `auth.integration.test.js` | Register, login, JWT validation, tokenVersion, Google OAuth verify, change password, logout-all, duplicate prevention |
| `transaction.integration.test.js` | Add/delete transactions, balance updates, category management, CSV import, analytics, date range queries, budget recommendation |
| `goal.integration.test.js` | Create goals, savings calculations, goal detail, multi-goal per user |
| `end-to-end.test.js` | Full user journey, multi-user data isolation, error recovery |

---

## Running tests

```bash
cd finance-management

npm test                   # all suites
npm run test:auth          # auth only
npm run test:transaction   # transaction only
npm run test:goal          # goal only
npm run test:e2e           # end-to-end only
npm run test:app           # app/infra only
```

---

## Test environment

- **Database:** in-memory MongoDB via `mongodb-memory-server` — no real DB needed
- **Framework:** Mocha + Chai
- **HTTP client:** `chai-http`
- **Isolation:** each test starts with a clean database state
- **Rate limiting:** disabled in `NODE_ENV=test` (no-op middleware)

---

## Coverage

- ✅ All API endpoints
- ✅ Request/response validation and DTO normalization
- ✅ Authentication — JWT issue, tokenVersion invalidation, password change
- ✅ Google OAuth token verification flow
- ✅ Input sanitization (HTML/null-byte stripping)
- ✅ Balance calculation on transaction create/delete
- ✅ Category scoping per user
- ✅ CSV import (valid rows, skipped rows, error reporting)
- ✅ Multi-user data isolation
- ✅ Error handling and edge cases
