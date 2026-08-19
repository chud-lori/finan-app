const { expect } = require('chai');
const {
    seasonalContext,
    lookAhead,
    monthlyProfile,
    hijriSeasonMonths,
    isHijriSeasonMonth,
} = require('../helpers/seasonalRadar');

// `spikeMonth` gets `spikeExpense`, every other month `baseExpense`.
const buildSnapshots = (years, baseExpense, spikeMonth, spikeExpense) => {
    const out = [];
    for (const y of years) {
        for (let m = 1; m <= 12; m++) {
            out.push({
                yearMonth: `${y}-${String(m).padStart(2, '0')}`,
                expense: m === spikeMonth ? spikeExpense : baseExpense,
            });
        }
    }
    return out;
};

describe('helpers/seasonalRadar', () => {
    describe('Hijri static calendar (no external API)', () => {
        it('returns the bundled Ramadan/Lebaran spend months per year', () => {
            expect(hijriSeasonMonths(2026)).to.deep.equal([2, 3]);
            expect(isHijriSeasonMonth(2026, 3)).to.equal(true);
            expect(isHijriSeasonMonth(2026, 7)).to.equal(false);
            expect(hijriSeasonMonths(1999)).to.deep.equal([]); // unknown year → empty
        });
    });

    describe('monthlyProfile', () => {
        it('computes an overall baseline and per-month ratios, excluding the current month', () => {
            const snaps = buildSnapshots([2025, 2026], 1_000_000, 3, 3_000_000);
            const { baseline, byMonth, sampleMonths } = monthlyProfile(snaps, '2026-08');
            expect(sampleMonths).to.equal(23); // 24 months minus the excluded current one
            expect(byMonth[3].samples).to.equal(2);
            expect(byMonth[3].ratio).to.be.greaterThan(2); // March is ~2.5x the baseline
            expect(byMonth[7].ratio).to.be.lessThan(1);    // a flat month sits below baseline
            expect(baseline).to.be.greaterThan(0);
        });

        it('is empty for no usable history', () => {
            expect(monthlyProfile([]).sampleMonths).to.equal(0);
            expect(monthlyProfile([{ yearMonth: '2026-01', expense: 0 }]).sampleMonths).to.equal(0);
        });
    });

    describe('seasonalContext (anomaly-gate widening)', () => {
        it('flags a learned personal spike month and widens the gate', () => {
            const snaps = buildSnapshots([2025, 2026], 1_000_000, 3, 3_000_000);
            const ctx = seasonalContext(snaps, 2026, 3, '2026-08');
            expect(ctx.isSeasonal).to.equal(true);
            expect(ctx.source).to.equal('both'); // learned AND on the Hijri calendar
            expect(ctx.multiplier).to.be.greaterThan(1);
            expect(ctx.multiplier).to.be.at.most(2); // clamped
        });

        it('does not treat a normal month as seasonal', () => {
            const snaps = buildSnapshots([2025, 2026], 1_000_000, 3, 3_000_000);
            const ctx = seasonalContext(snaps, 2026, 7, '2026-08');
            expect(ctx.isSeasonal).to.equal(false);
            expect(ctx.multiplier).to.equal(1);
        });

        it('falls back to the Hijri prior when history is too thin (cold start)', () => {
            const thin = [
                { yearMonth: '2026-05', expense: 1_000_000 },
                { yearMonth: '2026-06', expense: 1_000_000 },
                { yearMonth: '2026-07', expense: 1_000_000 },
            ];
            const ctx = seasonalContext(thin, 2026, 2, '2026-08'); // Feb 2026 is Ramadan
            expect(ctx.isSeasonal).to.equal(true);
            expect(ctx.source).to.equal('hijri');
            expect(ctx.multiplier).to.be.greaterThan(1);
        });
    });

    describe('lookAhead (set-aside nudge)', () => {
        it('quotes a set-aside for a learned spike once a full year of history exists', () => {
            const snaps = buildSnapshots([2025, 2026], 1_000_000, 3, 3_000_000);
            const ahead = lookAhead(snaps, { year: 2026, month: 2 }, 2); // Feb → March is next
            expect(ahead).to.not.equal(null);
            expect(ahead.monthName).to.equal('March');
            expect(ahead.monthsAway).to.equal(1);
            expect(ahead.coldStart).to.equal(false);
            expect(ahead.suggestedSetAside).to.be.greaterThan(0);
        });

        it('gives a generic, numberless heads-up under a year of history', () => {
            const thin = [
                { yearMonth: '2026-05', expense: 1_000_000 },
                { yearMonth: '2026-06', expense: 1_000_000 },
                { yearMonth: '2026-07', expense: 1_000_000 },
            ];
            // Now Jan 2026 → Feb (Ramadan) is one month away
            const ahead = lookAhead(thin, { year: 2026, month: 1 }, 2);
            expect(ahead).to.not.equal(null);
            expect(ahead.coldStart).to.equal(true);
            expect(ahead.suggestedSetAside).to.equal(null);
        });

        it('returns null when nothing seasonal is coming up', () => {
            const snaps = buildSnapshots([2025, 2026], 1_000_000, 3, 3_000_000);
            // Now July → Aug/Sep, neither a spike nor on the Hijri calendar
            expect(lookAhead(snaps, { year: 2026, month: 7 }, 2)).to.equal(null);
        });
    });
});
