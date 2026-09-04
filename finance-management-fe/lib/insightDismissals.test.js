import { describe, it, expect } from 'vitest';
import { insightKey } from './insightFeed';
import {
  isDismissible,
  dismissKeyOf,
  parseDismissalKey,
  dismissedKeys,
  withoutDismissed,
  describeDismissal,
  hiddenUntil,
} from './insightDismissals';

const insight = (kind, subject, text) => ({
  kind, subject, level: 'warn', text, key: insightKey({ kind, subject }),
});

describe('insightDismissals — withoutDismissed', () => {
  const insights = [
    insight('category-change', 'widgets', 'Widgets rose this month'),
    insight('category-top-expense', 'widgets', 'Widgets is your top expense'),
    insight('category-change', 'gadgets', 'Gadgets rose this month'),
    insight('runway', 'balance', 'Balance runway is 4 days'),
  ];

  it('hides only the dismissed kind for the dismissed subject', () => {
    const left = withoutDismissed(insights, [{ kind: 'category-change', subject: 'widgets' }]);
    expect(left.map(i => i.text)).to.deep.equal([
      'Widgets is your top expense',
      'Gadgets rose this month',
      'Balance runway is 4 days',
    ]);
  });

  it('leaves the same kind alone for a different subject', () => {
    const left = withoutDismissed(insights, [{ kind: 'category-change', subject: 'gadgets' }]);
    expect(left.some(i => i.text === 'Gadgets rose this month')).to.equal(false);
    expect(left.some(i => i.text === 'Widgets rose this month')).to.equal(true);
  });

  it('matches subjects regardless of case', () => {
    const left = withoutDismissed(
      [insight('category-change', 'Shop Alpha', 'Shop Alpha rose')],
      [{ kind: 'category-change', subject: 'shop alpha' }],
    );
    expect(left).to.deep.equal([]);
  });

  it('returns every insight when nothing is dismissed', () => {
    expect(withoutDismissed(insights, [])).to.have.length(4);
    expect(withoutDismissed(insights, null)).to.have.length(4);
  });

  it('survives a missing insight list', () => {
    expect(withoutDismissed(null, [{ kind: 'category-change', subject: 'widgets' }])).to.deep.equal([]);
  });
});

describe('insightDismissals — which insights offer the control', () => {
  it('offers it for every category-scoped kind the API accepts', () => {
    [
      'category-concentration', 'category-fixed-base', 'category-change',
      'category-one-off', 'category-frequency', 'category-top-expense',
    ].forEach(kind => {
      expect(isDismissible({ kind }), kind).to.equal(true);
    });
  });

  it('withholds it from insights about a transient condition', () => {
    ['runway', 'forecast', 'anomaly-count', 'recurring-missing', 'recurring-total']
      .forEach(kind => expect(isDismissible({ kind }), kind).to.equal(false));
    expect(isDismissible(undefined)).to.equal(false);
  });

  it('reuses the feed\'s own key so a reworded insight stays dismissed', () => {
    const ins = insight('category-change', 'Widgets', 'Widgets rose this month');
    expect(dismissKeyOf(ins)).to.equal(insightKey(ins));
    expect(dismissKeyOf(ins)).to.equal('category-change:widgets');

    const reworded = { ...ins, text: 'Widgets went up a lot' };
    expect(dismissKeyOf(reworded)).to.equal(dismissKeyOf(ins));
  });

  it('gives no key to an insight that cannot be dismissed', () => {
    expect(dismissKeyOf({ kind: 'runway', subject: 'balance' })).to.equal(null);
  });
});

describe('insightDismissals — keys and labels', () => {
  it('reads a key back into the fields the API expects', () => {
    expect(parseDismissalKey('category-change:widgets'))
      .to.deep.equal({ kind: 'category-change', subject: 'widgets' });
    expect(parseDismissalKey('category-change:shop alpha'))
      .to.deep.equal({ kind: 'category-change', subject: 'shop alpha' });
    expect(parseDismissalKey('nokeyhere')).to.equal(null);
    expect(parseDismissalKey(undefined)).to.equal(null);
  });

  it('collects one key per dismissal', () => {
    const keys = dismissedKeys([
      { kind: 'category-change', subject: 'widgets' },
      { kind: 'category-top-expense', subject: 'widgets' },
    ]);
    expect([...keys]).to.deep.equal(['category-change:widgets', 'category-top-expense:widgets']);
  });

  it('describes a dismissal in the user\'s words', () => {
    expect(describeDismissal({ subject: 'widgets', kind: 'category-change' }))
      .to.equal('Widgets — month-to-month changes');
    expect(describeDismissal({ subject: 'widgets', kind: 'something-new' }))
      .to.equal('Widgets — insights');
  });

  it('renders an expiry date and tolerates a missing one', () => {
    expect(hiddenUntil({ expiresAt: '2026-12-02T00:00:00.000Z' })).to.not.equal('');
    expect(hiddenUntil({})).to.equal('');
    expect(hiddenUntil({ expiresAt: 'not a date' })).to.equal('');
  });
});
