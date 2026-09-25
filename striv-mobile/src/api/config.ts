/**
 * API base URL.
 *
 * Resolution order matters, because each source exists for a different reason:
 *
 *  1. EXPO_PUBLIC_API_URL — an explicit override for pointing a build at a
 *     staging or production backend without editing code.
 *  2. The dev-server host — Metro tells the app which machine it was loaded
 *     from, so a device on the same Wi-Fi reaches the backend on that same
 *     machine. Without this, "localhost" on a phone means the phone itself and
 *     every request fails.
 *  3. A last-resort literal.
 *
 * Platform note: an Android emulator reaches the host machine at 10.0.2.2, not
 * localhost, so that substitution is made explicitly rather than left to fail
 * with a confusing connection error.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

const PORT = 8001;
const API_SUFFIX = "/api/v1";

function fromDevServer(): string | null {
  // e.g. "192.168.1.20:8081" — the machine running Metro, i.e. the dev machine.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older manifest shape, still present on some Expo Go versions.
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } })
      ?.extra?.expoGo?.debuggerHost ??
    null;

  if (!hostUri) return null;

  const host = hostUri.split(":")[0];
  if (!host) return null;

  return `http://${host}:${PORT}${API_SUFFIX}`;
}

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const devServer = fromDevServer();
  if (devServer) return devServer;

  if (Platform.OS === "android") {
    // 10.0.2.2 is how the Android emulator addresses its host machine.
    return `http://10.0.2.2:${PORT}${API_SUFFIX}`;
  }

  return `http://localhost:${PORT}${API_SUFFIX}`;
}

export const API_BASE_URL = resolveBaseUrl();
