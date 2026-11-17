"use client";

import Image from "next/image";
import StrivLogo from "@/components/StrivLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import XpBar from "@/components/XpBar";
import LevelUpOverlay from "@/components/LevelUpOverlay";
import ActiveWorkoutDrawer from "@/components/workout/ActiveWorkoutDrawer";
import { useTranslation } from "@/lib/i18n/provider";
import { LEVEL_UP_EVENT, USER_UPDATED_EVENT, Progression } from "@/lib/progression";
import { storeUser } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = {
  key: string;
  href: string;
  icon: string;
};

type NavGroup = {
  titleKey: string;
  items: NavItem[];
};

/**
 * Categorised navigation groups for professional information architecture.
 * Replaces the flat 19-item unsegmented list with clear domain clusters.
 */
const navGroups: NavGroup[] = [
  {
    titleKey: "nav.groupTrain",
    items: [
      { key: "nav.overview", href: "/dashboard", icon: "dashboard" },
      { key: "nav.workout", href: "/workout", icon: "fitness_center" },
      { key: "nav.routines", href: "/routines", icon: "schedule" },
      { key: "nav.exercises", href: "/exercises", icon: "list_alt" },
      { key: "nav.history", href: "/history", icon: "history" },
    ],
  },
  {
    titleKey: "nav.groupIntelligence",
    items: [
      { key: "nav.progress", href: "/progress", icon: "trending_up" },
      { key: "nav.insights", href: "/insights", icon: "psychology" },
      { key: "nav.coach", href: "/coach", icon: "chat" },
      { key: "nav.reviews", href: "/reviews/weekly", icon: "auto_awesome" },
      { key: "nav.records", href: "/records", icon: "emoji_events" },
    ],
  },
  {
    titleKey: "nav.groupCommunity",
    items: [
      { key: "nav.myTrainer", href: "/my-trainer", icon: "support_agent" },
      { key: "nav.leaderboard", href: "/leaderboard", icon: "leaderboard" },
      { key: "nav.achievements", href: "/achievements", icon: "military_tech" },
      { key: "certificate.title", href: "/certificates", icon: "workspace_premium" },
    ],
  },
  {
    titleKey: "nav.groupAccount",
    items: [
      { key: "nav.goals", href: "/goals", icon: "flag" },
      { key: "nav.profile", href: "/profile", icon: "person" },
      { key: "nav.settings", href: "/settings", icon: "settings" },
    ],
  },
];

const bottomNavItems = [
  { key: "nav.overview", href: "/dashboard", icon: "dashboard" },
  { key: "nav.myTrainer", href: "/my-trainer", icon: "support_agent" },
  { key: "nav.workout", href: "/workout", icon: "fitness_center" },
  { key: "nav.progress", href: "/progress", icon: "trending_up" },
  { key: "nav.settings", href: "/settings", icon: "settings" },
];

const adminNavItem: NavItem = { key: "nav.admin", href: "/admin", icon: "admin_panel_settings" };
const trainerNavItem: NavItem = { key: "nav.trainerPanel", href: "/trainer", icon: "fitness_center" };

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 72;

