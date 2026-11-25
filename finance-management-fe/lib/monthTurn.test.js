import { describe, it, expect } from 'vitest';
import { isMonthTurn, dayOfMonthIn } from './monthTurn';

describe('isMonthTurn', () => {
  it('opens at local midnight on the 1st in a zone ahead of UTC', () => {
    expect(isMonthTurn(new Date('2026-11-30T16:59:00Z'), 'Asia/Jakarta')).to.equal(false);
    expect(isMonthTurn(new Date('2026-11-30T17:00:00Z'), 'Asia/Jakarta')).to.equal(true);
  });

  it('stays closed in a zone behind UTC while UTC has already turned the month', () => {
    const instant = new Date('2026-12-01T03:00:00Z');
    expect(dayOfMonthIn(instant, 'UTC')).to.equal(1);
    expect(isMonthTurn(instant, 'America/Los_Angeles')).to.equal(false);
    expect(isMonthTurn(new Date('2026-12-01T08:00:00Z'), 'America/Los_Angeles')).to.equal(true);
  });

  it('shows through the 7th and closes at local midnight going into the 8th', () => {
    expect(isMonthTurn(new Date('2026-12-07T16:59:00Z'), 'Asia/Jakarta')).to.equal(true);
    expect(isMonthTurn(new Date('2026-12-07T17:00:00Z'), 'Asia/Jakarta')).to.equal(false);
  });

  it('closes on a later local date even when UTC is still inside the window', () => {
    expect(isMonthTurn(new Date('2026-12-07T23:00:00Z'), 'Pacific/Auckland')).to.equal(false);
  });
});
