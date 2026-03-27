const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

// All authenticated requests use HttpOnly cookie (set by backend on login).
// credentials: 'include' tells the browser to send the cookie cross-origin.
const apiFetch = (url, opts = {}) => {
  const { headers, ...rest } = opts;
  return fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...rest,
  }).then(handleResponse);
};

const handleResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server error (${res.status}) — expected JSON but got ${contentType || 'unknown content type'}. Check that the API is reachable.`);
  }
  const data = await res.json();
  if (!res.ok) {
    // Session expired / revoked — redirect to login from protected pages only
    // EMAIL_NOT_VERIFIED is a 403 that should NOT trigger auto-redirect
    if ((res.status === 401 || res.status === 403) && data.code !== 'EMAIL_NOT_VERIFIED') {
      if (typeof window !== 'undefined') {
        const p = window.location.pathname;
        const isPublic = p === '/' || p === '/login' || p === '/register' ||
          p === '/forgot-password' || p.startsWith('/reset-password') ||
          p.startsWith('/verify-email') || p.startsWith('/auth/');
        if (!isPublic) {
          try { localStorage.removeItem('username'); } catch {}
          window.location.href = '/login';
        }
      }
    }
    const err = new Error(data.message || `Request failed: ${res.status}`);
    err.code = data.code;
    throw err;
  }
  return data;
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export const register = (body) =>
  fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handleResponse);

export const login = (identifier, password) =>
  fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  }).then(handleResponse);

export const verifyGoogleToken = (credential) =>
  fetch(`${BASE_URL}/api/auth/google/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  }).then(handleResponse);

export const checkAuth = () =>
  apiFetch('/api/auth/check');

export const logout = () =>
  apiFetch('/api/auth/logout', { method: 'POST' });

export const logoutAllDevices = () =>
  apiFetch('/api/auth/logout-all', { method: 'POST' });

export const getSessions = () =>
  apiFetch('/api/auth/sessions');

export const revokeSession = (id) =>
  apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });

export const verifyEmail = (token) =>
  fetch(`${BASE_URL}/api/auth/verify-email/${encodeURIComponent(token)}`, {
    credentials: 'include',
  }).then(handleResponse);

export const resendVerification = (email) =>
  fetch(`${BASE_URL}/api/auth/resend-verification`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(handleResponse);

export const deleteAccount = () =>
  apiFetch('/api/auth/account', { method: 'DELETE' });

export const changePassword = (body) =>
  apiFetch('/api/auth/password', { method: 'PATCH', body: JSON.stringify(body) });

export const forgotPassword = (email) =>
  fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(handleResponse);

export const resetPassword = (token, newPassword) =>
  fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  }).then(handleResponse);

// ── Transactions ──────────────────────────────────────────────────────────────

export const getTransactions = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.month)    qs.set('month',    params.month);
  if (params.category) qs.set('category', params.category.toLowerCase());
  if (params.search)   qs.set('search',   params.search);
  if (params.sortBy)   qs.set('sortBy',   params.sortBy);
  if (params.order)    qs.set('order',    params.order);
  if (params.page)     qs.set('page',     params.page);
  if (params.limit)    qs.set('limit',    params.limit);
  qs.set('tz', browserTz());
  return apiFetch(`/api/transaction${qs.toString() ? `?${qs}` : ''}`);
};

export const addTransaction = (body) =>
  apiFetch('/api/transaction', { method: 'POST', body: JSON.stringify(body) });

export const deleteTransaction = (id) =>
  apiFetch(`/api/transaction/${id}`, { method: 'DELETE' });

