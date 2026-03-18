import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeContext";

export const metadata = {
  title: "Finan App",
  description: "Personal finance tracker",
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
              if (t === 'dark') document.documentElement.classList.add('dark');
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="bg-gray-50 min-h-screen antialiased flex flex-col">
        <ThemeProvider>
          <GoogleProvider>
            <div className="flex flex-col min-h-screen">
              {children}
              <Footer />
            </div>
          </GoogleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
