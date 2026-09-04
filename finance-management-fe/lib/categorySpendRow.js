import { MATERIALITY_FLOOR } from '@/lib/insightFeed';

const PERCENT_CEILING = 200;
const PERCENT_ROUNDING_TOLERANCE = 1;

export const totalsAreComparable = ({ current, previous, delta }) => {
  if (!Number.isFinite(delta) || !(previous > 0)) return false;
  const ratioOfTheseTotals = Math.round(((current - previous) / previous) * 100);
  return Math.abs(ratioOfTheseTotals - delta) <= PERCENT_ROUNDING_TOLERANCE;
};

export const moneyAtStake = ({ current, previous, delta }) =>
  (totalsAreComparable({ current, previous, delta }) ? Math.abs(current - previous) : null);

export const formatPercentLabel = (delta) => {
  if (!Number.isFinite(delta)) return null;
  if (Math.abs(delta) < PERCENT_CEILING) return `${delta > 0 ? '+' : ''}${Math.round(delta)}%`;
  return `${(1 + delta / 100).toFixed(1)}\u00d7`;
};

const RECURRING_VOLATILITY = ['fixed', 'semi'];
const IRREGULAR_VOLATILITY = 'flexible';

const toAmount = (value) => (Number.isFinite(value) ? value : 0);

const restsOnOneTransaction = (count, volatility) =>
  count === 1 && volatility === IRREGULAR_VOLATILITY;

export const describeCategorySpend = (category, explain) => {
  const count = Number.isFinite(category?.count) ? category.count : 0;
  const currentTotal = toAmount(category?.total);
  const previousTotal = toAmount(category?.prevTotal);
  const delta = Number.isFinite(category?.delta) ? category.delta : null;

  const change = { current: currentTotal, previous: previousTotal, delta };
  const periodsAlign = totalsAreComparable(change);
  const stake = moneyAtStake(change);

  const isSinglePurchase = restsOnOneTransaction(count, category?.volatility);
  const onPace = delta === 0;
  const floor = MATERIALITY_FLOOR.of(explain);
  const belowFloor = stake !== null && floor > 0 && stake < floor;

  const comparison = previousTotal > 0 && !onPace && !belowFloor
    ? { previousTotal, currentTotal, periodsAlign }
    : null;
  const isJudgeable = comparison !== null && periodsAlign && !isSinglePurchase;

  return {
    count,
    isSinglePurchase,
    isOnPace: onPace && previousTotal > 0,
    trend: isJudgeable ? (delta > 0 ? 'up' : 'down') : null,
    comparison,
    percent: isJudgeable ? delta : null,
  };
};

export const formatOccurrenceLabel = (count, volatility) => {
  if (!Number.isFinite(count) || count <= 0) return null;
  const recurring = RECURRING_VOLATILITY.includes(volatility);
  if (recurring && count === 1) return null;
  if (count === 1) return 'One purchase';
  return `${count} ${recurring ? 'charges' : 'purchases'}`;
};
