"""
Finan App — AI microservice
Exposes two ML-powered endpoints consumed internally by the Node backend.

Run:  uvicorn main:app --host 127.0.0.1 --port 3002
"""

import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from models.anomaly import detect_anomalies
from models.forecast import forecast_month_spend

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Finan App AI Service", version="1.0.0", docs_url=None, redoc_url=None)


# ── Request / Response models ─────────────────────────────────────────────────

class Transaction(BaseModel):
    id: str
    amount: float
    category: str
    date: str
    description: str
    type: str = "expense"
    is_current_month: bool = False


class DailyTotal(BaseModel):
    day: int
    amount: float


class AnalyzeRequest(BaseModel):
    """Single combined request — one round-trip from the Node backend."""
    transactions: List[Transaction]          # 6 months of expenses
    daily_totals: List[DailyTotal]           # per-day expense totals, current month only
    current_day: int
    days_in_month: int
    budget: Optional[float] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    Run both anomaly detection and spending forecast in one call.
    Returns:
      anomalies  – list of unusual transactions ranked by severity
      forecast   – month-end spend prediction with confidence + trend
    """
    try:
        tx_dicts = [t.model_dump() for t in req.transactions]
        anomalies = detect_anomalies(tx_dicts)
    except Exception as exc:
        log.error("Anomaly detection failed: %s", exc)
        anomalies = []

    try:
        daily = [d.model_dump() for d in req.daily_totals]
        forecast = forecast_month_spend(
            daily, req.current_day, req.days_in_month, req.budget
        )
    except Exception as exc:
        log.error("Forecast failed: %s", exc)
        forecast = {"available": False, "reason": "Forecast unavailable"}

    return {
        "anomalies": anomalies,
        "anomaly_count": len(anomalies),
        "forecast": forecast,
    }
