"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n/translations";
import { useEffect, useRef, useState } from "react";

/**
 * Language switcher.
 *
 * A modal-style panel rather than a hover dropdown. The hover version was
 * unusable: the sidebar collapses its own children on mouse-leave, so moving
 * the cursor toward the menu closed the menu before it could be clicked. A
 * click-toggled panel is immune to that, and works the same on touch.
 *
 * Each option is labelled in its OWN language ("Bahasa Indonesia", not
 * "Indonesian"). Someone who cannot read the current locale must still be able
 * to find theirs — translating the names would defeat the point.
 */
export default function LanguageSwitcher({
  collapsed = false,
  placement = "up",
}: {
  collapsed?: boolean;
  /**
   * Which way the menu opens.
   *
   * The sidebar puts it at the bottom of a tall rail, so the menu must rise or
   * it would be cut off by the window edge. The landing page's top bar sits at
   * the TOP of the page, where a rising menu would open off-screen instead —
   * there it has to drop downward. One component, because the list, the
   * keyboard handling and the outside-click behaviour are identical either way
   * and duplicating them would let the two drift apart.
   */
  placement?: "up" | "down";
}) {
  const { locale, setLocale, saving, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.changeLanguage")}
        title={collapsed ? current.native : undefined}
        className={`flex items-center rounded-lg border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface ${
          collapsed ? "h-11 w-11 justify-center" : "w-full gap-2 px-3 py-2"
        } ${open ? "bg-surface-container-high text-on-surface" : ""}`}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          language
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left font-metric-sm text-metric-sm">
              {current.native}
            </span>
            {saving && (
              <span
                className="material-symbols-outlined animate-spin text-[14px] opacity-60"
                aria-hidden="true"
              >
                progress_activity
              </span>
            )}
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              {open ? "expand_less" : "expand_more"}
            </span>
          </>
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("settings.language")}
          className={`absolute z-[60] overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-xl ${
            placement === "down" ? "top-full right-0 mt-2" : "bottom-full mb-2"
          } ${collapsed ? "left-0 w-56" : "left-0 w-full min-w-[200px]"}`}
        >
          {LOCALES.map((option) => {
            const active = option.code === locale;
            return (
              <li key={option.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(option.code as Locale);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-high ${
                    active ? "bg-surface-container-low" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded border border-outline-variant font-label-caps text-[10px] text-on-surface-variant">
                      {option.flag}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface">
                      {option.native}
                    </span>
                  </span>
                  {active && (
                    <span
                      className="material-symbols-outlined text-[18px] text-primary"
                      aria-hidden="true"
                    >
                      check
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
