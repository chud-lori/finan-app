'use client';
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ dark: false, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    // Default is light; only go dark if user explicitly saved 'dark'
    setDark(saved === 'dark');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark, mounted]);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme: () => setDark(v => !v) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
