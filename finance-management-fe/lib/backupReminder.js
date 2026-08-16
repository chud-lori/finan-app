// Last-backup nudge.
//
// The backend has no "you exported on X" record — export streams a CSV blob and
// keeps no audit row — so the timestamp is remembered client-side. It's a
// reminder, not a guarantee: a user who exports on another device just sees the
// nudge again, which fails safe (nudging too often, never too little).

const STALE_DAYS = 60;
const DAY_MS = 86_400_000;

const key = (username) => `last_export_at_${username || 'u'}`;

const currentUsername = () => {
  try { return localStorage.getItem('username') || 'u'; } catch { return 'u'; }
};

export const getLastExportAt = () => {
  try {
    const raw = localStorage.getItem(key(currentUsername()));
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
};

export const markExportedNow = (now = Date.now()) => {
  try { localStorage.setItem(key(currentUsername()), String(now)); } catch {}
  return now;
};

/**
 * Pure formatter — the piece worth testing.
 * @param {number|null} ts  epoch ms of the last successful export, or null
 * @param {number} now      epoch ms
 * @returns {{ text: string, days: number|null, stale: boolean }}
 *          `stale` drives the gentle amber emphasis (never exported, or > 60 days).
 */
export const describeLastBackup = (ts, now = Date.now()) => {
  if (!Number.isFinite(ts) || ts == null || ts <= 0) {
    return { text: "You've never exported a backup", days: null, stale: true };
  }
  // A clock skew / future timestamp reads as "today" rather than a negative age.
  const days = Math.max(0, Math.floor((now - ts) / DAY_MS));
  const text =
    days === 0 ? 'Last export: today'
    : days === 1 ? 'Last export: yesterday'
    : `Last export: ${days} days ago`;
  return { text, days, stale: days > STALE_DAYS };
};

export { STALE_DAYS };
