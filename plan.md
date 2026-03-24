# Finan App — Plan

---

## Auth Overhaul — HttpOnly Cookie + Stateful Sessions + Device List

**Status:** Planned
**Goal:** Replace localStorage JWT with HttpOnly cookie + MongoDB session store. Enable true logout-all-devices, per-device revocation, and a live device list in the profile page.

### What changes and why

| Current | After |
|---|---|
| JWT in `localStorage` — readable by any JS (XSS risk) | JWT in `HttpOnly` cookie — JS can't touch it |
| Stateless — `logoutAllDevices` just bumps `tokenVersion`, old tokens still circulate for up to 7d | Stateful — every request validated against a live Session doc; revoke = delete doc |
| No device visibility | Profile shows "Chrome on macOS · last seen 2h ago" with per-device revoke |
| `Authorization: Bearer` header set manually | Cookie sent automatically by browser |

---

### New: Session model (`finance-management/models/session.model.js`)

```js
{
  user:      ObjectId (ref User, indexed),
  tokenHash: String   (SHA-256 of JWT, unique index — used for O(1) lookup),
  device: {
    name:    String,   // "Chrome on macOS"
    browser: String,   // "Chrome 124"
    os:      String,   // "macOS 14"
    ip:      String,   // "203.0.113.5"
  },
  createdAt: Date,
  lastSeen:  Date,
  expiresAt: Date,   // TTL index — MongoDB auto-deletes expired sessions
}
```

- **TTL index on `expiresAt`** — no cron job needed for cleanup
- **Index on `tokenHash`** — O(1) session lookup per request
- **Index on `user`** — O(1) for "get all sessions for user"

---

### Implementation plan (in order)

#### Phase 1 — Backend

**1. Install dependency**
```bash
cd finance-management && npm install ua-parser-js
```
Used to parse `User-Agent` header into `{ browser, os, device }`.

**2. Create `session.model.js`**
See schema above. Add TTL index on `expiresAt` and compound index on `{ user, tokenHash }`.

**3. Update `controllers/auth.js`**

`loginUser`, `verifyGoogleToken` — after signing JWT:
```js
// Hash the token for session lookup (never store raw JWT)
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

// Parse device info from User-Agent
const UAParser = require('ua-parser-js');
const ua = new UAParser(req.headers['user-agent']).getResult();
const deviceName = [ua.browser.name, 'on', ua.os.name].filter(Boolean).join(' ') || 'Unknown device';

await Session.create({
  user:      user._id,
  tokenHash,
  device: {
    name:    deviceName,
    browser: `${ua.browser.name || ''} ${ua.browser.version || ''}`.trim(),
    os:      `${ua.os.name || ''} ${ua.os.version || ''}`.trim(),
    ip:      req.ip || req.headers['x-forwarded-for'] || 'unknown',
  },
  createdAt: new Date(),
  lastSeen:  new Date(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});

// Set HttpOnly cookie instead of returning token in body
res.cookie('token', token, {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',  // HTTPS only in prod
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,               // 7 days in ms
});

// Return user info only — no token in body
res.json(BaseResponseDTO.success('Login successful', { user: { id, name } }));
```

`logoutAllDevices` — delete all sessions for user + clear cookie:
```js
await Session.deleteMany({ user: req.user.id });
res.clearCookie('token', { httpOnly: true, secure: ..., sameSite: 'strict' });
res.json(BaseResponseDTO.success('All sessions invalidated.'));
```

`logout` (new) — delete current session + clear cookie:
```js
const tokenHash = crypto.createHash('sha256').update(req.token).digest('hex');
await Session.deleteOne({ tokenHash });
res.clearCookie('token', { ... });
res.json(BaseResponseDTO.success('Logged out.'));
```

**4. Update `middleware/authJWT.js`**

Read from cookie instead of `Authorization` header. Validate session in DB. Update `lastSeen`.

```js
const authenticateJWT = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_TOKEN);
  } catch {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await Session.findOne({ tokenHash }).lean();
  if (!session) return res.status(403).json({ message: 'Session expired. Please log in again.' });

  // Update lastSeen (fire-and-forget — don't block the request)
  Session.updateOne({ _id: session._id }, { lastSeen: new Date() }).catch(() => {});

  req.user  = decoded;
  req.token = token;             // needed by logout to find session
  req.sessionId = session._id;   // needed by "revoke this session"
  next();
};
```

**5. Add session management endpoints to `routers/auth.js`**

```
GET    /api/auth/sessions         — list all active sessions for user
DELETE /api/auth/sessions         — revoke all (logout all devices)
DELETE /api/auth/sessions/:id     — revoke one session (not the current one)
POST   /api/auth/logout           — revoke current session + clear cookie
```

