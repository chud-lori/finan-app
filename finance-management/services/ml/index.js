// In-process ML facade for category classification and smart insights.

const { classifyBatch } = require('./classifier');
const { detectAnomalies } = require('./anomaly');
const { forecastMonthSpend } = require('./forecast');

const analyze = ({ transactions, daily_totals, current_day, days_in_month, budget = null }) => {
  const anomalies = detectAnomalies(transactions || []);
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
