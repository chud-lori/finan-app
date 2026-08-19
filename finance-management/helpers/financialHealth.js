// Unmeasurable pillars are dropped and the remaining weights renormalized, so a new user isn't scored zero.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

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

const computeFinancialHealth = (m = {}) => {
  const raw = {
    savings:   m.savingsRate == null ? null : clamp01(m.savingsRate / 0.20),
    emergency: m.emergencyMonths == null ? null : clamp01(m.emergencyMonths / 6),
    budget:    m.budgetPaceRatio == null ? null : clamp01(1 - Math.max(0, m.budgetPaceRatio - 1)),
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
