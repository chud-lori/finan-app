'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/format';
import { getProfile } from '@/lib/api';

const CurrencyContext = createContext({
  currency: 'IDR',
  numberFormat: 'dot',
  formatAmount: (v) => formatCurrency(v, 'IDR', 'dot'),
  refreshCurrency: () => {},
  clearCurrency: () => {},
});

export function CurrencyProvider({ children }) {
  const [currency,     setCurrency]     = useState('IDR');
  const [numberFormat, setNumberFormat] = useState('dot');

  const refresh = useCallback(async () => {
    // Only fetch if a token exists — getProfile on 401 auto-redirects to /login
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    try {
      const res = await getProfile();
      const prefs = res.data?.preferences;
      const cur = prefs?.currency;
      const fmt = prefs?.numberFormat;
      if (cur) { setCurrency(cur); localStorage.setItem('currency', cur); }
      if (fmt) { setNumberFormat(fmt); localStorage.setItem('numberFormat', fmt); }
    } catch {}
  }, []);

  useEffect(() => {
    // Read localStorage first (instant, no network)
    try {
      const savedCur = localStorage.getItem('currency');
      if (savedCur) setCurrency(savedCur);
      const savedFmt = localStorage.getItem('numberFormat');
      if (savedFmt) setNumberFormat(savedFmt);
    } catch {}
    // Then validate/refresh from API
    refresh();
  }, [refresh]);

  const clear = useCallback(() => {
    setCurrency('IDR');
    setNumberFormat('dot');
    try {
      localStorage.removeItem('currency');
      localStorage.removeItem('numberFormat');
    } catch {}
  }, []);

  const formatAmount = useCallback(
    (value) => formatCurrency(value, currency, numberFormat),
    [currency, numberFormat],
  );

  return (
    <CurrencyContext.Provider value={{ currency, numberFormat, formatAmount, refreshCurrency: refresh, clearCurrency: clear }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency    = () => useContext(CurrencyContext);
export const useFormatAmount = () => useContext(CurrencyContext).formatAmount;
