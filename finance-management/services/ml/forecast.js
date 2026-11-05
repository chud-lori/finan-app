const MIN_DAYS = 4;
const TREND_MIN_DAYS = 6;

// A month is a recurring bill paid once plus everyday spending repeated daily.
// Projecting the two together is what made rent paid on the 2nd read as a rate
// and bill the user for it every remaining day of the month.
const forecastMonthSpend = ({
  daily_totals,
  current_day,
  days_in_month,
  budget = null,
  fixed_paid = 0,
  due_later = 0,
}) => {
  if (!Array.isArray(daily_totals) || daily_totals.length === 0 || current_day < MIN_DAYS) {
    return {
      available:    false,
      reason:       'Not enough data yet — check back after a few more days',
      days_tracked: current_day,
    };
  }

  const spendByDay = {};
  for (const d of daily_totals) spendByDay[d.day] = d.amount;
  const series = [];
  for (let day = 1; day <= current_day; day++) series.push(spendByDay[day] || 0);

  const spentSoFar = series.reduce((a, b) => a + b, 0);
  if (spentSoFar === 0) {
    return {
      available:    false,
      reason:       'No spending recorded this month yet',
      days_tracked: current_day,
    };
  }

  // Everyday spend is what is left once the month's recurring charges are set
  // aside; only that part repeats.
  const variableSpend = Math.max(spentSoFar - fixed_paid, 0);
  const pace = variableSpend / current_day;
  const daysLeft = days_in_month - current_day;
  const forecast = Math.max(spentSoFar + pace * daysLeft + due_later, spentSoFar);

  const confidence = current_day >= 14 ? 'high' : current_day >= 7 ? 'medium' : 'low';

  // Halves of the variable series, so a bill landing in one half cannot read as
  // a change of habit.
  let trend = 'early';
  let trendLabel = 'too early to call a direction';
  if (current_day >= TREND_MIN_DAYS) {
    const split = Math.floor(current_day / 2);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const earlier = mean(series.slice(0, split));
    const later = mean(series.slice(split));
    if (earlier === 0) {
      trend = later > 0 ? 'accelerating' : 'steady';
      trendLabel = later > 0 ? 'spending is picking up' : 'spending is steady';
    } else if (later > earlier * 1.25) { trend = 'accelerating'; trendLabel = 'spending is picking up'; }
    else if (later < earlier * 0.75)   { trend = 'decelerating'; trendLabel = 'spending is slowing down'; }
    else                               { trend = 'steady';       trendLabel = 'spending is steady'; }
  }

  const result = {
    available:     true,
    forecast:      Math.round(forecast),
    spent_so_far:  Math.round(spentSoFar),
    daily_average: Math.round(pace),
    fixed_paid:    Math.round(fixed_paid),
    due_later:     Math.round(due_later),
    days_left:     daysLeft,
    confidence,
    trend,
    trend_label:   trendLabel,
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