export default function AppLayout({
  children,
  user: propUser,
}: Readonly<{ children: React.ReactNode; user?: any }>) {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(propUser || null);
  const [pinned, setPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
          // Corrupt cache — fall back
        }
      }
    } else {
      setUser(propUser);
    }
  }, [propUser]);

  // Restore sidebar pinned state on desktop mount
  useEffect(() => {
    const savedPin = localStorage.getItem("striv_sidebar_pinned");
    if (savedPin === "true") {
      setPinned(true);
      setCollapsed(false);
    }
  }, []);

  // Close mobile drawer on route transition
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
        storeUser(next);
        return next;
      });
    };

    window.addEventListener(LEVEL_UP_EVENT, handler);
    return () => window.removeEventListener(LEVEL_UP_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { user?: any } | undefined;
      if (!detail?.user) return;
      setUser(detail.user);
      storeUser(detail.user);
    };

    window.addEventListener(USER_UPDATED_EVENT, handler);
    return () => window.removeEventListener(USER_UPDATED_EVENT, handler);
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    setCollapsed(!next);
    localStorage.setItem("striv_sidebar_pinned", String(next));
  };

  const handleMouseEnter = () => {
    if (pinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setCollapsed(false);
  };

  const handleMouseLeave = () => {
    if (pinned) return;
    hoverTimeoutRef.current = setTimeout(() => setCollapsed(true), 250);
  };

  // Build active groups including role-dependent workspaces
  const activeGroups = [...navGroups];
  const roleItems: NavItem[] = [];
  if (user?.role === "trainer") roleItems.push(trainerNavItem);
  if (user?.role === "admin" || user?.is_admin) {
    if (!roleItems.some((r) => r.href === "/trainer")) roleItems.push(trainerNavItem);
    roleItems.push(adminNavItem);
  }
  if (roleItems.length > 0) {
    activeGroups.push({
      titleKey: "role.admin",
      items: roleItems,
    });
  }

  const renderNavGroup = (group: NavGroup, isDrawer = false) => {
    const isExpanded = isDrawer || !collapsed;
    return (
      <div key={group.titleKey} className="w-full">
        {isExpanded ? (
          <div className="px-4 pt-3 pb-1 text-[11px] font-label-caps uppercase tracking-wider text-muted font-bold select-none">
            {t(group.titleKey)}
          </div>
        ) : (
          <div className="my-1.5 mx-3 border-t border-outline-variant/60" />
        )}
        {group.items.length === 0 ? null : (
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  title={!isExpanded ? t(item.key) : undefined}
                  aria-label={!isExpanded ? t(item.key) : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (isDrawer) setMobileMenuOpen(false);
                  }}
                  className={`flex items-center rounded-lg transition-all duration-150 ${
                    !isExpanded
                      ? "mx-3 h-10 w-10 shrink-0 justify-center"
                      : "mx-3 gap-3 px-3 py-2"
                  } ${
                    active
                      ? "bg-secondary-container text-on-secondary-container font-semibold shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[20px] shrink-0"
                    style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
                  >
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className="font-body-md text-sm whitespace-nowrap">{t(item.key)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Mobile top bar with Hamburger Drawer opener */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-margin-mobile py-2.5 bg-surface/90 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("nav.toggleSidebar")}
            className="p-1.5 -ml-1 text-primary hover:bg-surface-container-low rounded-lg transition-colors flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
          <div className="flex items-center gap-2">
            <StrivLogo size={28} className="shrink-0" />
            <h1 className="font-headline-lg-mobile text-lg font-black text-primary tracking-tight">Striv</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher collapsed={true} placement="down" />
          <Link
            href="/insights"
            aria-label={t("nav.insightsAlerts")}
            className="text-primary hover:bg-surface-container-low transition-colors p-2 rounded-full"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">notifications</span>
          </Link>
          {user?.progression && (
            <Link
              href="/achievements"
              aria-label={t("level.levelN", { level: user.progression.level })}
              className="flex h-8 min-w-8 items-center justify-center rounded-full border border-primary/40 bg-primary/10 px-2 font-metric-sm text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              L{user.progression.level}
            </Link>
          )}
          <Link
            href="/profile"
            aria-label={user?.name ? `${t("nav.profileFor")} ${user.name}` : t("nav.yourProfile")}
            className="text-primary hover:bg-surface-container-low transition-colors p-1.5 rounded-full"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true">account_circle</span>
          </Link>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer for Full Grouped Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-primary/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-4/5 max-w-xs bg-surface-container-low h-full flex flex-col shadow-2xl border-r border-outline-variant z-10 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant shrink-0">
              <div className="flex items-center gap-2.5">
                <StrivLogo size={32} />
                <span className="font-headline-lg text-lg font-black text-primary">Striv</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t("action.close")}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-highest transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {user && (
              <div className="p-3 mx-3 mt-3 bg-surface-container-highest rounded-lg border border-outline-variant flex items-center gap-3 shrink-0">
                <div className="relative w-9 h-9 rounded-full bg-tertiary-fixed overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface font-semibold text-sm">
                  {user.avatar_url ? (
                    <Image src={user.avatar_url} alt="" fill sizes="36px" unoptimized className="object-cover" />
                  ) : user.name ? (
                    user.name.charAt(0).toUpperCase()
                  ) : (
                    "U"
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-metric-sm text-sm text-on-surface truncate">{user.name}</p>
                  <p className="font-label-caps text-xs text-on-surface-variant">
                    {user.role === "admin" || user.is_admin
                      ? t("role.admin")
                      : user.role === "trainer"
                        ? t("role.trainer")
                        : t("role.member")}
                  </p>
                </div>
              </div>
            )}

            <div className="px-3 pt-2">
              <XpBar
                progression={user?.progression ?? null}
                collapsed={false}
                badgeCount={user?.achievement_count ?? null}
              />
            </div>

            <nav className="flex-1 overflow-y-auto px-1 py-2 space-y-1">
              {activeGroups.map((grp) => renderNavGroup(grp, true))}
            </nav>

            <div className="p-4 border-t border-outline-variant space-y-2 shrink-0">
              <Link
                href="/workout"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full bg-primary text-on-primary font-metric-sm text-sm py-2.5 rounded-lg hover:bg-primary/90 transition-colors text-center font-semibold"
              >
                {t("nav.startTracking")}
              </Link>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar with Pinned & Hover Controls */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-surface-container-low border-r border-outline-variant transition-all duration-200 ease-in-out"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header / Pin Button */}
        <div
          className={`flex items-center shrink-0 h-16 ${
            collapsed ? "justify-center px-0" : "justify-between px-4"
          }`}
        >
          <div className="flex items-center gap-3">
            <StrivLogo size={38} className="shrink-0" />
            {!collapsed && (
              <span className="font-headline-lg text-headline-lg font-black text-primary whitespace-nowrap overflow-hidden">
                Striv
              </span>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={togglePin}
              title={pinned ? "Unpin sidebar" : "Pin sidebar"}
              aria-label={t("nav.toggleSidebar")}
              className={`p-1.5 rounded-md transition-colors ${
                pinned
                  ? "bg-primary text-on-primary"
                  : "text-muted hover:bg-surface-container-highest hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {pinned ? "push_pin" : "chevron_left"}
              </span>
            </button>
          )}
        </div>

        {/* User badge */}
        {!collapsed && user && (
          <div className="mx-3 mb-2 p-2.5 bg-surface-container-highest rounded-lg border border-outline-variant flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-full bg-tertiary-fixed overflow-hidden flex-shrink-0 flex items-center justify-center text-on-surface font-semibold text-sm">
              {user.avatar_url ? (
                <Image src={user.avatar_url} alt="" fill sizes="36px" unoptimized className="object-cover" />
              ) : user.name ? (
                user.name.charAt(0).toUpperCase()
              ) : (
                "U"
              )}
            </div>
            <div className="min-w-0">
              <p className="font-metric-sm text-sm text-on-surface truncate">{user.name}</p>
              <p className="font-label-caps text-xs text-on-surface-variant">
                {user.role === "admin" || user.is_admin
                  ? t("role.admin")
                  : user.role === "trainer"
                    ? t("role.trainer")
                    : t("role.member")}
              </p>
            </div>
          </div>
        )}

        {/* Progression rail */}
        <XpBar
          progression={user?.progression ?? null}
          collapsed={collapsed}
          badgeCount={user?.achievement_count ?? null}
        />

        {/* Nav Items — Categorised in Hierarchical Groups */}
        <nav className="flex-1 flex flex-col mt-1 overflow-y-auto overflow-x-hidden pb-4">
          {activeGroups.map((grp) => renderNavGroup(grp, false))}
        </nav>

        {/* Start Tracking CTA button & Language — when expanded */}
        {!collapsed && (
          <div className="p-3 border-t border-outline-variant space-y-2 shrink-0">
            <Link
              href="/workout"
              className="block w-full bg-primary text-on-primary font-metric-sm text-sm py-2.5 rounded-lg hover:bg-primary/90 transition-colors text-center font-semibold"
            >
              {t("nav.startTracking")}
            </Link>
            <LanguageSwitcher />
          </div>
        )}
      </aside>

      {/* Main content area */}
      <main
        className={`flex-1 w-full transition-all duration-200 ease-in-out ${
          collapsed ? "md:ml-[72px]" : "md:ml-[256px]"
        }`}
      >
        <div className="px-margin-mobile pt-6 pb-28 md:py-8 md:px-margin-desktop max-w-container-max mx-auto">
          {children}
        </div>
      </main>

      {/* Persistent Floating Active Workout Mini-Drawer */}
      <ActiveWorkoutDrawer />

      {/* Mobile bottom quick nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-surface border-t border-outline-variant flex justify-around items-center h-16 safe-bottom z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
        {bottomNavItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-label-caps ${
                active ? "text-primary font-bold" : "text-on-surface-variant"
              }`}
            >
              <span className={`material-symbols-outlined text-[24px] mb-0.5 ${active ? "text-primary" : ""}`}>
                {item.icon}
              </span>
              <span className="truncate max-w-[64px] text-center leading-tight">{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Celebration Level-Up Modal */}
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
