import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Finan App — Free Personal Finance Tracker & Planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdfa 0%, #e6fffa 40%, #f9fafb 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Logo / brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#0d9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}
          >
            💰
          </div>
          <span style={{ fontSize: '32px', fontWeight: '800', color: '#0d9488', letterSpacing: '-1px' }}>
            Finan App
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: '900',
            color: '#111827',
            lineHeight: 1.1,
            marginBottom: '24px',
            letterSpacing: '-2px',
            maxWidth: '800px',
          }}
        >
          Your finances,{' '}
          <span style={{ color: '#0d9488' }}>finally under control.</span>
        </div>

        {/* Subtext */}
        <div style={{ fontSize: '26px', color: '#6b7280', maxWidth: '680px', lineHeight: 1.4 }}>
          Track income & expenses · Budget planner · FIRE calculator · AI insights · Multi-currency
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '48px' }}>
          {['Free forever', 'Google OAuth', 'Dark mode', '10+ currencies'].map(label => (
            <div
              key={label}
              style={{
                padding: '10px 20px',
                borderRadius: '100px',
                background: '#fff',
                border: '2px solid #d1fae5',
                fontSize: '18px',
                fontWeight: '600',
                color: '#065f46',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
