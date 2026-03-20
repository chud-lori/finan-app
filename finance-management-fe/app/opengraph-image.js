import { ImageResponse } from 'next/og';

export const alt = 'Finan App — Free Personal Finance Tracker & Planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #f9fafb 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '72px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '36px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: '#0d9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
            }}
          >
            💰
          </div>
          <span style={{ fontSize: '30px', fontWeight: '800', color: '#0d9488' }}>
            Finan App
          </span>
        </div>

        {/* Headline — split into two spans inside a flex-wrap container */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '0 12px',
            fontSize: '62px',
            fontWeight: '900',
            lineHeight: 1.1,
            marginBottom: '20px',
            letterSpacing: '-2px',
            maxWidth: '820px',
          }}
        >
          <span style={{ color: '#111827' }}>Your finances,</span>
          <span style={{ color: '#0d9488' }}>finally under control.</span>
        </div>

        {/* Subtext */}
        <div
          style={{
            display: 'flex',
            fontSize: '24px',
            color: '#6b7280',
            maxWidth: '660px',
            lineHeight: 1.45,
            marginBottom: '44px',
          }}
        >
          Budgets · FIRE calculator · AI insights · Debt payoff · Multi-currency · Free forever
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              padding: '16px 32px',
              borderRadius: '14px',
              background: '#0d9488',
              fontSize: '22px',
              fontWeight: '700',
              color: '#ffffff',
            }}
          >
            Start for free →
          </div>
          <span style={{ fontSize: '20px', color: '#6b7280', fontWeight: '500' }}>
            finance.lori.my.id
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
