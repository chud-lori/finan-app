import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";
import { ThemeProvider } from "@/components/ThemeContext";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata = {
  title: 'Finan App — Personal Finance Tracker & Planner',
  description: 'Track income and expenses, analyse spending patterns, plan budgets, calculate debt payoff, FIRE number, and tax estimates. Free personal finance dashboard.',
  metadataBase: new URL('https://finan-app.vercel.app'),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Declare we handle both schemes so browsers don't force their own dark mode */}
        <meta name="color-scheme" content="light dark" />
        {/* Synchronously apply saved theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme');
              if (t === 'dark' && window.location.pathname !== '/') {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="bg-gray-50 min-h-screen antialiased flex flex-col">
        <ThemeProvider>
          <GoogleProvider>
            <ErrorBoundary>
              <div className="flex flex-col min-h-screen">
                {children}
              </div>
            </ErrorBoundary>
          </GoogleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
