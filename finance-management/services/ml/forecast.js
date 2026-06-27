// Linear-regression month-end spending forecast.
//
// Algorithm: fit a least-squares line on (day_number → cumulative_spend) for
// the elapsed days of the current month, then evaluate at days_in_month.
// R² serves as a confidence proxy. Slope vs simple-average pace determines
// trend (accelerating / steady / decelerating).

const MIN_DAYS = 4;

// Closed-form least squares on a list of (x, y) points.
// Returns { slope, intercept, r2 }. Variance is computed with the mean of y.
const fitLinear = (xs, ys) => {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  // R² = 1 - SSE / SST. SSE = sum((y - (slope*x + intercept))^2). When SST=0
  // (constant y), sklearn returns r2_score=1.0 if predictions match perfectly.
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    sse += (ys[i] - pred) ** 2;
  }
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  return { slope, intercept, r2 };
};

/**
 * @param {{daily_totals: Array<{day:number, amount:number}>, current_day:number, days_in_month:number, budget?:number|null}} payload
 * @returns {object} forecast
 */
const forecastMonthSpend = ({ daily_totals, current_day, days_in_month, budget = null }) => {
  if (!Array.isArray(daily_totals) || daily_totals.length === 0 || current_day < MIN_DAYS) {
    return {
      available:    false,
      reason:       'Not enough data yet — check back after a few more days',
      days_tracked: current_day,
    };
  }

  // Fill gaps with 0 and accumulate
  const spendByDay = {};
  for (const d of daily_totals) spendByDay[d.day] = d.amount;
  const days = [];
  const cumulative = [];
  let running = 0;
  for (let day = 1; day <= current_day; day++) {
    running += spendByDay[day] || 0;
    days.push(day);
    cumulative.push(running);
  }

  const spentSoFar = running;
  if (spentSoFar === 0) {
    return {
      available:    false,
      reason:       'No spending recorded this month yet',
      days_tracked: current_day,
    };
  }

  const { slope, intercept, r2 } = fitLinear(days, cumulative);

  // Predict at end of month, clamp ≥ spentSoFar
  const rawForecast = slope * days_in_month + intercept;
  const forecast = Math.max(rawForecast, spentSoFar);

  const dailyAverage = spentSoFar / current_day;
  const daysLeft = days_in_month - current_day;

  const confidence = r2 >= 0.85 ? 'high' : r2 >= 0.55 ? 'medium' : 'low';

  const expectedSlope = dailyAverage;
  let trend;
  let trendLabel;
  if (slope > expectedSlope * 1.25)      { trend = 'accelerating'; trendLabel = 'spending is picking up'; }
  else if (slope < expectedSlope * 0.75) { trend = 'decelerating'; trendLabel = 'spending is slowing down'; }
  else                                    { trend = 'steady';       trendLabel = 'spending is steady'; }

  const result = {
    available:     true,
    forecast:      Math.round(forecast),
    spent_so_far:  Math.round(spentSoFar),
    daily_average: Math.round(dailyAverage),
    days_left:     daysLeft,
    confidence,
    trend,
    trend_label:   trendLabel,
    r2:            Math.round(r2 * 1000) / 1000,
  };

  if (budget != null && budget > 0) {
    const variance = Math.round(forecast - budget);
    result.budget        = Math.round(budget);
    result.over_budget   = forecast > budget;
    result.variance      = variance;
    result.pct_of_budget = Math.round((forecast / budget) * 1000) / 10; // 1-dp
  }

  return result;
};

module.exports = { forecastMonthSpend };
