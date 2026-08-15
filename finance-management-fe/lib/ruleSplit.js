// 50/30/20 rule math, extracted from the Planner page so it can be unit-tested
// without pulling in React. Pure: category-group totals + an income basis in,
// buckets + percentages out.
//
//   needs   = essential
//   wants   = discretionary + social
//   savings = savings categories + this month's surplus (income − expense)
//
// The 'income' and 'other' groups are surfaced as `unclassified` rather than
// forced into a bucket — guessing there would skew the split.

export const RULE_TARGETS = { needs: 50, wants: 30, savings: 20 };

export const buildRuleSplit = (groups, incomeBasis) => {
  const g = (k) => Math.round(groups?.[k] ?? 0);

  const needs = g('essential');
  const wants = g('discretionary') + g('social');
  // The 'income' group only shows up here when an expense category was
  // classified as income — treat it as unclassified rather than guessing.
  const unclassified = g('other') + g('income');

  // Money the user deliberately moved to a savings-group category (reksa dana,
  // a deposit, DCA). Recorded as an expense so the balance decrements, but it is
  // saved, not consumed.
  const savingsGroup = g('savings');

  // Everything that actually left as consumption — savings-group outflow is NOT
  // part of this.
  const nonSavingsExpense = needs + wants + unclassified;

  // Idle cash: income minus BOTH real spend and the savings-group outflow
  // (i.e. income − total outflow). This is the double-count guard: computing the
  // surplus against nonSavingsExpense alone would let the invested amount lift
  // the surplus AND get added again on the next line — counting it twice. By
  // subtracting savingsGroup here, each rupiah lands in exactly one place:
  // invested money in `savingsGroup`, unspent money in the surplus.
  const surplus = incomeBasis - nonSavingsExpense - savingsGroup;

  // Report shape preserved: total outflow (consumption + savings transfer).
  const totalExpense = nonSavingsExpense + savingsGroup;

  const savings = savingsGroup + Math.max(surplus, 0);

  const pct = (v) => (incomeBasis > 0 ? Math.round((v / incomeBasis) * 100) : 0);

  return {
    incomeBasis, totalExpense, surplus, unclassified,
    overspent: surplus < 0 ? -surplus : 0,
    buckets: [
      { key: 'needs',   amount: needs,   pct: pct(needs)   },
      { key: 'wants',   amount: wants,   pct: pct(wants)   },
      { key: 'savings', amount: savings, pct: pct(savings) },
    ],
    unclassifiedPct: pct(unclassified),
  };
};
