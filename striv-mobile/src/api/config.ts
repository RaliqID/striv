/**
 * API base URL.
 *
 * Resolution order matters, because each source exists for a different reason:
 *
 *  1. EXPO_PUBLIC_API_URL — baked in at build time. This is what a standalone
 *     APK uses, since there is no dev server to ask.
 *  2. The development server host — Metro tells the app which machine served
 *     it, so a phone on the same Wi-Fi reaches the backend running there. Only
 *     available in Expo Go / dev builds.
 *  3. `extra.apiUrl` from app.json — a fallback for a build that set neither of
 *     the above.
 *  4. A last-resort literal.
 *
 * Platform note: an Android emulator reaches its host at 10.0.2.2, not
 * localhost, so that substitution is made explicitly rather than left to fail
 * with an opaque connection error.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

const PORT = 8001;
const API_SUFFIX = "/api/v1";

/** Where Metro served this bundle from, when there is a dev server. */
function fromDevServer(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } })
      ?.extra?.expoGo?.debuggerHost ??
    null;

  if (!hostUri) return null;

  const host = hostUri.split(":")[0];
  if (!host) return null;

  return `http://${host}:${PORT}${API_SUFFIX}`;
}

/** Value baked into app.json under expo.extra.apiUrl. */
function fromAppConfig(): string | null {
  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  return configured?.trim() || null;
}

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const devServer = fromDevServer();
  if (devServer) return devServer;

  const configured = fromAppConfig();
  if (configured) return configured.replace(/\/+$/, "");

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${PORT}${API_SUFFIX}`;
  }

  return `http://localhost:${PORT}${API_SUFFIX}`;
}

export const API_BASE_URL = resolveBaseUrl();
