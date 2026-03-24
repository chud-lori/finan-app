import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";
import { ThemeProvider } from "@/components/ThemeContext";
import { CurrencyProvider } from "@/components/CurrencyContext";
import { ToastProvider } from "@/components/ToastContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";
import BottomNav from "@/components/BottomNav";
import AndroidBackHandler from "@/components/AndroidBackHandler";

export const metadata = {
  title: 'Finan App — Personal Finance Tracker & Planner',
  description: 'Free personal finance tracker with budgets, FIRE calculator, AI insights, and 10+ planning tools. Multi-currency support. No ads, free forever.',
  metadataBase: new URL('https://finance.lori.my.id'),
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    shortcut: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Finan App',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Default light — JS below will switch to dark if user saved that preference */}
        <meta name="color-scheme" content="only light" />
        <meta name="theme-color" content="#0d9488" />
        {/* Synchronously apply saved theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              // Auth overhaul migration: remove old JWT token (now uses HttpOnly cookie)
              localStorage.removeItem('token');
              var t = localStorage.getItem('theme');
              var meta = document.querySelector('meta[name="color-scheme"]');
              if (t === 'dark' && window.location.pathname !== '/') {
                document.documentElement.classList.add('dark');
                if (meta) meta.setAttribute('content', 'dark');
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="bg-gray-50 min-h-screen antialiased flex flex-col">
        <ThemeProvider>
          <CurrencyProvider>
            <GoogleProvider>
              <ToastProvider>
                <ErrorBoundary>
                  <div className="flex flex-col min-h-screen">
                    <PageTransition>{children}</PageTransition>
                    <BottomNav />
                    <AndroidBackHandler />
                  </div>
                </ErrorBoundary>
              </ToastProvider>
            </GoogleProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
