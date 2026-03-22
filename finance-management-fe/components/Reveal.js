'use client';
import { useEffect, useRef } from 'react';

// Wraps children with a scroll-triggered reveal animation.
// variant: 'up' | 'left' | 'right' | 'scale' | 'blur'
// delay: CSS delay string e.g. '150ms'
export default function Reveal({ children, className = '', variant = 'up', delay = '0ms', threshold = 0.12 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cls =
      variant === 'left'  ? 'reveal-left'  :
      variant === 'right' ? 'reveal-right' :
      variant === 'scale' ? 'reveal-scale' :
      variant === 'blur'  ? 'reveal-blur'  :
                            'reveal';
    el.classList.add(cls);
    el.style.transitionDelay = delay;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible');
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [variant, delay, threshold]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
