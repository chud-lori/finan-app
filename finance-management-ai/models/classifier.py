"""
Category semantic classifier.

Strategy:
  1. Normalise the name (lowercase, strip)
  2. Exact keyword match  → confidence 1.0
  3. Substring match      → confidence 0.9
  4. TF-IDF char-ngram cosine similarity against the keyword corpus
     → group with highest aggregate similarity, if score > 0.25
  5. Fallback             → 'other', confidence 0.0

Groups:
  essential      — survival / fixed costs
  discretionary  — lifestyle / wants
  savings        — wealth-building / investments
  social         — outflows to others (gifts, charity, sharing)
  income         — money coming in
  other          — unclassified
"""

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any

# ── Keyword taxonomy ──────────────────────────────────────────────────────────
KEYWORD_RULES: Dict[str, List[str]] = {
    "essential": [
        # Food (basic)
        "food", "groceries", "grocery", "supermarket", "market", "pasar",
        "makan", "nasi", "warung", "beli makan", "sembako", "sayur",
        # Housing
        "rent", "rental", "housing", "kost", "kos", "kontrakan", "sewa rumah",
        "mortgage", "cicilan rumah", "ipl",
        # Utilities
        "utilities", "electricity", "listrik", "water", "air", "pam",
        "gas", "internet", "wifi", "phone", "pulsa", "paket data", "token listrik",
        # Transport (commute)
        "transport", "transportation", "commute", "bus", "train", "mrt", "lrt",
        "ojek", "bensin", "fuel", "petrol", "bbm", "toll", "parkir",
        "transjakarta", "krl",
        # Health & medical
        "health", "medical", "medicine", "obat", "hospital", "rumah sakit",
        "clinic", "klinik", "dokter", "doctor", "pharmacy", "apotek",
        "vitamins", "vitamin",
        # Insurance
        "insurance", "asuransi", "bpjs",
        # Education
        "education", "school", "sekolah", "tuition", "spp", "kursus", "les",
        "university", "kampus",
        # Childcare
        "childcare", "daycare", "baby", "bayi", "susu bayi",
    ],
    "discretionary": [
        # Dining out / café
        "dining", "dining out", "restaurant", "cafe", "coffee", "kopi",
        "boba", "bubble tea", "fastfood", "fast food", "jajan",
        "nongkrong", "hangout",
        # Entertainment
        "entertainment", "hiburan", "cinema", "bioskop", "konser", "concert",
        "event", "tiket", "ticket",
        # Shopping / fashion
        "shopping", "belanja", "clothes", "fashion", "pakaian", "baju",
        "sepatu", "shoes", "tas", "bag", "accessories", "aksesoris",
        # Travel / vacation
        "travel", "vacation", "holiday", "liburan", "wisata", "hotel",
        "airbnb", "flight", "pesawat", "tiket pesawat",
        # Fitness / sport
        "sport", "sports", "gym", "fitness", "olahraga", "futsal",
        # Subscriptions / digital
        "subscription", "streaming", "netflix", "spotify", "youtube",
        "disney", "hbo", "prime video",
        # Beauty / personal care
        "beauty", "kecantikan", "salon", "spa", "skincare", "makeup",
        "barbershop", "pangkas",
        # Gadgets / electronics
        "gadget", "electronics", "elektronik", "hp", "smartphone",
        # Alcohol / nightlife
        "alcohol", "bar", "pub", "nightclub", "rooftop",
        # Hobbies
        "hobby", "hobbies", "gaming", "game", "buku", "book",
        # Pets
        "pet", "hewan peliharaan", "kucing", "anjing",
    ],
    "savings": [
        "saving", "savings", "tabungan", "menabung", "nabung",
        "investment", "invest", "investing", "investasi",
        "stock", "stocks", "saham", "reksa dana", "reksadana",
        "mutual fund", "bonds", "obligasi",
        "crypto", "cryptocurrency", "bitcoin", "eth",
        "retirement", "pension", "pensiun", "dana pensiun",
        "emergency fund", "dana darurat",
        "deposit", "deposito", "time deposit",
        "property", "properti", "tanah", "rumah investasi",
        "gold", "emas", "logam mulia",
    ],
    "social": [
        "gift", "gifts", "present", "hadiah", "kado",
        "donation", "donate", "charity", "sedekah", "zakat", "infaq", "wakaf",
        "sharing", "berbagi",
        "family", "keluarga", "parents", "orang tua", "saudara",
        "wedding", "pernikahan", "nikahan", "kondangan", "walimah",
        "funeral", "duka", "lelayu",
        "gathering", "arisan", "reuni",
        "social", "socializing",
        "transfer", "kirim uang", "send money",
        "tip", "tips",
        "traktir", "mentraktir",
    ],
    "income": [
        "salary", "gaji", "upah", "wage",
        "freelance", "freelancing", "project income", "fee", "honorarium",
        "business income", "revenue", "profit", "usaha", "pendapatan",
        "dividend", "dividen",
        "interest income", "bunga tabungan",
        "bonus", "thr", "commission", "komisi",
        "rental income", "passive income", "sampingan",
        "refund", "cashback", "reimburse",
        "allowance", "uang saku",
    ],
}

# ── Build TF-IDF corpus from the keyword taxonomy ────────────────────────────
_corpus: List[str] = []
_labels: List[str] = []
for _group, _keywords in KEYWORD_RULES.items():
    for _kw in _keywords:
        _corpus.append(_kw)
        _labels.append(_group)

_vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=1)
_vectors = _vectorizer.fit_transform(_corpus)
_labels_arr = np.array(_labels)


# ── Public API ────────────────────────────────────────────────────────────────
def classify(name: str) -> Dict[str, Any]:
    """
    Classify a single category name.
    Returns {"group": str, "confidence": float}
    """
    norm = name.lower().strip()

    # 1. Exact match
    for group, keywords in KEYWORD_RULES.items():
        if norm in keywords:
            return {"group": group, "confidence": 1.0}

    # 2. Substring / partial match
    for group, keywords in KEYWORD_RULES.items():
        for kw in keywords:
            if kw in norm or norm in kw:
                return {"group": group, "confidence": 0.9}

    # 3. TF-IDF cosine similarity
    try:
        vec = _vectorizer.transform([norm])
        sims = cosine_similarity(vec, _vectors)[0]

        # Aggregate per group — take the max sim across all keywords in that group
        group_scores: Dict[str, float] = {}
        for i, label in enumerate(_labels_arr):
            group_scores[label] = max(group_scores.get(label, 0.0), float(sims[i]))

        best_group = max(group_scores, key=group_scores.get)
        best_score = group_scores[best_group]

        if best_score > 0.25:
            return {"group": best_group, "confidence": round(best_score, 3)}
    except Exception:
        pass

    return {"group": "other", "confidence": 0.0}


def classify_batch(names: List[str]) -> List[Dict[str, Any]]:
    """Classify a list of category names. Returns a list of result dicts."""
    return [{"category": name, **classify(name)} for name in names]
