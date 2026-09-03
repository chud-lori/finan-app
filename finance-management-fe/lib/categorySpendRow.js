export const RECURRING_VOLATILITY = ['fixed', 'semi'];
export const STABLE_BASELINE_VOLATILITY = 'fixed';
export const MAX_READABLE_PERCENT = 200;

const toAmount = (value) => (Number.isFinite(value) ? value : 0);

const restsOnOneTransaction = (count, volatility) =>
  count <= 1 && !RECURRING_VOLATILITY.includes(volatility);

const percentDescribesTheseTotals = (volatility) => volatility === STABLE_BASELINE_VOLATILITY;

const readsAsQuantity = (percent) => Math.abs(percent) < MAX_READABLE_PERCENT;

export const describeCategorySpend = (category) => {
  const count = Number.isFinite(category?.count) ? category.count : 0;
  const currentTotal = toAmount(category?.total);
  const previousTotal = toAmount(category?.prevTotal);
  const delta = Number.isFinite(category?.delta) ? category.delta : null;
  const volatility = category?.volatility;

  const isSinglePurchase = restsOnOneTransaction(count, volatility);
  const departsFromLastMonth = delta !== null && delta !== 0 && !isSinglePurchase;
  const trend = departsFromLastMonth ? (delta > 0 ? 'up' : 'down') : null;
  const worthShowing = isSinglePurchase || departsFromLastMonth;

  return {
    count,
    isSinglePurchase,
    trend,
    comparison: worthShowing && previousTotal > 0 ? { previousTotal, currentTotal } : null,
    percent: departsFromLastMonth && percentDescribesTheseTotals(volatility) && readsAsQuantity(delta) ? delta : null,
  };
};

export const formatOccurrenceLabel = (count) => {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? 'One purchase' : `${count} purchases`;
};
