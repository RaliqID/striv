import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Android build.
 *
 * The app is a native shell around a deployed Next.js frontend rather than a
 * bundle of static files: Striv is server-rendered and talks to a live API, so
 * shipping a frozen copy of the HTML would break the moment anything changed.
 * `server.url` therefore points at a running frontend.
 *
 * Override per build without editing this file:
 *
 *   $env:CAPACITOR_SERVER_URL = "https://your-frontend.example.com"
 *   .\build.ps1
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  // Production default. Replace with your deployed frontend origin.
  "https://striv.vercel.app";

/**
 * Hosts the WebView stays inside.
 *
 * Derived from serverUrl rather than hard-coded: if the two disagree, every
 * same-origin API call gets handed to the system browser and the app appears to
 * do nothing. Deriving it makes that class of bug impossible.
 */
const serverHost = new URL(serverUrl).hostname;

const allowNavigation = [
  serverHost,
  // Google's sign-in flow navigates off-origin and must return into the app.
  "accounts.google.com",
];

// Keep the Vercel preview pattern working alongside whatever host is active.
if (serverHost.endsWith("vercel.app")) {
  allowNavigation.push("*.vercel.app");
}

const config: CapacitorConfig = {
  appId: "com.raliq.striv",
  appName: "Striv",
  webDir: "public",

  server: {
    url: serverUrl,
    // HTTPS only, so a misconfigured URL fails loudly instead of shipping a
    // build that silently talks to a dev server over cleartext.
    cleartext: false,
    allowNavigation,
  },

  android: {
    // Background-match the app surface during load, avoiding a white flash
    // before the first paint.
    backgroundColor: "#FDF8F8",

    // The app is HTTPS-only; mixed content would be a downgrade.
    allowMixedContent: false,

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
