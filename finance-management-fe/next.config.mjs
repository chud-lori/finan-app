import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // enables minimal Docker image via .next/standalone

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'DENY'    },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project slugs — find these in your Sentry project settings URL
  // e.g. sentry.io/organizations/YOUR_ORG/projects/YOUR_PROJECT/
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for uploading source maps (optional — improves stack traces)
  // Create one at: sentry.io/settings/account/api/auth-tokens/
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress verbose build output
  silent: !process.env.CI,

  // Upload source maps in production builds only
  sourcemaps: {
    disable: process.env.NODE_ENV !== 'production',
  },

  // Disable the Sentry telemetry
  telemetry: false,
});
