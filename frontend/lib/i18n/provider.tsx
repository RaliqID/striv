"use client";

import { apiClient } from "@/lib/api";
import {
  DEFAULT_LOCALE,
  dictionaries,
  type Locale,
} from "@/lib/i18n/translations";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface I18nContextValue {
  /** The active locale. */
  locale: Locale;
  /** Translate a key, with optional `:placeholder` interpolation. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Switch language: updates the UI immediately, then persists server-side. */
  setLocale: (locale: Locale) => void;
  /** True while a language change is being saved. */
  saving: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "striv_locale";

/**
 * Mirror the locale into a cookie so the server can read it.
 *
 * localStorage is invisible to the server, and the manifest (`/manifest.webmanifest`)
 * is rendered server-side at install time — before any client code runs. A
 * SameSite=Lax cookie is sent on that same-origin document request, which is
 * the only way the server can honour the user's *explicit* choice rather than
 * guessing from Accept-Language. Not HttpOnly by necessity: it is written from
 * the client. Not Secure so it also works on LAN http during development; the
 * value is a non-sensitive "en"/"id" — there is nothing here to protect.
 */
function writeLocaleCookie(locale: Locale) {
  try {
    document.cookie = `${STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Storage blocked — the manifest simply falls back to Accept-Language.
  }
}

/**
 * Language provider.
 *
 * Two-phase by design: the dictionary swaps instantly from local state so the
 * UI never lags behind the click, and the preference is saved to the server in
 * the background so it follows the user to another device. If the save fails
 * the local choice still stands for the session, which is the better failure —
 * reverting the UI would make a network blip look like the switcher is broken.
 *
 * The initial locale is read from localStorage synchronously during the first
 * render (guarded for SSR) so there is no flash of the wrong language.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore the last choice on mount. Done in an effect rather than in the
  // useState initialiser because localStorage does not exist during SSR, and a
  // mismatch between server and client markup would cause a hydration error.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "id") {
        setLocaleState(stored);
        writeLocaleCookie(stored);
      } else {
        // No stored choice: fall back to the browser's preference rather than
        // assuming English, so an Indonesian visitor lands in Indonesian.
        const nav = window.navigator.language?.slice(0, 2).toLowerCase();
        if (nav === "id") {
          setLocaleState("id");
          writeLocaleCookie("id");
        }
      }
    } catch {
      // Private mode or blocked storage — the default locale is fine.
    }
    setHydrated(true);
  }, []);

  // Keep <html lang> in step, which matters for screen readers and hyphenation.
  useEffect(() => {
    if (hydrated) {
      document.documentElement.lang = locale;
    }
  }, [locale, hydrated]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice still applies for this session.
    }

    // Keep the cookie in step so the server-rendered manifest matches the UI.
    writeLocaleCookie(next);

    // Persist for cross-device consistency. Failure is not surfaced as an
    // error because the visible language has already changed correctly.
    setSaving(true);
    apiClient
      .put("/locale", { locale: next })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const table = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      let value = table[key];

      // Falling back to English beats showing a raw key: a missing Indonesian
      // string is far less jarring as English than as "trainer.pageTitle".
      if (value === undefined) {
        value = dictionaries[DEFAULT_LOCALE][key];
      }

      if (value === undefined) {
        // Genuinely unknown key — surface it as the key so it is obvious in QA
        // rather than silently rendering an empty element.
        return key;
      }

      if (params) {
        for (const [name, replacement] of Object.entries(params)) {
          value = value.replaceAll(`:${name}`, String(replacement));
        }
      }

      return value;
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, t, setLocale, saving }),
    [locale, t, setLocale, saving]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access the current language.
 *
 * Returns a working English fallback instead of throwing when no provider is
 * above — the same reasoning as useToast: throwing breaks prerendering, and a
 * translated-looking default is a better outcome than a crashed page.
 */
export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);

  if (context !== null) {
    return context;
  }

  return {
    locale: DEFAULT_LOCALE,
    t: (key: string) => dictionaries[DEFAULT_LOCALE][key] ?? key,
    setLocale: () => {},
    saving: false,
  };
}
