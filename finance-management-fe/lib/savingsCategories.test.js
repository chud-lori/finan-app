import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGroupSummary = vi.fn();
vi.mock('@/lib/api', () => ({ getGroupSummary: (...a) => getGroupSummary(...a) }));

const { fetchSavingsCategories, invalidateSavingsCategories } = await import('./savingsCategories');

const payload = { data: { groups: [
  { group: 'essential', categories: [{ name: 'food' }] },
  { group: 'savings', categories: [{ name: 'Reksa Dana' }, { name: 'emas' }] },
] } };

describe('fetchSavingsCategories', () => {
  beforeEach(() => { invalidateSavingsCategories(); getGroupSummary.mockReset(); });

  it('asks the category endpoint once however many months are viewed', async () => {
    getGroupSummary.mockResolvedValue(payload);
    const results = await Promise.all([
      fetchSavingsCategories(), fetchSavingsCategories(), fetchSavingsCategories(),
    ]);
    expect(getGroupSummary).toHaveBeenCalledTimes(1);
    results.forEach(r => expect(r).to.deep.equal(['Reksa Dana', 'emas']));
  });

  it('does not cache a failure — a 429 must be retryable', async () => {
    getGroupSummary.mockRejectedValueOnce(new Error('Too many requests'));
    await expect(fetchSavingsCategories()).rejects.toThrow(/Too many/);
    getGroupSummary.mockResolvedValue(payload);
    expect(await fetchSavingsCategories()).to.deep.equal(['Reksa Dana', 'emas']);
    expect(getGroupSummary).toHaveBeenCalledTimes(2);
  });

  it('refetches after a category group changes', async () => {
    getGroupSummary.mockResolvedValue(payload);
    await fetchSavingsCategories();
    invalidateSavingsCategories();
    await fetchSavingsCategories();
    expect(getGroupSummary).toHaveBeenCalledTimes(2);
  });
});
