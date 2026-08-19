// Client-side only — the backend keeps no export audit row, so another device just re-nudges.

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

// `stale` = never exported, or over 60 days.
export const describeLastBackup = (ts, now = Date.now()) => {
  if (!Number.isFinite(ts) || ts == null || ts <= 0) {
    return { text: "You've never exported a backup", days: null, stale: true };
  }
  const days = Math.max(0, Math.floor((now - ts) / DAY_MS));
  const text =
    days === 0 ? 'Last export: today'
    : days === 1 ? 'Last export: yesterday'
    : `Last export: ${days} days ago`;
  return { text, days, stale: days > STALE_DAYS };
};

export { STALE_DAYS };
