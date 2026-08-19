import { describe, it, expect } from 'vitest';
import { buildMoneyFlow, layoutMoneyFlow, ribbonPath, MAX_LEAVES } from './moneyFlow';

const cat = (category, total, group) => ({ category, total, group });

// The whole point of the diagram: money in equals money out, and no leaf is
// reachable twice. Asserted on every scenario below rather than in one case.
const expectConservation = (flow) => {
  const leafSum  = flow.leaves.reduce((s, l) => s + l.value, 0);
  const groupSum = flow.groups.reduce((s, g) => s + g.value, 0);
  const srcSum   = flow.sources.reduce((s, x) => s + x.value, 0);

  expect(leafSum).to.equal(flow.totalIn);
  expect(groupSum).to.equal(flow.totalIn);
  expect(srcSum).to.equal(flow.totalIn);
  expect(flow.totalOut).to.equal(flow.totalIn);
  flow.groups.forEach((g) => {
    expect(g.leaves.reduce((s, l) => s + l.value, 0)).to.equal(g.value);
  });
  expect(new Set(flow.leaves.map((l) => l.key)).size).to.equal(flow.leaves.length);
};

describe('moneyFlow — buildMoneyFlow', () => {
  it('splits income into groups, categories and surplus', () => {
    const flow = buildMoneyFlow(
      [cat('rent', 400, 'essential'), cat('coffee', 100, 'discretionary'), cat('mutual fund', 200, 'savings')],
      { income: 1000, expense: 700 },
    );

    expect(flow.income).to.equal(1000);
    expect(flow.outflow).to.equal(700);
    expect(flow.surplus).to.equal(300);
    expect(flow.drawdown).to.equal(0);
    expect(flow.groups.map((g) => g.key)).to.deep.equal(['essential', 'discretionary', 'savings', 'surplus']);
    expectConservation(flow);
  });

  it('keeps savings as its own retained branch, never as consumption', () => {
    const flow = buildMoneyFlow([cat('rent', 400, 'essential'), cat('emas', 300, 'savings')], { income: 1000, expense: 700 });
    const savings = flow.groups.find((g) => g.key === 'savings');
    const surplus = flow.groups.find((g) => g.key === 'surplus');

    expect(savings.retained).to.equal(true);
    expect(surplus.retained).to.equal(true);
    expect(flow.groups.filter((g) => !g.retained).reduce((s, g) => s + g.value, 0)).to.equal(400);
    expect(savings.leaves.map((l) => l.name)).to.deep.equal(['emas']);
    expectConservation(flow);
  });

  it('income with no expense terminates entirely in surplus', () => {
    const flow = buildMoneyFlow([], { income: 500, expense: 0 });
    expect(flow.groups).to.have.lengthOf(1);
    expect(flow.leaves).to.deep.include({
      key: 'surplus:__leaf', name: 'Surplus', value: 500, members: [],
      group: 'surplus', color: '#34d399', retained: true,
    });
    expectConservation(flow);
  });

  it('funds a deficit month from a balance-drawdown source and still balances', () => {
    const flow = buildMoneyFlow([cat('rent', 900, 'essential')], { income: 400, expense: 900 });

    expect(flow.surplus).to.equal(0);
    expect(flow.drawdown).to.equal(500);
    expect(flow.totalIn).to.equal(900);
    expect(flow.sources.map((s) => s.key)).to.deep.equal(['income', 'drawdown']);
    expect(flow.groups.some((g) => g.key === 'surplus')).to.equal(false);
    expectConservation(flow);
  });

  it('handles savings outflow larger than income', () => {
    const flow = buildMoneyFlow([cat('deposito', 1200, 'savings')], { income: 300, expense: 1200 });
    expect(flow.drawdown).to.equal(900);
    expect(flow.groups.map((g) => g.key)).to.deep.equal(['savings']);
    expectConservation(flow);
  });

  it('buckets an unset, unknown or income group into "other"', () => {
    const flow = buildMoneyFlow(
      [cat('misc', 100), cat('weird', 50, 'not-a-group'), cat('bonus tax', 25, 'income')],
      { income: 1000, expense: 175 },
    );
    const other = flow.groups.find((g) => g.key === 'other');
    expect(other.value).to.equal(175);
    expect(flow.groups.some((g) => g.key === 'income')).to.equal(false);
    expectConservation(flow);
  });

  it('degrades an empty breakdown to one unlabelled branch instead of a wrong one', () => {
    const flow = buildMoneyFlow([], { income: 1000, expense: 600 });
    const leaf = flow.leaves.find((l) => l.name === 'Uncategorised');

    expect(flow.uncategorised).to.equal(600);
    expect(leaf.value).to.equal(600);
    expect(leaf.members).to.deep.equal([]); // opens nothing — there is no category behind it
    expect(flow.surplus).to.equal(400);
    expectConservation(flow);
  });

  it('absorbs a partial breakdown as the remainder, not as a rewritten total', () => {
    const flow = buildMoneyFlow([cat('rent', 400, 'essential')], { income: 1000, expense: 700 });
    expect(flow.uncategorised).to.equal(300);
    expect(flow.outflow).to.equal(700);
    expectConservation(flow);
  });

  it('treats a sub-0.1% gap as rounding, not as missing data', () => {
    const flow = buildMoneyFlow([cat('rent', 400_000, 'essential')], { income: 1_000_000, expense: 400_001 });
    expect(flow.uncategorised).to.equal(0);
    expect(flow.outflow).to.equal(400_000);
    expectConservation(flow);
  });

  it('ignores an expense total below the categories it is supposed to cover', () => {
    const flow = buildMoneyFlow([cat('rent', 400, 'essential')], { income: 1000, expense: 100 });
    expect(flow.outflow).to.equal(400);
    expectConservation(flow);
  });

  it('collapses the tail into a per-group "Other" and caps the leaf count', () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => cat(`e${i}`, 100 - i, 'essential')),
      ...Array.from({ length: 9 }, (_, i) => cat(`d${i}`, 90 - i, 'discretionary')),
    ];
    const flow = buildMoneyFlow(rows, { income: 5000, expense: rows.reduce((s, r) => s + r.total, 0) });
    const spendLeaves = flow.leaves.filter((l) => l.group !== 'surplus');

    expect(spendLeaves.length).to.be.at.most(MAX_LEAVES);
    expect(spendLeaves.filter((l) => l.other).length).to.be.greaterThan(0);
    flow.groups.forEach((g) => {
      const rolled = g.leaves.filter((l) => l.other);
      rolled.forEach((l) => {
        expect(l.name).to.equal(`Other (${l.members.length})`);
        expect(l.value).to.equal(rows.filter((r) => l.members.includes(r.category)).reduce((s, r) => s + r.total, 0));
      });
    });
    // Nothing moved between groups while collapsing.
    expect(flow.groups.find((g) => g.key === 'essential').value)
      .to.equal(rows.filter((r) => r.group === 'essential').reduce((s, r) => s + r.total, 0));
    expectConservation(flow);
  });

  it('names a one-member tail after the category instead of "Other (1)"', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => cat(`e${i}`, 100 - i, 'essential')),
      cat('lonely', 1, 'social'),
    ];
    const flow = buildMoneyFlow(rows, { income: 5000, expense: rows.reduce((s, r) => s + r.total, 0) });
    const social = flow.groups.find((g) => g.key === 'social');

    expect(social.leaves).to.have.lengthOf(1);
    expect(social.leaves[0].name).to.equal('lonely');
    expect(social.leaves[0].other).to.equal(undefined);
    expectConservation(flow);
  });

  it('keeps every category when it already fits under the cap', () => {
    const rows = Array.from({ length: 5 }, (_, i) => cat(`c${i}`, 100, 'essential'));
    const flow = buildMoneyFlow(rows, { income: 1000, expense: 500 });
    expect(flow.leaves.filter((l) => l.other)).to.have.lengthOf(0);
    expect(flow.leaves.map((l) => l.name)).to.include('c4');
    expectConservation(flow);
  });

  it('leaves the roll-up drillable by carrying the names it folds in', () => {
    const rows = Array.from({ length: 12 }, (_, i) => cat(`c${i}`, 120 - i, 'essential'));
    const flow = buildMoneyFlow(rows, { income: 5000, expense: rows.reduce((s, r) => s + r.total, 0) });
    const rolled = flow.leaves.find((l) => l.other);
    const named  = flow.leaves.filter((l) => !l.other && l.members.length).flatMap((l) => l.members);

    expect(new Set([...named, ...rolled.members]).size).to.equal(rows.length);
    expect(named.some((n) => rolled.members.includes(n))).to.equal(false); // no category on two leaves
  });

  it('is empty for a month with nothing in it', () => {
    const flow = buildMoneyFlow([], { income: 0, expense: 0 });
    expect(flow.isEmpty).to.equal(true);
    expect(flow.groups).to.have.lengthOf(0);
    expect(flow.leaves).to.have.lengthOf(0);
    expect(layoutMoneyFlow(flow)).to.equal(null);
  });

  it('survives junk input', () => {
    const flow = buildMoneyFlow(
      [null, { category: '', total: 50 }, { category: 'x', total: 'nope' }, cat('ok', 100, 'essential')],
      { income: null, expense: undefined },
    );
    expect(flow.outflow).to.equal(100);
    expect(flow.income).to.equal(0);
    expect(flow.drawdown).to.equal(100);
    expectConservation(flow);
  });

  it('conserves across a spread of random months', () => {
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const groups = ['essential', 'discretionary', 'social', 'savings', 'other', undefined];

    for (let i = 0; i < 200; i++) {
      const rows = Array.from({ length: rnd(14) }, (_, j) => cat(`c${j}`, rnd(500_000), groups[rnd(groups.length)]));
      const catSum = rows.reduce((s, r) => s + r.total, 0);
      const flow = buildMoneyFlow(rows, { income: rnd(2_000_000), expense: catSum + rnd(3) * rnd(80_000) });
      expectConservation(flow);
      expect(flow.leaves.filter((l) => l.group !== 'surplus').length).to.be.at.most(MAX_LEAVES);
    }
  });
});

