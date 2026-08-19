// 'income' and 'other' are surfaced as `unclassified` rather than forced into a bucket.

export const RULE_TARGETS = { needs: 50, wants: 30, savings: 20 };

export const buildRuleSplit = (groups, incomeBasis) => {
  const g = (k) => Math.round(groups?.[k] ?? 0);

  const needs = g('essential');
  const wants = g('discretionary') + g('social');
  const unclassified = g('other') + g('income');

  // Recorded as an expense so the balance decrements, but it is saved, not consumed.
  const savingsGroup = g('savings');

  const nonSavingsExpense = needs + wants + unclassified;

  // Subtract savingsGroup too: against nonSavingsExpense alone the invested amount would be counted twice.
  const surplus = incomeBasis - nonSavingsExpense - savingsGroup;

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
