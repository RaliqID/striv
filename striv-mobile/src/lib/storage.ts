/**
 * Token storage.
 *
 * Uses expo-secure-store (Android Keystore / iOS Keychain) rather than
 * AsyncStorage. AsyncStorage is a plain unencrypted file, so on a rooted or
 * backed-up device an auth token in it is readable. SecureStore is the
 * platform's own credential store, which is what a bearer token warrants.
 *
 * The cached user profile is kept separately in AsyncStorage: it is not a
 * secret, and it lets the app render the last-known name immediately on launch
 * instead of showing a blank header while /auth/user is in flight.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "striv.auth.token";
const USER_KEY = "striv.auth.user";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  is_suspended: boolean;
  must_change_password: boolean;
  profile?: {
    onboarding_completed_at: string | null;
    weight_kg?: number | null;
    target_weight_kg?: number | null;
    experience_level?: string | null;
    primary_goal?: string | null;
    training_frequency?: number | null;
  } | null;
};

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // A corrupt or unavailable keystore should behave like "not signed in"
    // rather than crashing the launch path.
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Already gone — nothing to do.
  }
}

export async function getCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export async function setCachedUser(user: AuthUser): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Non-fatal: the cache is an optimisation, not the source of truth.
  }
}

export async function clearSession(): Promise<void> {
  await clearToken();
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch {
    // Ignore.
  }
}
