import { describe, it, expect } from 'vitest';
import { isMaterial, describeChange } from './materiality';

describe('materiality — isMaterial', () => {
  it('rejects a change smaller than the floor', () => {
    expect(isMaterial(4_000, 100_000)).to.equal(false);
    expect(isMaterial(-4_000, 100_000)).to.equal(false);
  });

  it('accepts a change at or above the floor, in either direction', () => {
    expect(isMaterial(100_000, 100_000)).to.equal(true);
    expect(isMaterial(-250_000, 100_000)).to.equal(true);
  });

  it('never treats "no change" as material, even with no floor', () => {
    expect(isMaterial(0, 0)).to.equal(false);
  });
});

describe('materiality — describeChange', () => {
  const floor = 100_000;

  it('leads with the money and keeps both before and after figures', () => {
    const c = describeChange({ current: 549_000, baseline: 68_000, floor });
    expect(c.material).to.equal(true);
    expect(c.change).to.equal(481_000);
    expect(c.from).to.equal(68_000);
    expect(c.to).to.equal(549_000);
    expect(c.direction).to.equal('up');
  });

  it('withholds the percentage when the baseline is below the floor', () => {
    const c = describeChange({ current: 549_000, baseline: 68_000, floor });
    expect(c.percent).to.equal(null);
  });

  it('keeps the percentage as context when the baseline is itself material', () => {
    const c = describeChange({ current: 6_000_000, baseline: 5_000_000, floor });
    expect(c.percent).to.equal(20);
  });

  it('marks an unchanged figure as immaterial so nothing is badged', () => {
    const c = describeChange({ current: 2_500_000, baseline: 2_500_000, floor });
    expect(c.material).to.equal(false);
    expect(c.direction).to.equal('flat');
    expect(c.percent).to.equal(null);
  });

  it('marks a change too small to move the month as immaterial', () => {
    const c = describeChange({ current: 2_507_800, baseline: 2_500_000, floor });
    expect(c.material).to.equal(false);
  });

  it('reports a drop as a downward change', () => {
    const c = describeChange({ current: 4_000_000, baseline: 5_000_000, floor });
    expect(c.direction).to.equal('down');
    expect(c.change).to.equal(-1_000_000);
    expect(c.percent).to.equal(-20);
  });

  it('is not comparable without a baseline', () => {
    const c = describeChange({ current: 4_000_000, baseline: null, floor });
    expect(c.material).to.equal(false);
    expect(c.from).to.equal(null);
  });
});
