import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

/** Bump when the logo mark changes, to defeat favicon caching. */
const ICON_VERSION = "2";

export const metadata: Metadata = {
  title: "Striv",
  description: "Striv — Train. Track. Understand.",
  /*
   * Icons are declared in priority order (SVG first, .ico as the universal
   * fallback). The ?v= query is a cache-buster: browsers cache favicons
   * aggressively — often ignoring a normal reload — so changing the URL is the
   * only reliable way to make a new icon appear. Bump ICON_VERSION whenever the
   * mark in scripts/make-icons.py changes.
   */
  icons: {
    icon: [
      { url: `/icon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
      { url: `/favicon.ico?v=${ICON_VERSION}`, sizes: "any" },
      { url: `/icon-192.png?v=${ICON_VERSION}`, type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: `/favicon.ico?v=${ICON_VERSION}` }],
    apple: [{ url: `/apple-icon.png?v=${ICON_VERSION}`, sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
          Both families load as stylesheet links because this Next version's
          next/font/google does not export Geist, and Material Symbols is an
          icon font with variable axes next/font cannot express. display=swap
          on Geist keeps label text visible during the font swap.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
