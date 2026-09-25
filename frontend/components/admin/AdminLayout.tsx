"use client";

import AppLayout from "@/components/AppLayout";
import { ToastProvider } from "@/components/admin/Toast";
import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { label: "Overview", href: "/admin", icon: "monitoring", exact: true },
  { label: "Users", href: "/admin/users", icon: "group" },
  { label: "Security", href: "/admin/security", icon: "shield" },
  { label: "Audit log", href: "/admin/audit", icon: "history_edu" },
];

/**
 * Shell for every admin page: the app chrome, a section nav, and the toast
 * provider that action feedback depends on.
 *
 * Section nav is a tab strip rather than a second sidebar so it does not
 * compete with the main navigation, and it collapses to a scrollable row on
 * mobile where a sidebar would be unusable.
 */
export default function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <AppLayout>
      <ToastProvider>
        <div className="mx-auto w-full max-w-container-max min-w-0 space-y-6">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Administration</p>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
                {description && (
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{description}</p>
                )}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>

          <nav
            aria-label="Admin sections"
            className="-mx-margin-mobile overflow-x-auto border-b border-outline-variant px-margin-mobile md:mx-0 md:px-0"
          >
            <ul className="flex min-w-max gap-1">
              {sections.map((section) => {
                const active = isActive(section.href, section.exact);
                return (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      aria-current={active ? "page" : undefined}
                      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 font-metric-sm text-metric-sm transition-colors ${
                        active
                          ? "border-primary text-primary"
                          : "border-transparent text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        {section.icon}
                      </span>
                      {section.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {children}
        </div>
      </ToastProvider>
    </AppLayout>
  );
}
