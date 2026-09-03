const magnitude = (n) => Math.abs(Number(n) || 0);

export const isMaterial = (amount, floor = 0) => {
  const size = magnitude(amount);
  return size > 0 && size >= magnitude(floor);
};

export const describeChange = ({ current, baseline, floor = 0 }) => {
  const to = Number(current);
  const from = Number(baseline);
  const comparable = current != null && baseline != null && Number.isFinite(to) && Number.isFinite(from);
  const change = comparable ? to - from : 0;
  const material = comparable && isMaterial(change, floor);
  return {
    material,
    change,
    from: comparable ? from : null,
    to: comparable ? to : null,
    direction: !material ? 'flat' : change > 0 ? 'up' : 'down',
    percent: material && isMaterial(from, floor) ? Math.round((change / from) * 100) : null,
  };
};
