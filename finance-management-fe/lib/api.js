const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

const handleResponse = async (res) => {
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

export const login = (username, password) =>
  fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(handleResponse);

export const getTransactions = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.month) qs.set('month', params.month);
  if (params.category) qs.set('category', params.category);
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
  fetch(`${BASE_URL}/api/transaction/recommendation/${monthly}/${spend}`, {
    headers: authHeaders(),
  }).then(handleResponse);

export const getCategories = (type = null) => {
  const q = type ? `?type=${type}` : '';
  return fetch(`${BASE_URL}/api/transaction/category${q}`).then(handleResponse);
};

export const getAnalytics = (year, month = null) => {
  const q = month ? `year=${year}&month=${month}` : `year=${year}`;
  return fetch(`${BASE_URL}/api/transaction/analytics?${q}`, {
    headers: authHeaders(),
  }).then(handleResponse);
};

export const importCsv = (file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${BASE_URL}/api/transaction/import/csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  }).then(handleResponse);
};
