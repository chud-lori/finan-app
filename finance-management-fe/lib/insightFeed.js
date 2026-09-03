const PERCENT_CEILING = 200;

export const MATERIALITY_FLOOR = 0.02;

export const formatChange = (delta) => {
  if (!Number.isFinite(delta)) return null;
  if (Math.abs(delta) < PERCENT_CEILING) return `${delta > 0 ? '+' : ''}${Math.round(delta)}%`;
  return `${(1 + delta / 100).toFixed(1)}×`;
};
