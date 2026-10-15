import { DEFAULT_LOCALE, dictionaries, type Locale } from "@/lib/i18n/translations";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Web app manifest, localized.
 *
 * This lives in a route handler rather than `app/manifest.ts` because the
 * metadata file convention renders with no access to the request, so it could
 * only ever emit one hardcoded language. A route handler receives the request
 * and can therefore read the user's language — which matters because the
 * manifest name/description are shown in the OS "Add to Home Screen" prompt and
 * in app listings.
 *
 * Served at /manifest.webmanifest, the exact URL `app/layout.tsx` declares in
 * its metadata (`manifest: "/manifest.webmanifest"`), so nothing downstream
 * changes.
 *
 * Locale resolution, in order of authority:
 *   1. `striv_locale` cookie — the user's explicit choice, mirrored from
 *      localStorage by the client provider. This is the only signal that
 *      reflects what they actually picked in-app.
 *   2. `Accept-Language` — the browser's preference, used when no choice has
 *      been made yet.
 *   3. English default.
 *
 * Still serves the other purposes documented on the old file: icon and theme
 * values are read by the browser tab, the installed PWA, and the Capacitor
 * shell, so they stay the single source of truth.
 */

const COOKIE_NAME = "striv_locale";

/** Pick the first supported locale out of an Accept-Language header. */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  // "id-ID,id;q=0.9,en;q=0.8" -> ["id-ID", "id", "en"] in descending quality.
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "en" || base === "id") return base;
  }
  return null;
}

function resolveLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === "en" || cookie === "id") return cookie;

  const fromHeader = fromAcceptLanguage(request.headers.get("accept-language"));
  if (fromHeader) return fromHeader;

  return DEFAULT_LOCALE;
}

export function GET(request: NextRequest) {
  const locale = resolveLocale(request);
  const table = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];

  const manifest = {
    name: table["manifest.name"] ?? dictionaries[DEFAULT_LOCALE]["manifest.name"],
    short_name: "Striv",
    description:
      table["manifest.description"] ?? dictionaries[DEFAULT_LOCALE]["manifest.description"],
    lang: locale,
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FDF8F8",
    theme_color: "#1C1B1B",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable: Android may crop to a circle/rounded square, so the mark
      // needs safe padding. Same art, declared for that purpose.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // The body varies on Cookie and Accept-Language; without Vary a shared
      // cache could hand one user's language to another.
      Vary: "Cookie, Accept-Language",
    },
  });
}
