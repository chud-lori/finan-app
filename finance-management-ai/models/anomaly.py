"""
Isolation Forest–based anomaly detection for personal finance transactions.

Strategy:
  - Group all transactions (up to 6 months) by category
  - Per category:
      ≥ 10 samples → Isolation Forest
      3–9 samples  → Z-score fallback
      < 3 samples  → skip (not enough context)
  - Only score transactions marked as `current_month`
  - Return top 10 results sorted by anomaly severity
"""

import numpy as np
from sklearn.ensemble import IsolationForest
from collections import defaultdict
from typing import List, Dict, Any


def detect_anomalies(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect unusual transactions using Isolation Forest per category.
    Expects each transaction to have `is_current_month: bool`.
    Returns anomalies only for current-month transactions.
    """
    by_category: Dict[str, List[Dict]] = defaultdict(list)
    for tx in transactions:
        if tx.get("type", "expense") == "expense":
            by_category[tx["category"]].append(tx)

    results: List[Dict[str, Any]] = []

    for category, txs in by_category.items():
        amounts = np.array([t["amount"] for t in txs], dtype=float)
        current = [t for t in txs if t.get("is_current_month", False)]
        if not current:
            continue

        mean_amount = float(np.mean(amounts))
        if mean_amount == 0:
            continue

        if len(txs) >= 10:
            # --- Isolation Forest ---
            X = amounts.reshape(-1, 1)
            clf = IsolationForest(
                n_estimators=100,
                contamination=0.1,
                random_state=42,
            )
            clf.fit(X)

            # Build lookup: id → (score, prediction)
            id_to_idx = {t["id"]: i for i, t in enumerate(txs)}
            scores = clf.score_samples(X)   # more negative = more anomalous
            preds  = clf.predict(X)          # -1 = anomaly

            for tx in current:
                idx = id_to_idx[tx["id"]]
                if preds[idx] == -1:
                    multiple = tx["amount"] / mean_amount
                    # Normalise score: score_samples returns values roughly in [-0.5, 0]
                    severity_score = float(np.clip((-scores[idx] - 0.05) / 0.45, 0, 1))
                    results.append(_build_result(tx, multiple, severity_score, mean_amount, category))

        elif len(txs) >= 3:
            # --- Z-score fallback ---
            std = float(np.std(amounts))
            if std == 0:
                continue
            for tx in current:
                z = abs(tx["amount"] - mean_amount) / std
                if z >= 2.0:
                    multiple = tx["amount"] / mean_amount
                    severity_score = float(np.clip((z - 2.0) / 3.0, 0, 1))
                    results.append(_build_result(tx, multiple, severity_score, mean_amount, category))

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:10]


def _build_result(tx, multiple, score, category_avg, category):
    severity = "high" if multiple >= 3 or score >= 0.7 else "medium" if multiple >= 1.8 else "low"
    label = (
        f"{multiple:.1f}× your usual {category} spending"
        if multiple >= 1.2
        else f"Unusual amount for {category}"
    )
    return {
        "id":           tx["id"],
        "description":  tx["description"],
        "category":     category,
        "amount":       tx["amount"],
        "date":         tx["date"],
        "score":        round(score, 3),
        "severity":     severity,
        "multiple":     round(float(multiple), 1),
        "category_avg": round(float(category_avg)),
        "label":        label,
    }
