const { expect } = require('chai');
const { forecastMonthSpend } = require('../services/ml/forecast');

const days = (...amounts) => amounts.map((amount, i) => ({ day: i + 1, amount }));

describe('Month forecast', () => {
    it('withholds a forecast until there are enough days', () => {
        const res = forecastMonthSpend({ daily_totals: days(20, 30, 25), current_day: 3, days_in_month: 30 });
        expect(res.available).to.equal(false);
        expect(res.days_tracked).to.equal(3);
    });

    it('does not turn a bill already paid into a daily rate', () => {
        const paid = forecastMonthSpend({
            daily_totals: days(20, 920, 30, 30), // day 2 holds a 900 bill
            current_day: 4, days_in_month: 30, fixed_paid: 900,
        });

        // 100 of everyday spend over 4 days, carried across the 26 days left.
        expect(paid.daily_average).to.equal(25);
        expect(paid.forecast).to.equal(1650);

        const ignored = forecastMonthSpend({
            daily_totals: days(20, 920, 30, 30),
            current_day: 4, days_in_month: 30,
        });
        expect(ignored.forecast).to.equal(7500);
    });

    it('adds a bill that has not come due yet, once', () => {
        const res = forecastMonthSpend({
            daily_totals: days(20, 30, 25, 25),
            current_day: 4, days_in_month: 30, due_later: 900,
        });
        expect(res.due_later).to.equal(900);
        expect(res.forecast).to.equal(100 + 25 * 26 + 900);
    });

    it('counts a day with no spending as a day', () => {
        const res = forecastMonthSpend({
            daily_totals: [{ day: 1, amount: 40 }, { day: 4, amount: 40 }],
            current_day: 4, days_in_month: 30,
        });
        expect(res.daily_average).to.equal(20);
    });

    it('never forecasts less than what is already spent', () => {
        const res = forecastMonthSpend({
            daily_totals: days(0, 0, 0, 500),
            current_day: 4, days_in_month: 4, fixed_paid: 500,
        });
        expect(res.forecast).to.equal(500);
    });

    it('reads the direction from the halves of the month so far', () => {
        const up = forecastMonthSpend({
            daily_totals: days(10, 10, 10, 40, 40, 40), current_day: 6, days_in_month: 30,
        });
        expect(up.trend).to.equal('accelerating');

        const down = forecastMonthSpend({
            daily_totals: days(40, 40, 40, 10, 10, 10), current_day: 6, days_in_month: 30,
        });
        expect(down.trend).to.equal('decelerating');

        const flat = forecastMonthSpend({
            daily_totals: days(20, 20, 20, 20, 20, 20), current_day: 6, days_in_month: 30,
        });
        expect(flat.trend).to.equal('steady');
    });

    it('calls no direction at all in the first days of a month', () => {
        const res = forecastMonthSpend({ daily_totals: days(10, 10, 10, 90), current_day: 4, days_in_month: 30 });
        expect(res.trend).to.equal('early');
    });

    it('grows its confidence with the days it has seen', () => {
        const mk = (n) => forecastMonthSpend({
            daily_totals: Array.from({ length: n }, (_, i) => ({ day: i + 1, amount: 20 })),
            current_day: n, days_in_month: 30,
        }).confidence;

        expect(mk(5)).to.equal('low');
        expect(mk(9)).to.equal('medium');
        expect(mk(20)).to.equal('high');
    });

    it('measures the budget against the forecast', () => {
        const res = forecastMonthSpend({
            daily_totals: days(25, 25, 25, 25), current_day: 4, days_in_month: 30, budget: 500,
        });
        expect(res.forecast).to.equal(750);
        expect(res.over_budget).to.equal(true);
        expect(res.variance).to.equal(250);
        expect(res.pct_of_budget).to.equal(150);
    });
});