describe('moneyFlow — layoutMoneyFlow', () => {
  const flow = buildMoneyFlow(
    [cat('rent', 400, 'essential'), cat('coffee', 100, 'discretionary'), cat('mutual fund', 200, 'savings')],
    { income: 1000, expense: 700 },
  );

  it('gives every node a pixel height proportional to its value', () => {
    const box = layoutMoneyFlow(flow, { width: 900 });
    const px  = box.leaves.reduce((s, l) => s + l.h, 0);
    const scale = box.leaves[0].h / flow.leaves[0].value;

    expect(px).to.be.closeTo(flow.totalIn * scale, 0.001);
    box.groups.forEach((g) => {
      expect(g.h).to.be.closeTo(g.value * scale, 0.001);
    });
    expect(box.sources.reduce((s, x) => s + x.h, 0)).to.be.closeTo(flow.totalIn * scale, 0.001);
  });

  it('fills its column exactly — the leaf stack spans the full height', () => {
    const box  = layoutMoneyFlow(flow, { width: 900 });
    const last = box.leaves[box.leaves.length - 1];
    expect(box.leaves[0].y).to.equal(0);
    expect(last.y + last.h).to.be.closeTo(box.height, 0.001);
  });

  it('matches each link to the node it lands on', () => {
    // Several leaves per group: with one leaf each the two columns share a gap
    // structure and a mis-assigned link would land on the right y by accident.
    const many = buildMoneyFlow(
      [cat('rent', 400, 'essential'), cat('food', 250, 'essential'), cat('coffee', 100, 'discretionary'),
        cat('gift', 60, 'social'), cat('mutual fund', 200, 'savings')],
      { income: 1500, expense: 1010 },
    );
    const box = layoutMoneyFlow(many, { width: 900 });
    box.links.filter((k) => k.leaf).forEach((k) => {
      const leaf = box.leaves.find((l) => l.key === k.leaf);
      expect(k.y1).to.equal(leaf.y);
      expect(k.h1).to.be.closeTo(leaf.h, 0.001);
    });
    box.groups.forEach((g) => {
      const incoming = box.links.find((k) => k.key === `in:${g.key}`);
      expect(incoming.y1).to.equal(g.y);
      expect(incoming.h1).to.be.closeTo(g.h, 0.001);
    });
  });

  it('leaves the source band continuous — no link straddles a gap', () => {
    const deficit = buildMoneyFlow([cat('rent', 900, 'essential'), cat('food', 300, 'essential')], { income: 400, expense: 1200 });
    const box = layoutMoneyFlow(deficit, { width: 900 });
    for (let i = 1; i < box.sources.length; i++) {
      expect(box.sources[i].y).to.be.closeTo(box.sources[i - 1].y + box.sources[i - 1].h, 0.001);
    }
    const inbound = box.links.filter((k) => !k.leaf);
    for (let i = 1; i < inbound.length; i++) {
      expect(inbound[i].y0).to.be.closeTo(inbound[i - 1].y0 + inbound[i - 1].h0, 0.001);
    }
  });

  it('never prints two group labels on top of each other', () => {
    const lopsided = buildMoneyFlow(
      [cat('rent', 500_000, 'essential'), cat('coffee', 40, 'discretionary'), cat('gift', 30, 'social'), cat('emas', 20, 'savings')],
      { income: 600_000, expense: 500_090 },
    );
    const box = layoutMoneyFlow(lopsided, { width: 900 });
    expect(box.groups.length).to.be.greaterThan(3);
    const shown = box.groups.filter(g => g.labelled);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i].labelY - shown[i - 1].labelY).to.be.at.least(11.999);
    }
    box.groups.filter(g => !g.labelled).forEach(g => expect(g.h).to.be.lessThan(12));
  });

  it('never prints two leaf labels on top of each other', () => {
    const thin = buildMoneyFlow(
      [cat('rent', 100_000, 'essential'), ...Array.from({ length: 6 }, (_, i) => cat(`t${i}`, 20 + i, 'discretionary'))],
      { income: 120_000 },
    );
    const box = layoutMoneyFlow(thin, { width: 900 });
    const shown = box.leaves.filter(l => l.labelled);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i].labelY - shown[i - 1].labelY).to.be.at.least(25.999);
    }
    box.leaves.filter(l => !l.labelled).forEach(l => expect(l.h).to.be.lessThan(26));
  });

  it('keeps the label lane inside the viewBox', () => {
    const box = layoutMoneyFlow(flow, { width: 900, labelLane: 214 });
    expect(box.labelX + box.labelLane).to.be.at.most(900 + 8);
    expect(box.leaves[0].x + box.nodeWidth).to.be.at.most(box.labelX);
  });

  it('emits a closed ribbon path', () => {
    const box = layoutMoneyFlow(flow, { width: 900 });
    const d   = ribbonPath(box.links[0]);
    expect(d.startsWith('M')).to.equal(true);
    expect(d.endsWith('Z')).to.equal(true);
    expect(d).to.not.match(/NaN|Infinity/);
  });
});

