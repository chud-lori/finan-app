// Pure decisions behind the Insights cash-flow card, kept out of the component so the arithmetic is testable.

const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);

export function runwayBreakdown(runway) {
  if (!runway || runway.safeToSpend == null) return null;
  const payday = runway.mode === 'payday';
  const bills = runway.billsBeforeIncome?.length ?? 0;
  const rows = [
    { key: 'balance', label: 'Balance now', amount: runway.currentBalance ?? 0 },
    {
      key: 'bills',
      label: payday ? 'Bills before payday' : 'Upcoming bills',
      detail: bills ? `${bills} bill${bills === 1 ? '' : 's'}` : 'none expected',
      amount: -(runway.billsTotal ?? 0),
    },
  ];
  if (payday) {
    rows.push({
      key: 'pace',
      label: 'Everyday spending',
      days: runway.daysUntilIncome,
      perDay: runway.discretionaryDaily,
      amount: -((runway.discretionaryDaily ?? 0) * (runway.daysUntilIncome ?? 0)),
    });
  }
  return { rows, total: runway.safeToSpend, reconciles: sum(rows) === runway.safeToSpend };
}

// The pace row is the remainder, because the forecast rounds its displayed pace but not the one it projected with.
export function forecastBreakdown(forecast) {
  if (!forecast?.available) return null;
  const due = forecast.due_later ?? 0;
  const rows = [
    { key: 'spent', label: 'Spent so far', amount: forecast.spent_so_far },
    {
      key: 'pace',
      label: 'Everyday pace',
      days: forecast.days_left,
      perDay: forecast.daily_average,
      amount: forecast.forecast - forecast.spent_so_far - due,
    },
  ];
  if (due > 0) rows.push({ key: 'due', label: 'Bills still due', amount: due });
  return { rows, total: forecast.forecast };
}

export function budgetStatus(forecast) {
  if (!forecast?.available || forecast.budget == null) return null;
  const pct = (v) => Math.min(Math.max((v / forecast.budget) * 100, 0), 100);
  return {
    budget: forecast.budget,
    over: !!forecast.over_budget,
    gap: Math.abs(forecast.variance ?? forecast.forecast - forecast.budget),
    spentPct: pct(forecast.spent_so_far),
    projectedPct: pct(forecast.forecast),
  };
}

// One row per bill with every date it is expected in the window, so the assumption reads as a schedule.
export function billSchedule(bills) {
  const byMerchant = new Map();
  for (const b of bills || []) {
    const row = byMerchant.get(b.merchant) ?? { merchant: b.merchant, dates: [], total: 0 };
    row.dates.push(b.date);
    row.total += b.amount;
    byMerchant.set(b.merchant, row);
  }
  return [...byMerchant.values()];
}
