export const RECURRING_VOLATILITY = ['fixed', 'semi'];
export const STABLE_BASELINE_VOLATILITY = 'fixed';

const toAmount = (value) => (Number.isFinite(value) ? value : 0);

const restsOnOneTransaction = (count, volatility) =>
  count <= 1 && !RECURRING_VOLATILITY.includes(volatility);

const percentDescribesTheseTotals = (volatility) => volatility === STABLE_BASELINE_VOLATILITY;

export const describeCategorySpend = (category, { monthTotal = 0, materialityFloor = 0 } = {}) => {
  const count = Number.isFinite(category?.count) ? category.count : 0;
  const currentTotal = toAmount(category?.total);
  const previousTotal = toAmount(category?.prevTotal);
  const delta = Number.isFinite(category?.delta) ? category.delta : null;
  const volatility = category?.volatility;

  const isSinglePurchase = restsOnOneTransaction(count, volatility);
  const onPace = delta === 0;
  const moneyMoved = Math.abs(currentTotal - previousTotal);
  const isMaterial = monthTotal > 0 ? moneyMoved / monthTotal >= materialityFloor : true;

  const comparison = previousTotal > 0 && !onPace && isMaterial ? { previousTotal, currentTotal } : null;
  const isJudgeable = comparison !== null && delta !== null && !isSinglePurchase;

  return {
    count,
    isSinglePurchase,
    trend: isJudgeable ? (delta > 0 ? 'up' : 'down') : null,
    comparison,
    percent: isJudgeable && percentDescribesTheseTotals(volatility) ? delta : null,
  };
};

export const formatOccurrenceLabel = (count) => {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? 'One purchase' : `${count} purchases`;
};
