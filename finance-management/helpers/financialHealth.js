// Financial Health Score — a single 0-100 gauge built from the four pillars
// consumer-finance research consistently uses: how much you save, whether you
// hold an emergency buffer, whether you stay within budget, and progress toward
// goals. (Mirrors the FinHealth Network spend/save/plan framing and the classic
// 50/30/20 + 3–6-month-emergency-fund targets.)
//
// Each pillar scores 0..1 against a target, then they combine by weight. Pillars
// that can't be measured for this user (no income logged, no budget set, no
// goals) are dropped and the remaining weights renormalized — so a new user
// isn't punished with a zero for data they simply haven't entered yet.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// key, label, weight, and the target that scores 1.0.
const PILLARS = [
  { key: 'savings',   label: 'Savings rate',   weight: 0.30 },
  { key: 'emergency', label: 'Emergency fund', weight: 0.30 },
  { key: 'budget',    label: 'Budget',         weight: 0.20 },
  { key: 'goals',     label: 'Goals',          weight: 0.20 },
];

const bandFor = (score) => {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'healthy';
  if (score >= 40) return 'building';
  return 'needs_attention';
};

/**
 * @param {{
 *   savingsRate?: number|null,      fraction of income kept (0.2 = 20% saved). null if no income.
 *   emergencyMonths?: number|null,  balance ÷ avg monthly expense. null if no expense history.
 *   budgetPaceRatio?: number|null,  spent-so-far ÷ expected-by-now this month. null if no budget.
 *   avgGoalProgress?: number|null,  mean savedAmount/price across active goals (0..1). null if none.
 * }} m
 * @returns {{ score: number|null, band: string|null, components: Array }}
 */
const computeFinancialHealth = (m = {}) => {
  const raw = {
    // 20% savings rate = full marks; negative savings = 0.
    savings:   m.savingsRate == null ? null : clamp01(m.savingsRate / 0.20),
    // 6 months of expenses = full marks.
    emergency: m.emergencyMonths == null ? null : clamp01(m.emergencyMonths / 6),
    // On or under pace = full; scales to 0 as spend reaches 2× the expected pace.
    budget:    m.budgetPaceRatio == null ? null : clamp01(1 - Math.max(0, m.budgetPaceRatio - 1)),
    // Average progress across active goals.
    goals:     m.avgGoalProgress == null ? null : clamp01(m.avgGoalProgress),
  };

  const available = PILLARS.filter((p) => raw[p.key] != null);
  const components = PILLARS.map((p) => ({
    key: p.key,
    label: p.label,
    weight: p.weight,
    available: raw[p.key] != null,
    score: raw[p.key] == null ? null : Math.round(raw[p.key] * 100),
  }));

  if (available.length === 0) return { score: null, band: null, components };

  const totalWeight = available.reduce((s, p) => s + p.weight, 0);
  const weighted = available.reduce((s, p) => s + p.weight * raw[p.key], 0);
  const score = Math.round((weighted / totalWeight) * 100);

  return { score, band: bandFor(score), components };
};

module.exports = { computeFinancialHealth, bandFor };
