# Finan App — Plan

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
