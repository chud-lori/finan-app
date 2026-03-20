import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";
import { ThemeProvider } from "@/components/ThemeContext";
import { CurrencyProvider } from "@/components/CurrencyContext";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata = {
  title: 'Finan App — Personal Finance Tracker & Planner',
  description: 'Track income and expenses, analyse spending patterns, plan budgets, calculate debt payoff, FIRE number, and tax estimates. Free personal finance dashboard.',
  metadataBase: new URL('https://finance.lori.my.id'),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Default light — JS below will switch to dark if user saved that preference */}
        <meta name="color-scheme" content="only light" />
        {/* Synchronously apply saved theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
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
              <ErrorBoundary>
                <div className="flex flex-col min-h-screen">
                  {children}
                </div>
              </ErrorBoundary>
            </GoogleProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