`getSessions` controller:
```js
const sessions = await Session.find({ user: req.user.id })
  .select('device createdAt lastSeen expiresAt')
  .sort({ lastSeen: -1 })
  .lean();

// Mark which session is the current one
const currentHash = crypto.createHash('sha256').update(req.token).digest('hex');
return res.json({ status: 1, data: { sessions: sessions.map(s => ({
  ...s,
  isCurrent: String(s._id) === String(req.sessionId),
})) } });
```

**6. Update `app.js` CORS config**
```js
cors({
  origin:      process.env.FE_URL || 'http://localhost:3000',
  credentials: true,   // ← required for cookies to be sent cross-origin
})
```

**7. Add `cookie-parser` middleware to `app.js`**
```bash
npm install cookie-parser
```
```js
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

---

#### Phase 2 — Frontend

**8. Update `lib/api.js`**

Remove `getToken()` and `Authorization` header. Add `credentials: 'include'` everywhere.

```js
// Before (every request)
headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }

// After
headers: { 'Content-Type': 'application/json' },
credentials: 'include',
```

Central fetch wrapper makes this a single change:
```js
const apiFetch = (url, opts = {}) =>
  fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  }).then(handleResponse);
```

**9. Update auth context / AuthGuard**

Currently `AuthGuard` checks `localStorage.getItem('token')`. After this change, auth state is determined by whether `/api/auth/check` returns 200 (cookie is sent automatically).

- Remove all `localStorage.setItem('token', ...)` on login
- Remove all `localStorage.removeItem('token')` on logout
- `AuthGuard` calls `checkAuth()` on mount; if 401 → redirect to login

**10. Profile page — Sessions section**

New section below "Danger Zone":
```
🖥  Active Sessions
───────────────────────────────────
● Chrome on macOS          [Current]
  Last seen: just now · IP: 203.x.x.x

  Safari on iPhone
  Last seen: 3h ago · Signed in: Mar 20
  [Revoke]

  Firefox on Windows
  Last seen: 2d ago
  [Revoke]

[Revoke all other sessions]
```

- `GET /api/auth/sessions` on mount
- "Revoke" → `DELETE /api/auth/sessions/:id` → refetch list
- "Revoke all other sessions" → `DELETE /api/auth/sessions` (except current) or existing logoutAllDevices

---

### Files touched

| File | Change |
|---|---|
| `finance-management/models/session.model.js` | **New** |
| `finance-management/controllers/auth.js` | login, google, logout, logoutAll, getSessions, revokeSession |
| `finance-management/middleware/authJWT.js` | Read cookie, validate session, update lastSeen |
| `finance-management/app.js` | Add cookie-parser, update CORS credentials |
| `finance-management/routers/auth.js` | Add session routes |
| `finance-management-fe/lib/api.js` | Remove Authorization header, add credentials: 'include', add session API calls |
| `finance-management-fe/components/AuthGuard.js` | Remove localStorage check, use /api/auth/check |
| `finance-management-fe/app/profile/page.js` | Add sessions section UI |

---

### Rollout notes

- Do Phase 1 and Phase 2 in the **same deploy** — switching to cookies on backend while frontend still sends `Authorization: Bearer` will break auth for all users between deploys
- Keep `tokenVersion` on User model — still useful as a secondary revocation mechanism for password changes / forgot-password flows (bump it → all sessions for that user become invalid even if Session doc somehow survives)
- `changePassword` and `resetPassword` should also call `Session.deleteMany({ user: userId })` in addition to bumping `tokenVersion`
- Google OAuth: `verifyGoogleToken` needs the same cookie-set + session-create treatment as `loginUser`

---

## Multilingual Category Classifier (NLP Upgrade)

**Status:** Planned
**Goal:** Replace the keyword + TF-IDF classifier with a multilingual sentence embedding model so categories work regardless of language — Indonesian, English, mixed, slang, or typos.

### Why
The current classifier in `finance-management-ai/models/classifier.py` uses:
1. Exact/substring keyword matching against a hand-curated taxonomy
2. TF-IDF char-ngram cosine similarity as fallback

This breaks for unknown Indonesian slang (`jajan`, `bensin`, `sambel`), regional variants, typos (`mkan`), and any language not in the keyword list. Users will naturally type category names in their own language.

### Approach — Multilingual Sentence Embeddings

**Model:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- 50+ languages including Indonesian
- ~118MB, CPU inference ~5ms per batch
- No GPU required, fits in existing `finan-ai` container

**Mechanism — anchor-based zero-shot classification:**
- Pre-compute embeddings for a set of anchor phrases per group at startup
- At inference time: embed the category name → cosine similarity vs each group's anchor mean → argmax
- No fine-tuning or labeled data needed; group definitions are controlled via the anchor phrase list

### Implementation Plan

#### 1. Update `finance-management-ai/requirements.txt`
Add:
```
sentence-transformers>=2.7.0
torch>=2.0 --index-url https://download.pytorch.org/whl/cpu
```

#### 2. Rewrite `finance-management-ai/models/classifier.py`

Keep the same public interface (`classify(name)` → `{group, confidence}` and `classify_batch(names)`).

Internals:
```python
from sentence_transformers import SentenceTransformer, util

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'
model = SentenceTransformer(MODEL_NAME)  # loaded once at module import