describe('layoutMoneyFlow — geometry a numeric assertion misses', () => {
  const flow = buildMoneyFlow([
      { category: 'rent', total: 4_000_000, group: 'essential' },
      { category: 'food', total: 1_500_000, group: 'essential' },
      { category: 'coffee', total: 800_000, group: 'discretionary' },
      { category: 'games', total: 400_000, group: 'discretionary' },
      { category: 'reksadana', total: 1_000_000, group: 'savings' },
    ], { income: 10_000_000 });
  const box = layoutMoneyFlow(flow);
  const outLinks = box.links.filter(k => k.leaf);

  it('starts each leaf ribbon at its own leaf, not at the group', () => {
    box.leaves.forEach(l => {
      const link = outLinks.find(k => k.leaf === l.key);
      expect(link.y1).to.equal(l.y);
      expect(link.h1).to.equal(l.h);
      expect(link.h0).to.equal(l.h);
    });
  });

  it('keeps every group ribbon inside its own group node', () => {
    box.groups.forEach(g => {
      const inbound = box.links.find(k => k.key === `in:${g.key}`);
      expect(inbound.y1).to.equal(g.y);
      expect(inbound.h1).to.equal(g.h);
      const own = outLinks.filter(k => k.leaf.startsWith(`${g.key}:`));
      const first = Math.min(...own.map(k => k.y0));
      const last = Math.max(...own.map(k => k.y0 + k.h0));
      expect(first).to.be.at.least(g.y - 0.001);
      expect(last).to.be.at.most(g.y + g.h + 0.001);
    });
  });

  it('leaves no gap in the source band — a straddling link means a mis-stacked column', () => {
    const inbound = box.links.filter(k => k.key.startsWith('in:')).sort((a, b) => a.y0 - b.y0);
    expect(inbound.length).to.be.greaterThan(1);
    for (let i = 1; i < inbound.length; i++) {
      expect(inbound[i].y0).to.be.closeTo(inbound[i - 1].y0 + inbound[i - 1].h0, 0.001);
    }
  });

  it('orders the columns left to right', () => {
    const groupX = box.groups[0].x;
    const leafX = box.leaves[0].x;
    expect(groupX).to.be.greaterThan(box.nodeWidth);
    expect(leafX).to.be.greaterThan(groupX + box.nodeWidth);
    expect(box.labelX).to.be.at.least(leafX + box.nodeWidth);
  });

  it('centres each column on the same band', () => {
    const span = (nodes) => {
      const top = Math.min(...nodes.map(n => n.y));
      const bottom = Math.max(...nodes.map(n => n.y + n.h));
      return (top + bottom) / 2;
    };
    expect(span(box.groups)).to.be.closeTo(span(box.leaves), 1);
    expect(span(box.sources)).to.be.closeTo(span(box.leaves), 1);
  });

  it('never draws a label off its own node, and never off the canvas', () => {
    box.leaves.filter(l => l.labelled).forEach(l => {
      expect(l.labelY).to.be.at.least(l.y - 0.001);
      expect(l.labelY).to.be.at.most(l.y + l.h + 0.001);
      expect(l.labelY + 11).to.be.at.most(box.height + 22);
    });
    box.groups.filter(g => g.labelled).forEach(g => {
      expect(g.labelY).to.be.at.least(g.y - 0.001);
      expect(g.labelY).to.be.at.most(g.y + g.h + 0.001);
    });
  });

  it('omits a label that its node has no room for', () => {
    const skewed = buildMoneyFlow([
        { category: 'rent', total: 15_000_000, group: 'essential' },
        { category: 'gum', total: 2_000, group: 'discretionary' },
      ], { income: 20_000_000 });
    const tiny = layoutMoneyFlow(skewed).leaves.find(l => l.name === 'gum');
    expect(tiny.labelled).to.equal(false);
  });

  it('ribbons run top-edge to top-edge, never crossed', () => {
    box.links.forEach(k => {
      const d = ribbonPath(k);
      expect(d).to.contain(`L${k.x1},${k.y1 + k.h1}`);
      expect(k.h0).to.be.at.least(0);
    });
  });
});

describe('percentages share the denominator they are drawn against', () => {
  it('sums group percentages to the whole, not to outflow', () => {
    const flow = buildMoneyFlow([
        { category: 'rent', total: 3_000_000, group: 'essential' },
        { category: 'kopi', total: 1_000_000, group: 'discretionary' },
      ], { income: 8_000_000 });
    const sum = flow.groups.reduce((s, g) => s + flow.pctOf(g.value), 0);
    expect(sum).to.be.closeTo(100, 1.5);
    const leafSum = flow.leaves.reduce((s, l) => s + flow.pctOf(l.value), 0);
    expect(leafSum).to.be.closeTo(100, 1.5);
  });
});
