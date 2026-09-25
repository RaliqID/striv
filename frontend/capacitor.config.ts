import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Android build.
 *
 * The app is a native shell around the deployed Next.js frontend rather than a
 * bundle of static files: Striv is a server-rendered app that talks to a live
 * API, so shipping a frozen copy of the HTML would break the moment anything
 * changed. `server.url` therefore points at the production frontend.
 *
 * Set CAPACITOR_SERVER_URL when building against a different environment:
 *
 *   CAPACITOR_SERVER_URL=https://staging.example.com npx cap sync android
 *
 * For local development against the dev server, point it at your machine's LAN
 * address (not localhost — inside the emulator/device localhost is the device
 * itself). See android/README-ANDROID.md.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  // Production default. Replace with your deployed frontend origin.
  "https://striv.vercel.app";

const config: CapacitorConfig = {
  appId: "com.raliq.striv",
  appName: "Striv",
  webDir: "public",

  server: {
    url: serverUrl,
    // HTTPS only, so a misconfigured URL fails loudly instead of shipping a
    // build that silently talks to a dev server over cleartext.
    cleartext: false,

    // Keep the WebView on our own origin. Opening everything in the system
    // browser would break the app's own navigation.
    allowNavigation: [
      "striv.vercel.app",
      "*.vercel.app",
      "*.yourdomain.com",
      "accounts.google.com", // Google OAuth sign-in flow
    ],
  },

  android: {
    // Let the WebView background-match the app surface during load, avoiding a
    // white flash before the first paint.
    backgroundColor: "#FDF8F8",

    // The app is HTTPS-only; mixed content would be a downgrade.
    allowMixedContent: false,

    // Required for the OAuth redirect to return into the app's WebView.
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#FDF8F8",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
