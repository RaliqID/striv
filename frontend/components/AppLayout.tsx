"use client";

import StrivLogo from "@/components/StrivLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import XpBar from "@/components/XpBar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import { useTranslation } from "@/lib/i18n/provider";
import { LEVEL_UP_EVENT, USER_UPDATED_EVENT, Progression } from "@/lib/progression";
import { storeUser } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Nav items carry translation keys rather than literals, so the label changes
 * with the language without the list itself needing to be rebuilt.
 */
const navItems = [
  { key: "nav.overview", href: "/dashboard", icon: "dashboard" },
  // Placed high because the trainer relationship is the core of the product:
  // the programme and schedule the member follows live here.
  { key: "nav.myTrainer", href: "/my-trainer", icon: "support_agent" },
  { key: "nav.workout", href: "/workout", icon: "fitness_center" },
  { key: "nav.progress", href: "/progress", icon: "trending_up" },
  // Progression sits next to Progress on purpose: one is the body's record, the
  // other the member's standing, and they are read together.
  { key: "nav.achievements", href: "/achievements", icon: "military_tech" },
  // Sits directly under Achievements: badges are the milestones you collect
  // along the way, certificates are the ones you finished, and they are read
  // as one story.
  { key: "certificate.title", href: "/certificates", icon: "workspace_premium" },
  { key: "nav.leaderboard", href: "/leaderboard", icon: "leaderboard" },
  { key: "nav.exercises", href: "/exercises", icon: "list_alt" },
  { key: "nav.goals", href: "/goals", icon: "flag" },
  { key: "nav.routines", href: "/routines", icon: "schedule" },
  { key: "nav.insights", href: "/insights", icon: "psychology" },
  { key: "nav.coach", href: "/coach", icon: "chat" },
  { key: "nav.reviews", href: "/reviews/weekly", icon: "auto_awesome" },
  { key: "nav.history", href: "/history", icon: "history" },
  { key: "nav.records", href: "/records", icon: "emoji_events" },
  { key: "nav.profile", href: "/profile", icon: "person" },
  { key: "nav.settings", href: "/settings", icon: "settings" },
];

const bottomNavItems = [
  { key: "nav.overview", href: "/dashboard", icon: "dashboard" },
  // Replaces Exercises on mobile: the four-slot bar is prime real estate and
  // "my trainer" is a daily destination, whereas the exercise library is a
  // reference the member looks up less often.
  { key: "nav.myTrainer", href: "/my-trainer", icon: "support_agent" },
  { key: "nav.workout", href: "/workout", icon: "fitness_center" },
  { key: "nav.progress", href: "/progress", icon: "trending_up" },
  { key: "nav.settings", href: "/settings", icon: "settings" },
];

const adminNavItem = { key: "nav.admin", href: "/admin", icon: "admin_panel_settings" };
const trainerNavItem = { key: "nav.trainerPanel", href: "/trainer", icon: "fitness_center" };

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 72;