ANCHORS = {
  'essential': [
    # Indonesian
    'makanan pokok', 'makan siang', 'makan malam', 'sewa rumah', 'kos',
    'tagihan listrik', 'air pam', 'bensin', 'bbm', 'ongkos', 'transport',
    'ojek', 'grab', 'gojek', 'obat', 'dokter', 'kesehatan',
    # English
    'groceries', 'rent', 'utilities', 'electricity', 'water bill',
    'fuel', 'transportation', 'commute', 'medicine', 'healthcare',
  ],
  'discretionary': [
    # Indonesian
    'makan di luar', 'restoran', 'nongkrong', 'kafe', 'belanja',
    'baju', 'sepatu', 'hiburan', 'bioskop', 'game', 'langganan',
    # English
    'dining out', 'restaurant', 'shopping', 'clothes', 'entertainment',
    'movies', 'subscription', 'netflix', 'spotify', 'travel', 'vacation',
  ],
  'savings': [
    # Indonesian
    'tabungan', 'investasi', 'reksa dana', 'saham', 'deposito', 'dana darurat',
    # English
    'savings', 'investment', 'mutual fund', 'stocks', 'emergency fund', 'deposit',
  ],
  'social': [
    # Indonesian
    'hadiah', 'kado', 'donasi', 'amal', 'arisan', 'patungan', 'keluarga',
    # English
    'gift', 'donation', 'charity', 'sharing', 'family', 'wedding',
  ],
  'income': [
    # Indonesian
    'gaji', 'pendapatan', 'freelance', 'honor', 'bonus', 'dividen',
    # English
    'salary', 'income', 'paycheck', 'freelance', 'dividend', 'revenue',
  ],
  'other': [
    'other', 'miscellaneous', 'lain-lain', 'dll',
  ],
}

# Pre-compute anchor embeddings once at startup
_anchor_embeddings = {
  group: model.encode(phrases, convert_to_tensor=True)
  for group, phrases in ANCHORS.items()
}

def classify(name: str) -> dict:
    if not name or not name.strip():
        return {'group': 'other', 'confidence': 0.0}

    emb = model.encode(name.strip(), convert_to_tensor=True)
    scores = {}
    for group, anchors in _anchor_embeddings.items():
        sim = util.cos_sim(emb, anchors)   # shape (1, N)
        scores[group] = float(sim.max())   # best anchor match

    best_group = max(scores, key=scores.get)
    confidence = round(scores[best_group], 4)

    # Fallback to 'other' if confidence too low
    if confidence < 0.30:
        return {'group': 'other', 'confidence': confidence}

    return {'group': best_group, 'confidence': confidence}
```

#### 3. Startup time consideration
- Model download (~118MB) happens on first container start
- Pre-bake into Docker image by downloading at build time:
  ```dockerfile
  RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
  ```
- Add to `finance-management-ai/Dockerfile`

#### 4. Keep existing `/classify` endpoint in `main.py` unchanged
The Express `categoryClassifier.js` helper calls `/classify` — no changes needed there.

#### 5. Test cases to verify
| Input | Expected group |
|---|---|
| `makan siang` | essential |
| `warung nasi` | essential |
| `jajan` | essential or discretionary |
| `netflix` | discretionary |
| `nongkrong` | discretionary |
| `gaji` | income |
| `tabungan` | savings |
| `hadiah` | social |
| `listrik` | essential |
| `groceries` | essential |
| `Uber` | essential |

### Files to Change
| File | Change |
|---|---|
| `finance-management-ai/requirements.txt` | Add `sentence-transformers`, `torch` (cpu) |
| `finance-management-ai/Dockerfile` | Pre-download model at build time |
| `finance-management-ai/models/classifier.py` | Full rewrite keeping same public API |

### Trade-offs
| | Current (TF-IDF + keywords) | Option 1 (MiniLM embeddings) |
|---|---|---|
| Indonesian coverage | Explicit keyword list only | Native multilingual |
| Slang/variants | Misses unless listed | Handles via semantic similarity |
| Container size | No change (~0MB extra) | +118MB model |
| Cold start | Instant | ~3–5s model load |
| Inference speed | <1ms | ~5ms/batch |
| Maintenance | Must update keyword list | Update anchor phrases only |
