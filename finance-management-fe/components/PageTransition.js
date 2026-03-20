'use client';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter flex-1">
      {children}
    </div>
  );
}
