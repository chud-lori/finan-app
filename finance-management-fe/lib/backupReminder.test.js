import { describe, it, expect } from 'vitest';
import { describeLastBackup, STALE_DAYS } from './backupReminder';

const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);
const daysAgo = (n) => NOW - n * 86_400_000;

describe('describeLastBackup', () => {
  it('treats a missing timestamp as never exported, and flags it stale', () => {
    for (const empty of [null, undefined, 0, NaN]) {
      const r = describeLastBackup(empty, NOW);
      expect(r.text).toBe("You've never exported a backup");
      expect(r.days).toBeNull();
      expect(r.stale).toBe(true);
    }
  });

  it('reads today and yesterday in words', () => {
    expect(describeLastBackup(daysAgo(0), NOW).text).toBe('Last export: today');
    expect(describeLastBackup(daysAgo(1), NOW).text).toBe('Last export: yesterday');
  });

  it('counts whole days beyond yesterday', () => {
    const r = describeLastBackup(daysAgo(9), NOW);
    expect(r.text).toBe('Last export: 9 days ago');
    expect(r.days).toBe(9);
    expect(r.stale).toBe(false);
  });

  it('only turns stale strictly past the threshold', () => {
    expect(describeLastBackup(daysAgo(STALE_DAYS), NOW).stale).toBe(false);
    expect(describeLastBackup(daysAgo(STALE_DAYS + 1), NOW).stale).toBe(true);
  });

  it('clamps a future timestamp to today rather than negative days', () => {
    const r = describeLastBackup(NOW + 5 * 86_400_000, NOW);
    expect(r.days).toBe(0);
    expect(r.text).toBe('Last export: today');
    expect(r.stale).toBe(false);
  });
});
