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
