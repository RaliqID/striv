import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/provider";
import { ToastProvider } from "@/components/admin/Toast";
import { DEFAULT_LOCALE, dictionaries, type Locale } from "@/lib/i18n/translations";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

/** Bump when the logo mark changes, to defeat favicon caching. */
const ICON_VERSION = "2";

/** The cookie the client provider mirrors the chosen locale into. */
const LOCALE_COOKIE = "striv_locale";

/**
 * The locale for this request.
 *
 * Read here rather than in the metadata object below, because a static
 * `export const metadata` is evaluated with no request in scope and could only
 * ever emit one language. The cookie is the only signal that reflects what the
 * user actually picked in-app; it is written by the client provider when the
 * language changes.
 *
 * Falls back to the default rather than throwing: a first-time visitor has no
 * cookie, and losing the page because of a missing preference would be worse
 * than serving English.
 */
async function requestLocale(): Promise<Locale> {
  try {
    const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (stored === "en" || stored === "id") return stored;
  } catch {
    // cookies() is unavailable in some rendering contexts; the default is fine.
  }
  return DEFAULT_LOCALE;
}

/**
 * Page metadata, localised.
 *
 * The description is shown in link previews, browser tabs and search results, so
 * a hardcoded English string is visible to an Indonesian reader who never opens
 * the app in English. The strings already exist as `manifest.*` keys, created
 * for the web manifest, and are reused here rather than duplicated.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const t = (key: string) => dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;

  return {
    title: "Striv",
    description: t("manifest.name"),
    applicationName: "Striv",
    // Standalone so an installed copy (PWA or the Capacitor shell) runs without
    // browser chrome.
    manifest: "/manifest.webmanifest",
    // iOS ignores the manifest for these; state them explicitly.
    appleWebApp: {
      capable: true,
      title: "Striv",
      statusBarStyle: "default",
    },
    formatDetection: {
      // A phone-number-looking string in a workout note should not become a link.
      telephone: false,
    },
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
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Locked zoom: a workout tracker is a tap-and-enter app, and pinch-zoom on
  // form steps is more likely to be an accidental gesture than intent.
  maximumScale: 1,
  userScalable: false,
  // Extend the canvas under the notch/home indicator so the layout can paint
  // into those areas and pad itself with the safe-area insets instead of
  // leaving letterboxed bars.
  viewportFit: "cover",
  // Tints the Android status bar and the PWA title bar to match the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDF8F8" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1B1B" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
   * lang is set server-side from the same signal the metadata uses, rather than
   * left as a hardcoded "en".
   *
   * The client provider does set documentElement.lang once it hydrates, but that
   * is too late for the first paint: until then a screen reader announces
   * Indonesian content with English pronunciation rules, and the browser applies
   * the wrong hyphenation. Reading the cookie here costs one header lookup and
   * makes the very first byte correct.
   */
  const locale = await requestLocale();

  return (
    <html lang={locale}>
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
        {/*
          Language lives above everything: the nav, the training screens and
          every form label read from it, so wrapping at the root means no page
          has to remember to provide it.

          ToastProvider sits at the ROOT for the same reason, and it is a bug fix
          rather than tidiness. It used to be rendered inside TrainerLayout and
          AdminLayout — BELOW the pages that call useToast(). React context only
          flows downward, so a page calling the hook during its own render could
          never see a provider rendered by its own layout, and every call
          resolved to the no-op fallback. The result was that every toast in the
          trainer and admin panels was silently discarded: the action succeeded,
          the confirmation never appeared, and nothing indicated a problem.

          Verified by reproducing the nesting in isolation — the old shape
          resolves to NOOP-FALLBACK, this one resolves to the real provider.
        */}
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
