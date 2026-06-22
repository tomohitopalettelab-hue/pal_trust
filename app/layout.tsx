import { Inter } from "next/font/google";
import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Pal Trust",
  description: "口コミ対策改善システム",
  icons: {
    icon: "/logo-icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Suspense fallback={<div className="min-h-screen w-full">{children}</div>}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}