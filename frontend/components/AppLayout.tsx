"use client";

import StrivLogo from "@/components/StrivLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: "dashboard" },
  { label: "Workout", href: "/workout", icon: "fitness_center" },
  { label: "Progress", href: "/progress", icon: "trending_up" },
  { label: "Exercises", href: "/exercises", icon: "list_alt" },
  { label: "Goals", href: "/goals", icon: "flag" },
  { label: "Routines", href: "/routines", icon: "schedule" },
  { label: "Insights", href: "/insights", icon: "psychology" },
  { label: "Coach", href: "/coach", icon: "chat" },
  { label: "Reviews", href: "/reviews/weekly", icon: "auto_awesome" },
  { label: "History", href: "/history", icon: "history" },
  { label: "Records", href: "/records", icon: "emoji_events" },
  { label: "Profile", href: "/profile", icon: "person" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

const bottomNavItems = [
  { label: "Overview", href: "/dashboard", icon: "dashboard" },
  { label: "Workout", href: "/workout", icon: "fitness_center" },
  { label: "Progress", href: "/progress", icon: "trending_up" },
  { label: "Exercises", href: "/exercises", icon: "list_alt" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

const adminNavItem = { label: "Admin", href: "/admin", icon: "admin_panel_settings" };

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 72;

export default function AppLayout({
  children,
  user: propUser,
}: Readonly<{ children: React.ReactNode; user?: any }>) {
  const [user, setUser] = useState<any>(propUser || null);
  const [collapsed, setCollapsed] = useState(true);
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
          {/* Both controls lead somewhere real: a decorative bell that does
              nothing is worse than no bell, because it implies a feature. */}
          <Link
            href="/insights"
            aria-label="Insights and alerts"
            className="text-primary hover:bg-surface-container-low transition-colors p-2 rounded-full"
          >
            <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
          </Link>
          <Link
            href="/profile"
            aria-label={user?.name ? `Profile for ${user.name}` : "Your profile"}
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
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface truncate">{user.name}</p>
              <p className="font-label-caps text-label-caps text-on-surface-variant">
                {user.is_admin ? "Administrator" : "Member"}
              </p>
            </div>
          </div>
        )}

        {/* Nav items. Collapsed uses a centred square target (no horizontal
            padding) so a 20px icon sits inside the 72px rail without clipping. */}
        <nav className="flex-1 flex flex-col gap-1 mt-2 overflow-y-auto overflow-x-hidden">
          {(user?.is_admin ? [...navItems, adminNavItem] : navItems).map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
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
                  <span className="font-body-md text-body-md whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Start Tracking button — only when expanded */}
        {!collapsed && (
          <div className="p-3 border-t border-outline-variant">
            <Link
              href="/workout"
              className="block w-full bg-primary text-on-primary font-metric-sm text-metric-sm py-3 rounded-lg hover:bg-primary/90 transition-colors text-center"
            >
              Start Tracking
            </Link>
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
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full text-[10px] font-label-caps ${
                active ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <span className={`material-symbols-outlined text-[24px] mb-1 ${active ? "text-primary" : ""}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}