export const updateTransaction = (id, patch) =>
  apiFetch(`/api/transaction/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const getRangeTransactions = (start, end) =>
  apiFetch(`/api/transaction/range/${start}/${end}`);

export const getRecommendation = (monthly, spend) =>
  apiFetch(`/api/transaction/recommendation/${monthly}/${spend}?tz=${encodeURIComponent(browserTz())}`);

export const getCategorySuggestions = (type = null) => {
  const qs = new URLSearchParams({ hour: new Date().getHours() });
  if (type) qs.set('type', type);
  return apiFetch(`/api/transaction/category/suggestions?${qs}`);
};

export const getCategories = (type = null) =>
  apiFetch(`/api/transaction/category${type ? `?type=${type}` : ''}`);

export const getAnalytics = (year, month = null) => {
  const qs = new URLSearchParams({ year, tz: browserTz() });
  if (month) qs.set('month', month);
  return apiFetch(`/api/transaction/analytics?${qs}`);
};

export const getAnomalies = () =>
  apiFetch(`/api/transaction/anomalies?tz=${encodeURIComponent(browserTz())}`);

export const getExplainability = (month = null) => {
  const qs = new URLSearchParams({ tz: browserTz() });
  if (month) qs.set('month', month);
  return apiFetch(`/api/transaction/explain?${qs}`);
};

export const getTimeToZero = () =>
  apiFetch(`/api/transaction/time-to-zero?tz=${encodeURIComponent(browserTz())}`);

export const getMLInsights = () =>
  apiFetch(`/api/transaction/ml-insights?tz=${encodeURIComponent(browserTz())}`);

export const refreshMLInsights = () =>
  apiFetch(`/api/transaction/ml-insights/refresh?tz=${encodeURIComponent(browserTz())}`, { method: 'POST' });

export const getActiveMonths = () =>
  apiFetch('/api/transaction/active-months');

export const setBudget = (yearMonth, amount, updateDefault = false) =>
  apiFetch(`/api/transaction/budget/${yearMonth}`, {
    method: 'PUT',
    body: JSON.stringify({ amount, updateDefault }),
  });

// FormData upload — no Content-Type header (browser sets multipart boundary)
export const importCsv = (files) => {
  const form = new FormData();
  const list = Array.isArray(files) ? files : [files];
  list.forEach(f => form.append('files', f));
  form.append('userTimezone', browserTz());
  return fetch(`${BASE_URL}/api/transaction/import/csv`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  }).then(handleResponse);
};

// ── Goals ─────────────────────────────────────────────────────────────────────

export const addGoal = (description, price) =>
  apiFetch('/api/goal/add', { method: 'POST', body: JSON.stringify({ description, price }) });

export const getAllGoals = () =>
  apiFetch('/api/goal/goals');

export const updateGoal = (id, patch) =>
  apiFetch(`/api/goal/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteGoal = (id) =>
  apiFetch(`/api/goal/${id}`, { method: 'DELETE' });

// ── Profile ───────────────────────────────────────────────────────────────────

export const getProfile = () =>
  apiFetch('/api/profile');

export const updateIdentity = (body) =>
  apiFetch('/api/profile/identity', { method: 'PATCH', body: JSON.stringify(body) });

export const updatePreferences = (body) =>
  apiFetch('/api/profile/preferences', { method: 'PATCH', body: JSON.stringify(body) });

// Returns a raw Response (CSV blob) — caller handles the blob directly
export const exportTransactions = (params = {}) => {
  const qs = new URLSearchParams({ tz: browserTz(), ...params });
  return fetch(`${BASE_URL}/api/profile/export?${qs}`, { credentials: 'include' });
};

// ── Gamification ──────────────────────────────────────────────────────────────

export const getGamificationSummary = () =>
  apiFetch(`/api/gamification/summary?tz=${encodeURIComponent(browserTz())}`);

// ── Smart recommendations ─────────────────────────────────────────────────────

export const getSmartRecommendations = () =>
  apiFetch(`/api/recommendations?tz=${encodeURIComponent(browserTz())}`);

// ── Category groups ───────────────────────────────────────────────────────────

export const getGroupSummary = (month) => {
  const qs = new URLSearchParams({ tz: browserTz() });
  if (month) qs.set('month', month);
  return apiFetch(`/api/category/group-summary?${qs}`);
};

export const classifyAllCategories = () =>
  apiFetch('/api/category/classify-all', { method: 'POST' });

export const setCategoryGroup = (categoryId, group) =>
  apiFetch(`/api/category/${categoryId}/group`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  });

export const listAllCategories = () =>
  apiFetch('/api/category');

export const renameCategoryApi = (categoryId, newName) =>
  apiFetch(`/api/category/${categoryId}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });

export const deleteCategoryApi = (categoryId) =>
  apiFetch(`/api/category/${categoryId}`, { method: 'DELETE' });

export const repairCategoryTypes = () =>
  apiFetch('/api/category/repair-types', { method: 'POST' });
