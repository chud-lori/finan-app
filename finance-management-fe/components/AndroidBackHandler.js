'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Android PWA: the hardware back button fires popstate, so exit needs a confirmed second press.
const ROOT_PATHS = ['/dashboard', '/analytics', '/profile', '/recommendation', '/insights'];

export default function AndroidBackHandler() {
  const pathname = usePathname();
  const pendingExit = useRef(false);
  const toastRef = useRef(null);

  useEffect(() => {
    const isRoot = ROOT_PATHS.some(p => pathname === p);
    if (!isRoot) return;

    // Sentinel entry so the back button fires popstate instead of closing the app.
    window.history.pushState({ sentinel: true }, '');

    const onPopState = (e) => {
      if (pendingExit.current) {
        window.close();
        // window.close() only works in some browsers; otherwise re-push and let the OS decide.
        return;
      }

      pendingExit.current = true;
      window.history.pushState({ sentinel: true }, '');

      showExitToast();

      setTimeout(() => {
        pendingExit.current = false;
        hideExitToast();
      }, 2000);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [pathname]);

  return (
    <>
      <div
        id="exit-toast"
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%) translateY(20px)',
          background: 'rgba(15,23,42,0.9)',
          color: '#f1f5f9',
          padding: '10px 20px',
          borderRadius: '999px',
          fontSize: '13px',
          fontWeight: 500,
          zIndex: 9999,
          opacity: 0,
          transition: 'opacity 0.2s, transform 0.2s',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Press back again to exit
      </div>
    </>
  );
}

function showExitToast() {
  const el = document.getElementById('exit-toast');
  if (!el) return;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
}

function hideExitToast() {
  const el = document.getElementById('exit-toast');
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateX(-50%) translateY(20px)';
}
