// Windfall split suggestion, extracted from the Planner page so it can be
// unit-tested without React. Pure: an amount + a list of goals in, a per-goal
// suggested allocation out.
//
// Strategy: fill goals in the order given (the caller passes them oldest-first),
// giving each goal at most what it still needs (price − savedAmount) so nothing
// is over-funded, until the windfall runs out. Whatever is left over is reported
// so the UI can show "unallocated".

export const remainingNeed = (goal) =>
  Math.max((Number(goal?.price) || 0) - (Number(goal?.savedAmount) || 0), 0);

export const suggestSplit = (amount, goals) => {
  let left = Math.max(Math.round(Number(amount)) || 0, 0);
  const split = {};
  for (const g of goals || []) {
    if (left <= 0) break;
    const need = remainingNeed(g);
    if (need <= 0) continue;
    const give = Math.min(need, left);
    split[g.id] = give;
    left -= give;
  }
  return { split, leftover: left };
};
