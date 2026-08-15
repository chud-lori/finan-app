/**
 * Zakat-maal (wealth zakat) planning ESTIMATE — NOT a fatwa.
 *
 * The common ruling: 2.5% of qualifying wealth that has been held for one lunar
 * year (haul) and sits above the nisab threshold is due as zakat. This helper is
 * a rough planning aid only:
 *   - it does NOT track haul (how long each asset has been held),
 *   - it uses a simplified zakatable base, and
 *   - nisab (which tracks the gold/silver price) is an optional caller input.
 * The nuance is exactly why the UI must label the output an estimate and point
 * users to a scholar for anything binding.
 *
 * Zakatable base ≈ liquid / monetary wealth (cash + investments + money owed to
 * you) minus short-term debts. Illiquid personal-use assets — the home you live
 * in, your personal vehicle — are excluded, as they are not zakatable under the
 * common rulings. Pure and dependency-free.
 */
const ZAKAT_RATE = 0.025;

// NetWorth holding types that count toward the zakatable base.
const ZAKATABLE_ASSET_TYPES     = ['cash', 'investment', 'receivable'];
// Short-term / consumer debts deducted from the base.
const DEDUCTIBLE_LIABILITY_TYPES = ['credit_card', 'bnpl', 'payable', 'loan'];

const sumByType = (rows, types) => (rows || [])
    .filter(r => r && types.includes(r.type))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

/**
 * @param {{assets?:Array, liabilities?:Array}} holdings  NetWorth holdings
 * @param {number} givingYtd  social-group giving recorded so far this year
 * @param {number|null} nisab  optional nisab threshold in the user's currency
 */
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
