import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the Android build.
 *
 * The app does NOT hard-code a server URL, and that is the important part.
 * A development tunnel (Cloudflare quick tunnel) is handed a new random
 * hostname every time it starts, so a URL baked into the APK goes stale within
 * minutes and the APK has to be rebuilt. Instead the bundled shell
 * (capacitor-shell/index.html) asks for the address once, stores it on the
 * device, and redirects. One APK therefore works against any server.
 *
 * Two ways to build:
 *
 *   1. Normal / dev — leave CAPACITOR_SERVER_URL unset. The app prompts for an
 *      address on first launch and remembers it. This is what .\build.ps1 does.
 *
 *   2. Branded release — set CAPACITOR_SERVER_URL to the production origin. The
 *      shell then skips the prompt entirely and end users never see it:
 *
 *        $env:CAPACITOR_SERVER_URL = "https://striv.app"
 *        .\build.ps1 release
 */
const configuredUrl = (process.env.CAPACITOR_SERVER_URL || "").trim();

const allowNavigation = [
  // Google's sign-in flow navigates off-origin and must return into the app.
  "accounts.google.com",
];

if (configuredUrl) {
  const host = new URL(configuredUrl).hostname;
  allowNavigation.unshift(host);
  // Cover preview deployments on the same platform.
  if (host.endsWith("vercel.app")) allowNavigation.push("*.vercel.app");
}

const config: CapacitorConfig = {
  appId: "com.raliq.striv",
  appName: "Striv",

  // The bundled launcher, not the Next.js public folder. The app's first screen
  // must work offline, because it exists to let you point the app at a server.
  webDir: "capacitor-shell",

  server: {
    // Deliberately NOT set: the shell decides the URL at runtime. When a
    // release build passes CAPACITOR_SERVER_URL it is injected into the shell
    // as its default rather than pinned here — see build.ps1.
    cleartext: false,
    allowNavigation,

    /*
     * Shown when the remote URL cannot be loaded. Without this a stale address
     * leaves a blank WebView with no way out; with it the user lands on a page
     * offering to change the address.
     */
    errorPath: "error.html",
  },

  android: {
    backgroundColor: "#FDF8F8",
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
