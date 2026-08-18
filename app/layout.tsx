// -----------------------------------------------------------------------------
// app/layout.tsx
//
// Next.js requires every App Router project to have this file — it's the
// outermost wrapper around every page, holding the <html>/<body> tags and
// anything that should apply everywhere (fonts, global CSS, page metadata).
// -----------------------------------------------------------------------------
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Resilience vs. ROI Microgrid Sensitivity Matrix (V2G Edition)",
  description:
    "A solar + battery + vehicle-to-grid what-if simulator for a Melbourne household.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