export default function AppLayout({
  children,
  user: propUser,
}: Readonly<{ children: React.ReactNode; user?: any }>) {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(propUser || null);
  const [collapsed, setCollapsed] = useState(true);
  // Set while the full-screen level-up celebration is open; null means hidden.
  const [levelUp, setLevelUp] = useState<{ level: number; progression: Progression } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!propUser) {
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          // Corrupt cache — fall back to the prop/no user rather than crashing.
        }
      }
    } else {
      setUser(propUser);
    }
  }, [propUser]);

  /*
   * The layout owns the level-up celebration so it works on every page, not just
   * the reward screen that triggers it. Pages fire a window event rather than
   * passing props through the tree, because the pages in between do not care
   * about levels and would only be scaffolding for the prop.
   *
   * The same handler also refreshes the rail: the stored progression is stale by
   * the moment this fires, and a celebration that leaves the sidebar showing the
   * old level undermines the thing it is celebrating.
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        level: number;
        progression: Progression;
      };
      if (!detail?.progression) return;

      setLevelUp({ level: detail.level, progression: detail.progression });

      setUser((prev: any) => {
        if (!prev) return prev;
        const next = { ...prev, progression: detail.progression };
        // Persisted so a reload before the next /auth/user fetch agrees with
        // what the member was just shown.
        storeUser(next);
        return next;
      });
    };

    window.addEventListener(LEVEL_UP_EVENT, handler);
    return () => window.removeEventListener(LEVEL_UP_EVENT, handler);
  }, []);

  /**
   * Adopt a user object changed elsewhere in the app.
   *
   * The sidebar renders the member's photo and name, but it owns its own copy of
   * the user. When the profile page saves a new photo, that copy is stale — the
   * rail would keep showing the previous image (or the initials) until the next
   * full load, which reads as a failed upload even though it succeeded.
   *
   * An event rather than lifted state: the profile page lives in a different
   * subtree and cannot reach this component, and threading a callback through
   * every page that might change a photo would couple them all to this feature.
   *
   * The whole object is adopted rather than merging individual fields, so
   * whatever the sender changed is reflected without this listener needing to
   * know which fields exist.
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { user?: any } | undefined;

      if (!detail?.user) return;

      setUser(detail.user);
      // Persisted so a reload agrees with what the member was just shown.
      storeUser(detail.user);
    };

    window.addEventListener(USER_UPDATED_EVENT, handler);
    return () => window.removeEventListener(USER_UPDATED_EVENT, handler);
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setCollapsed(false);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => setCollapsed(true), 300);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-margin-mobile py-3 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-black text-primary">Striv</h1>
        <div className="flex items-center gap-3">
          {/* Language first on mobile: it is the control a user who cannot read
              the current language needs to find before anything else. */}
          <LanguageSwitcher />
          {/* Both controls lead somewhere real: a decorative bell that does
              nothing is worse than no bell, because it implies a feature. */}
          <Link
            href="/insights"
            aria-label={t("nav.insightsAlerts")}
            className="text-primary hover:bg-surface-container-low transition-colors p-2 rounded-full"
          >
            <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
          </Link>
          {/* The XpBar lives in the desktop rail, which is hidden on mobile — so
              the level would be unreachable on a phone. This mirrors it in the
              top bar, where the member is already looking. */}
          {user?.progression && (
            <Link
              href="/achievements"
              aria-label={t("level.levelN", { level: user.progression.level })}
              className="flex h-9 min-w-9 items-center justify-center rounded-full border border-primary/40 bg-primary/10 px-2 font-metric-sm text-metric-sm font-bold text-primary transition-colors hover:bg-primary/20"
            >
              {user.progression.level}
            </Link>
          )}
          <Link
            href="/profile"
            aria-label={user?.name ? `${t("nav.profileFor")} ${user.name}` : t("nav.yourProfile")}
            className="text-primary hover:bg-surface-container-low transition-colors p-2 rounded-full"
          >
            <span className="material-symbols-outlined" aria-hidden="true">account_circle</span>
          </Link>
        </div>
      </header>

      {/*
        Desktop sidebar. `overflow-hidden` is deliberately NOT used here: it
        clipped the nav's own scroll container and produced a nested scrollbar
        inside the rail. Each section manages its own overflow instead.
      */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-surface-container-low border-r border-outline-variant transition-all duration-200 ease-in-out"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Logo area — centred as a square when collapsed so it is not clipped */}
        <div
          className={`flex items-center shrink-0 h-16 ${
            collapsed ? "justify-center px-0" : "gap-3 px-4"
          }`}
        >
          <StrivLogo size={40} className="shrink-0" />
          {!collapsed && (
            <span className="font-headline-lg text-headline-lg font-black text-primary whitespace-nowrap overflow-hidden">
              Striv
            </span>
          )}
        </div>

        {/* User badge — only when expanded */}
        {!collapsed && user && (
          <div className="mx-3 mb-2 p-3 bg-surface-container-highest rounded-lg border border-outline-variant flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-tertiary-fixed overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface font-semibold">
              {/*
                The member's photo when they have one, initials otherwise.

                Same fallback rule as the profile page, so the two never disagree
                about what this account looks like. The URL is versioned, so a new
                upload produces a new src and the browser fetches it instead of
                reusing the cached image.
              */}
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- served
                // from an API route with a versioned query, not a static asset,
                // so next/image cannot optimise it.
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : user.name ? (
                user.name.charAt(0).toUpperCase()
              ) : (
                "U"
              )}
            </div>
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface truncate">{user.name}</p>
              <p className="font-label-caps text-label-caps text-on-surface-variant">
                {/* Role now comes from the `role` field; is_admin is kept only
                    as a fallback for a stale cached user object. */}
                {user.role === "admin" || user.is_admin
                  ? t('role.admin')
                  : user.role === "trainer"
                    ? t('role.trainer')
                    : t('role.member')}
              </p>
            </div>
          </div>
        )}

        {/* Progression rail — sits directly under the user badge and above the
            nav on purpose: it is ambient, so it must be visible on every page
            without navigation. It reads as part of "you" (with the avatar) and
            stays out of the way of the destinations below. */}
        <XpBar
          progression={user?.progression ?? null}
          collapsed={collapsed}
          badgeCount={user?.achievement_count ?? null}
        />

        {/* Nav items. Collapsed uses a centred square target (no horizontal
            padding) so a 20px icon sits inside the 72px rail without clipping. */}
        <nav className="flex-1 flex flex-col gap-1 mt-2 overflow-y-auto overflow-x-hidden">
          {(() => {
            /*
             * Panel links are role-dependent: an admin gets the admin panel,
             * a trainer gets their client workspace, and a trainer who is also
             * an admin gets both. Concatenated in one place rather than nested
             * ternaries inside the JSX below.
             */
            const items = [...navItems];
            if (user?.role === "trainer") items.push(trainerNavItem);
            if (user?.role === "admin" || user?.is_admin) {
              items.push(trainerNavItem, adminNavItem);
            }
            return items;
          })().map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                title={collapsed ? t(item.key) : undefined}
                aria-label={collapsed ? t(item.key) : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center rounded-lg transition-all duration-150 ${
                  collapsed
                    ? "mx-3 h-11 w-11 shrink-0 justify-center"
                    : "mx-3 gap-3 px-3 py-2.5"
                } ${
                  active
                    ? "bg-secondary-container text-on-secondary-container font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px] shrink-0"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="font-body-md text-body-md whitespace-nowrap">{t(item.key)}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Start Tracking button — only when expanded */}
        {!collapsed && (
          <div className="p-3 border-t border-outline-variant space-y-3">
            <Link
              href="/workout"
              className="block w-full bg-primary text-on-primary font-metric-sm text-metric-sm py-3 rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              {t("nav.startTracking")}
            </Link>
            <LanguageSwitcher />
          </div>
        )}
      </aside>

      {/* Main content — responsive left margin: 0 on mobile (sidebar hidden),
          sidebar width on md+ via Tailwind classes (inline style would leak
          the margin into mobile and force horizontal scroll) */}
      <main
        className={`flex-1 w-full transition-all duration-200 ease-in-out ${
          collapsed ? "md:ml-[72px]" : "md:ml-[256px]"
        }`}
      >
        <div className="px-margin-mobile py-8 md:px-margin-desktop max-w-container-max mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-surface border-t border-outline-variant flex justify-around items-center h-16 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
        {bottomNavItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-label-caps ${
                active ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <span className={`material-symbols-outlined text-[24px] mb-1 ${active ? "text-primary" : ""}`}>
                {item.icon}
              </span>
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Rendered last and outside <main> so the celebration overlays the whole
          page — the rail, the top bar and the content alike. */}
      {levelUp && (
        <LevelUpOverlay
          level={levelUp.level}
          progression={levelUp.progression}
          onDismiss={() => setLevelUp(null)}
        />
      )}
    </div>
  );
}