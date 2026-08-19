// Fills goals in the order given, capped at what each still needs so nothing is over-funded.

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
