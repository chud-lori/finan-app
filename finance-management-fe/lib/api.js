const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

const handleResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server error (${res.status}) — expected JSON but got ${contentType || 'unknown content type'}. Check that the API is reachable.`);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
};

export const verifyGoogleToken = (credential) =>
  fetch(`${BASE_URL}/api/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  }).then(handleResponse);

export const register = (body) =>
  fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handleResponse);

export const login = (identifier, password) =>
  fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  }).then(handleResponse);

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
  const query = qs.toString() ? `?${qs}` : '';
  return fetch(`${BASE_URL}/api/transaction${query}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const addTransaction = (body) =>
  fetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  }).then(handleResponse);

export const deleteTransaction = (id) =>
  fetch(`${BASE_URL}/api/transaction/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(handleResponse);

export const getRangeTransactions = (start, end) =>
  fetch(`${BASE_URL}/api/transaction/range/${start}/${end}`, {
    headers: authHeaders(),
  }).then(handleResponse);

export const getRecommendation = (monthly, spend) =>
  fetch(`${BASE_URL}/api/transaction/recommendation/${monthly}/${spend}?tz=${encodeURIComponent(browserTz())}`, {
    headers: authHeaders(),
  }).then(handleResponse);

export const getCategorySuggestions = (type = null) => {
  const qs = new URLSearchParams({ hour: new Date().getHours() });
  if (type) qs.set('type', type);
  return fetch(`${BASE_URL}/api/transaction/category/suggestions?${qs}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const getCategories = (type = null) => {
  const q = type ? `?type=${type}` : '';
  return fetch(`${BASE_URL}/api/transaction/category${q}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const getAnalytics = (year, month = null) => {
  const qs = new URLSearchParams({ year, tz: browserTz() });
  if (month) qs.set('month', month);
  return fetch(`${BASE_URL}/api/transaction/analytics?${qs}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const deleteAccount = () =>
  fetch(`${BASE_URL}/api/auth/account`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(handleResponse);

export const getAnomalies = () =>
  fetch(`${BASE_URL}/api/transaction/anomalies?tz=${encodeURIComponent(browserTz())}`, {
    headers: authHeaders(),
  }).then(handleResponse);

export const getExplainability = (month = null) => {
  const qs = new URLSearchParams({ tz: browserTz() });
  if (month) qs.set('month', month);
  return fetch(`${BASE_URL}/api/transaction/explain?${qs}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const getTimeToZero = () =>
  fetch(`${BASE_URL}/api/transaction/time-to-zero?tz=${encodeURIComponent(browserTz())}`, {
    headers: authHeaders(),
  }).then(handleResponse);

export const importCsv = (file) => {
  const form = new FormData();
  form.append('file', file);
  form.append('userTimezone', browserTz());
  return fetch(`${BASE_URL}/api/transaction/import/csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  }).then(handleResponse);
};
