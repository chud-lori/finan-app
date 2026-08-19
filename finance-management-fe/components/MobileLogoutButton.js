'use client';
import { useRouter } from 'next/navigation';
import { logout as apiLogout } from '@/lib/api';
import { useCurrency } from '@/components/CurrencyContext';

// The desktop logout is in the `hidden md:flex` Navbar menu, so bottom-nav pages need this one.
export default function MobileLogoutButton() {
  const router = useRouter();
  const { clearCurrency } = useCurrency();

  const handleLogout = async () => {
    await apiLogout().catch(() => {});
    try { localStorage.removeItem('username'); } catch {}
    clearCurrency();
    router.replace('/login');
  };

  return (
    <button
      onClick={handleLogout}
      className="md:hidden w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Log out
    </button>
  );
}
