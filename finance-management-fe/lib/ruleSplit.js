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
  const totalExpense = Math.round(groups?.total ?? 0);

  const needs = g('essential');
  const wants = g('discretionary') + g('social');
  // The 'income' group only shows up here when an expense category was
  // classified as income — treat it as unclassified rather than guessing.
  const unclassified = g('other') + g('income');

  const surplus = incomeBasis - totalExpense;
  const savings = g('savings') + Math.max(surplus, 0);

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
