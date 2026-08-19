// An ESTIMATE, not a fatwa: haul is not tracked, so the UI must label it as such.
const ZAKAT_RATE = 0.025;

// NetWorth holding types that count toward the zakatable base.
const ZAKATABLE_ASSET_TYPES     = ['cash', 'emergency_fund', 'investment', 'receivable'];
// Short-term / consumer debts deducted from the base.
const DEDUCTIBLE_LIABILITY_TYPES = ['credit_card', 'bnpl', 'payable', 'loan'];

const sumByType = (rows, types) => (rows || [])
    .filter(r => r && types.includes(r.type))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

const estimateZakat = (holdings, givingYtd = 0, nisab = null) => {
    const zakatableAssets = sumByType(holdings && holdings.assets, ZAKATABLE_ASSET_TYPES);
    const deductibleDebts = sumByType(holdings && holdings.liabilities, DEDUCTIBLE_LIABILITY_TYPES);
    const zakatableBase   = Math.max(zakatableAssets - deductibleDebts, 0);

    const hasNisab   = typeof nisab === 'number' && Number.isFinite(nisab) && nisab > 0;
    const meetsNisab = hasNisab ? zakatableBase >= nisab : null;

    // Below an explicit nisab → nothing is due (still surface the figure for transparency).
    const zakatDue = meetsNisab === false ? 0 : Math.round(zakatableBase * ZAKAT_RATE);

    const given     = Math.max(Math.round(givingYtd || 0), 0);
    const remaining = Math.max(zakatDue - given, 0);
    const coverage  = zakatDue > 0
        ? Math.min(Math.round((given / zakatDue) * 100), 100)
        : (given > 0 ? 100 : 0);

    return {
        zakatableAssets: Math.round(zakatableAssets),
        deductibleDebts: Math.round(deductibleDebts),
        zakatableBase:   Math.round(zakatableBase),
        rate:            ZAKAT_RATE,
        zakatDue,
        givingYtd:       given,
        remaining,
        coverage,
        nisab:           hasNisab ? Math.round(nisab) : null,
        meetsNisab,
    };
};

module.exports = {
    estimateZakat,
    sumByType,
    ZAKAT_RATE,
    ZAKATABLE_ASSET_TYPES,
    DEDUCTIBLE_LIABILITY_TYPES,
};
