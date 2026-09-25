/**
 * Authentication state for the whole app.
 *
 * Holds the session in one place so the router, screens, and the API layer all
 * agree on who is signed in. Written as a context rather than a store library
 * because the state is small and a dependency would not earn its weight.
 *
 * `status` is deliberately a three-way value. "unknown" (still restoring from
 * storage) is distinct from "signed out", because treating them the same makes
 * the app flash the login screen on every cold start before it has had a chance
 * to find a stored token.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, onUnauthorized } from "../api/client";
import {
  clearSession,
  getCachedUser,
  getToken,
  setCachedUser,
  setToken,
  type AuthUser,
} from "../lib/storage";

export type AuthStatus = "unknown" | "signedIn" | "signedOut";

type LoginResponse = { user: AuthUser; token: string };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  /** Update the locally cached user after an edit, so the UI reflects it. */
  patchUser: (changes: Partial<AuthUser>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("unknown");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Guards against setting state after unmount, and against a slow restore
  // overwriting a newer sign-in.
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const applySession = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setStatus("signedIn");
    void setCachedUser(nextUser);
  }, []);

  const signOut = useCallback(async () => {
    // Best effort: an expired token makes the call fail, which is fine — the
    // local session is cleared either way.
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore.
    }
    await clearSession();
    if (!active.current) return;
    setUser(null);
    setStatus("signedOut");
  }, []);

  /** Restore a stored session, verifying the token is still valid. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setStatus("signedOut");
        return;
      }

      // Show the cached user immediately so the UI is not blank while the
      // network round-trip happens, then confirm with the server.
      const cached = await getCachedUser();
      if (cached && !cancelled) setUser(cached);

      try {
        const fresh = await api.get<AuthUser>("/auth/user");
        if (cancelled) return;
        applySession(fresh);
      } catch (error) {
        if (cancelled) return;

        // A network failure must NOT sign the user out: they may be offline with
        // a perfectly valid token. Only an explicit rejection does that, and the
        // API layer already clears the session on 401.
        if (error instanceof ApiError && error.isNetworkError && cached) {
          setStatus("signedIn");
          return;
        }
        setUser(null);
        setStatus("signedOut");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  // A 401 from any request forces the app back to signed-out.
  useEffect(() => {
    return onUnauthorized(() => {
      if (!active.current) return;
      setUser(null);
      setStatus("signedOut");
    });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await api.post<LoginResponse>(
        "/auth/login",
        { email: email.trim().toLowerCase(), password },
        { anonymous: true }
      );
      await setToken(response.token);
      applySession(response.user);
    },
    [applySession]
  );

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await api.get<AuthUser>("/auth/user");
      applySession(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, [applySession]);

  const patchUser = useCallback((changes: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...changes };
      void setCachedUser(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, refreshUser, patchUser }),
    [status, user, signIn, signOut, refreshUser, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
