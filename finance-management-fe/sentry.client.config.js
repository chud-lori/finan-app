import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 20% of transactions for performance/tracing data
  tracesSampleRate: 0.2,

  // Replay 5% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    // Instruments page loads, client-side navigations, and fetch/XHR calls
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Don't report errors in development
  enabled: process.env.NODE_ENV === 'production',
});
