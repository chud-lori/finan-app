"""
Linear Regression–based month-end spending forecast.

Strategy:
  - Build cumulative daily spend curve for the current month
  - Fit LinearRegression: day_number → cumulative_spend
  - Predict at day = days_in_month
  - Use R² as a confidence proxy
  - Clamp forecast ≥ amount already spent
"""

import numpy as np
from sklearn.linear_model import LinearRegression
from typing import List, Dict, Any, Optional


def forecast_month_spend(
    daily_totals: List[Dict[str, Any]],  # [{"day": int, "amount": float}, ...]
    current_day: int,
    days_in_month: int,
    budget: Optional[float] = None,
) -> Dict[str, Any]:
    if not daily_totals or current_day < 4:
        return {
            "available":    False,
            "reason":       "Not enough data yet — check back after a few more days",
            "days_tracked": current_day,
        }

    # Build cumulative spend array (fill gaps with 0)
    spend_by_day = {d["day"]: d["amount"] for d in daily_totals}
    days, cumulative = [], []
    running = 0.0
    for day in range(1, current_day + 1):
        running += spend_by_day.get(day, 0.0)
        days.append(day)
        cumulative.append(running)

    spent_so_far = running
    if spent_so_far == 0:
        return {
            "available":    False,
            "reason":       "No spending recorded this month yet",
            "days_tracked": current_day,
        }

    X = np.array(days, dtype=float).reshape(-1, 1)
    y = np.array(cumulative, dtype=float)

    model = LinearRegression()
    model.fit(X, y)

    raw_forecast = float(model.predict([[days_in_month]])[0])
    forecast     = max(raw_forecast, spent_so_far)   # can't be less than already spent

    r2            = float(model.score(X, y))
    slope         = float(model.coef_[0])
    daily_average = spent_so_far / current_day
    days_left     = days_in_month - current_day

    # Confidence based on R²
    confidence = "high" if r2 >= 0.85 else "medium" if r2 >= 0.55 else "low"

    # Trend: compare regression slope to simple average pace
    expected_slope = spent_so_far / current_day
    if slope > expected_slope * 1.25:
        trend = "accelerating"
        trend_label = "spending is picking up"
    elif slope < expected_slope * 0.75:
        trend = "decelerating"
        trend_label = "spending is slowing down"
    else:
        trend = "steady"
        trend_label = "spending is steady"

    result: Dict[str, Any] = {
        "available":      True,
        "forecast":       round(forecast),
        "spent_so_far":   round(spent_so_far),
        "daily_average":  round(daily_average),
        "days_left":      days_left,
        "confidence":     confidence,
        "trend":          trend,
        "trend_label":    trend_label,
        "r2":             round(r2, 3),
    }

    if budget is not None and budget > 0:
        variance = round(forecast - budget)
        result["budget"]       = round(budget)
        result["over_budget"]  = forecast > budget
        result["variance"]     = variance         # positive = over, negative = under
        result["pct_of_budget"] = round((forecast / budget) * 100, 1)

    return result
