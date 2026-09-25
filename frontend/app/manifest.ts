import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Serves two purposes: it makes the web app installable ("Add to Home Screen"),
 * and Android/Capacitor reads the icon and theme values from the same source of
 * truth, so the browser tab, the installed PWA, and the native app stay
 * visually consistent.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Striv — Train. Track. Understand.",
    short_name: "Striv",
    description:
      "Track your workouts, discover your progress, and understand what your training data is telling you.",
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
}
