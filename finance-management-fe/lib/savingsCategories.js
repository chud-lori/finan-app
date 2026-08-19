import { getGroupSummary } from '@/lib/api';

// Which categories are savings is a property of the user, not of the month — the
// calendar was asking once per month view and burning the 30/min category limit.
let inflight = null;

export function fetchSavingsCategories() {
  if (!inflight) {
    inflight = getGroupSummary()
      .then((res) => {
        const groups = res?.data?.groups ?? [];
        const savings = groups.find((g) => g.group === 'savings');
        return (savings?.categories ?? []).map((c) => c.name);
      })
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

export function invalidateSavingsCategories() {
  inflight = null;
}
