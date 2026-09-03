const PERCENT_CEILING = 200;
const PERCENT_ROUNDING_TOLERANCE = 1;

export const MATERIALITY_FLOOR = 0.02;

export const totalsAreComparable = ({ current, previous, delta }) => {
  if (!Number.isFinite(delta) || !(previous > 0)) return false;
  const ratioOfTheseTotals = Math.round(((current - previous) / previous) * 100);
  return Math.abs(ratioOfTheseTotals - delta) <= PERCENT_ROUNDING_TOLERANCE;
};

export const moneyAtStake = ({ current, previous, delta }) =>
  (totalsAreComparable({ current, previous, delta }) ? Math.abs(current - previous) : null);

export const formatChange = (delta) => {
  if (!Number.isFinite(delta)) return null;
  if (Math.abs(delta) < PERCENT_CEILING) return `${delta > 0 ? '+' : ''}${Math.round(delta)}%`;
  return `${(1 + delta / 100).toFixed(1)}×`;
};
