'use client';
import { useEffect } from 'react';

// Strips the `.dark` class from <html> while this component is mounted (landing page).
// Restores the user's saved theme when they navigate away (cleanup).
export default function ForceLightMode() {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      try {
        if (localStorage.getItem('theme') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch {}
    };
  }, []);
  return null;
}
