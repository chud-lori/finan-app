'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/format';
import { getProfile } from '@/lib/api';

const CurrencyContext = createContext({
  currency: 'IDR',
  formatAmount: (v) => formatCurrency(v, 'IDR'),
  refreshCurrency: () => {},
});

export function CurrencyProvider({ children }) {
  // Start with localStorage value (or IDR) — avoids hydration mismatch and flash
  const [currency, setCurrency] = useState('IDR');

  const refresh = useCallback(async () => {
    // Only fetch if a token exists — getProfile on 401 auto-redirects to /login
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    try {
      const res = await getProfile();
      const cur = res.data?.preferences?.currency;
      if (cur) {
        setCurrency(cur);
        localStorage.setItem('currency', cur);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Read localStorage first (instant, no network)
    try {
      const saved = localStorage.getItem('currency');
      if (saved) setCurrency(saved);
    } catch {}
    // Then validate/refresh from API
    refresh();
  }, [refresh]);

  const formatAmount = useCallback((value) => formatCurrency(value, currency), [currency]);

  return (
    <CurrencyContext.Provider value={{ currency, formatAmount, refreshCurrency: refresh }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency    = () => useContext(CurrencyContext);
export const useFormatAmount = () => useContext(CurrencyContext).formatAmount;
