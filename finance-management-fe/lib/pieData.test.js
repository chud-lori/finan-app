import { describe, it, expect } from 'vitest';
import { buildPieData } from './pieData';

const cats = (n, total = 100) =>
  Array.from({ length: n }, (_, i) => ({ category: `cat${i}`, total }));

describe('pieData — buildPieData', () => {
  it('keeps every category when there are 12 or fewer', () => {
    const data = buildPieData(cats(12));
    expect(data).to.have.lengthOf(12);
    expect(data.some(d => d.other)).to.equal(false);
  });

  it('folds the tail into one "Other" slice past the cut', () => {
    const data = buildPieData(cats(20, 50));
    expect(data).to.have.lengthOf(13);
    expect(data[12].name).to.equal('Other (8)');
    expect(data[12].value).to.equal(400); // 8 × 50
    expect(data[12].other).to.equal(true);
  });

  // The bug: the legend divided by the total of ALL categories while recharts
  // normalises the arc over the slices it was handed, so with 13+ categories the
  // label undercounted the arc and the legend summed to less than 100%.
  it('labels each slice with its share of the drawn ring, which is total spending', () => {
    const categories = cats(20, 50);
    const grandTotal = categories.reduce((s, c) => s + c.total, 0);
    const data       = buildPieData(categories);

    const drawnTotal = data.reduce((s, d) => s + d.value, 0);
    expect(drawnTotal).to.equal(grandTotal); // nothing dropped off the ring

    data.forEach(d => {
      expect(d.pct).to.equal(Math.round((d.value / drawnTotal) * 100));
    });
    expect(data.reduce((s, d) => s + d.pct, 0)).to.equal(100);
  });

  it('does not add an empty "Other" slice when the tail sums to zero', () => {
    const data = buildPieData([...cats(12), { category: 'zero', total: 0 }]);
    expect(data).to.have.lengthOf(12);
  });

  it('handles empty / missing input', () => {
    expect(buildPieData([])).to.deep.equal([]);
    expect(buildPieData(undefined)).to.deep.equal([]);
    expect(buildPieData([{ category: 'a', total: 0 }])).to.deep.equal([{ name: 'a', value: 0, pct: 0 }]);
  });
});

describe('buildPieData — Other roll-up members', () => {
  const cats = Array.from({ length: 20 }, (_, i) => ({ category: `c${i}`, total: 100 - i }));

  it('carries the names it folds in so the slice can drill down', () => {
    const other = buildPieData(cats).find(d => d.other);
    expect(other).to.exist;
    expect(other.members).to.have.lengthOf(8);
    expect(other.members).to.deep.equal(cats.slice(12).map(c => c.category));
  });

  it('leaves no roll-up when nothing is folded in', () => {
    expect(buildPieData(cats.slice(0, 12)).some(d => d.other)).to.equal(false);
  });
});
