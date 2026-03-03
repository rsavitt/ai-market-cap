import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI Market Cap",
  description:
    "Live multi-signal ranking system for AI models and products",
  keywords: ["AI", "ranking", "models", "market cap", "leaderboard"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased min-h-screen bg-dark-950 text-gray-200">
        {/* Gradient accent line at very top */}
        <div className="gradient-accent-line" />

        {/* Header */}
        <header className="border-b border-dark-700 bg-dark-900/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo mark */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-accent-gradient flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                </div>
                <h1 className="text-base font-bold tracking-tight text-white">
                  AI Market Cap
                </h1>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-5 bg-dark-700" />

              {/* Tagline */}
              <span className="hidden sm:inline text-xs text-muted tracking-wide">
                Live multi-signal ranking system
              </span>
            </div>

            {/* Right side — status indicator */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="signal-dot-active" />
                <span className="text-2xs text-muted uppercase tracking-wider font-medium">
                  Live
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          {children}
        </main>

        <Footer />
      </body>
    </html>
  );
}
