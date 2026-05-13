// Native ML facade — drop-in replacement for the Python AI service.
//
// Exposes:
//   classifyBatch(names)            ↔ POST /classify  on Python service
//   analyze(payload)                ↔ POST /analyze   on Python service
//
// Response shapes match the Python service exactly so call sites can switch
// between native and HTTP without conditional shape handling downstream.

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
