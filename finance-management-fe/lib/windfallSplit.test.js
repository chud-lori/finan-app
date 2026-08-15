import { describe, it, expect } from 'vitest';
import { suggestSplit, remainingNeed } from './windfallSplit';

describe('windfallSplit — suggestSplit', () => {
  const goals = [
    { id: 'a', price: 5_000_000, savedAmount: 1_000_000 }, // needs 4,000,000
    { id: 'b', price: 3_000_000, savedAmount: 0 },          // needs 3,000,000
    { id: 'c', price: 2_000_000, savedAmount: 2_000_000 },  // already full
  ];

  it('fills goals in order, capped at each goal\'s remaining need', () => {
    const { split, leftover } = suggestSplit(6_000_000, goals);
    expect(split.a).to.equal(4_000_000); // fully covers goal a's need
    expect(split.b).to.equal(2_000_000); // remaining windfall goes to b
    expect(split.c).to.be.undefined;      // already funded — skipped
    expect(leftover).to.equal(0);
  });

  it('reports leftover when the windfall exceeds every goal\'s need', () => {
    const { split, leftover } = suggestSplit(20_000_000, goals);
    expect(split.a).to.equal(4_000_000);
    expect(split.b).to.equal(3_000_000);
    expect(leftover).to.equal(13_000_000); // nothing over-funded
  });

  it('over-funds nothing and returns the whole amount as leftover when all goals are full', () => {
    const { split, leftover } = suggestSplit(1_000_000, [{ id: 'c', price: 2_000_000, savedAmount: 2_000_000 }]);
    expect(split).to.deep.equal({});
    expect(leftover).to.equal(1_000_000);
  });

  it('handles a zero / invalid amount safely', () => {
    expect(suggestSplit(0, goals)).to.deep.equal({ split: {}, leftover: 0 });
    expect(suggestSplit(NaN, goals)).to.deep.equal({ split: {}, leftover: 0 });
  });

  it('remainingNeed never goes negative', () => {
    expect(remainingNeed({ price: 1000, savedAmount: 5000 })).to.equal(0);
    expect(remainingNeed({ price: 5000, savedAmount: 1000 })).to.equal(4000);
  });
});
