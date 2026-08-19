export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.2,
      integrations: [
        Sentry.httpIntegration(),
      ],
      enabled: process.env.NODE_ENV === 'production',
    });
  }
}

export const onRequestError = async (err, request, context) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(err, request, context);
};
