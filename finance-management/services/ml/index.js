
const { classifyBatch } = require('./classifier');
const { detectAnomalies } = require('./anomaly');
const { forecastMonthSpend } = require('./forecast');
const { detectRecurring } = require('./recurring');

// Recurring charges already posted this month are set aside from the forecast's
// daily pace; the ones still due are added back once.
const splitRecurringForMonth = (entries, asOf) => {
  const month = asOf.slice(0, 7);
  let fixedPaid = 0;
  let dueLater = 0;
  for (const r of entries) {
    if (String(r.lastDate || '').startsWith(month)) fixedPaid += r.typicalAmount;
    if (String(r.nextDue || '').startsWith(month) && r.nextDue >= asOf) dueLater += r.typicalAmount;
  }
  return { fixedPaid, dueLater };
};

const analyze = ({
  transactions,
  daily_totals,
  current_day,
  days_in_month,
  budget = null,
  seasonal = null,
  as_of = null,
  utility_categories = null,
}) => {
  const txns = transactions || [];
  const anomalies = detectAnomalies(txns, { seasonal });

  let fixedPaid = 0;
  let dueLater = 0;
  if (as_of) {
    // Savings transfers are not spend, so they must not reach the forecast
    // through the recurring detector either.
    const spending = txns.filter(t => !t.is_savings);
    const { recurring } = detectRecurring(spending, { asOf: as_of, utilityCategories: utility_categories });
    ({ fixedPaid, dueLater } = splitRecurringForMonth(recurring, as_of));
  }

  const forecast = forecastMonthSpend({
    daily_totals: daily_totals || [],
    current_day,
    days_in_month,
    budget,
    fixed_paid: fixedPaid,
    due_later: dueLater,
  });
  return {
    anomalies,
    anomaly_count: anomalies.length,
    forecast,
  };
};

module.exports = { classifyBatch, analyze };
