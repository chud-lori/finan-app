
const { classifyBatch } = require('./classifier');
const { detectAnomalies } = require('./anomaly');
const { forecastMonthSpend } = require('./forecast');

const analyze = ({ transactions, daily_totals, current_day, days_in_month, budget = null, seasonal = null }) => {
  const anomalies = detectAnomalies(transactions || [], { seasonal });
  const forecast = forecastMonthSpend({
    daily_totals: daily_totals || [],
    current_day,
    days_in_month,
    budget,
  });
  return {
    anomalies,
    anomaly_count: anomalies.length,
    forecast,
  };
};

module.exports = { classifyBatch, analyze };
