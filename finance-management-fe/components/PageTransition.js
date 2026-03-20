'use client';
import { usePathname } from 'next/navigation';

/**
 * Wraps page children with a keyed div so React unmounts/remounts it
 * on every route change, re-triggering the CSS enter animation.
 */
export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
