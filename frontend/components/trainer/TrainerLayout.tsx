"use client";

import AppLayout from "@/components/AppLayout";
import { useTranslation } from "@/lib/i18n/provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const trainerSections = [
  { key: "panel.clients", href: "/trainer", icon: "group", exact: true },
  { key: "panel.profile", href: "/trainer/profile", icon: "badge" },
];

const adminSections = [
  { key: "admin.overview", href: "/admin", icon: "monitoring", exact: true },
  { key: "admin.users", href: "/admin/users", icon: "group" },
  { key: "admin.training", href: "/admin/training", icon: "fitness_center" },
  { key: "admin.security", href: "/admin/security", icon: "shield" },
  { key: "admin.auditLog", href: "/admin/audit", icon: "history_edu" },
];

/**
 * Shell for the trainer workspace.
 *
 * Reuses the admin chrome deliberately: a trainer's job is data-dense and
 * table-oriented in the same way an admin's is, and the two share the app's
 * navigation. What differs is the section list, which swaps the admin tabs for
 * the trainer's own when the visitor is a trainer rather than an admin — or
 * shows both for an account that is both.
 */
export default function TrainerLayout({
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
  const { t } = useTranslation();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) setRole(JSON.parse(stored)?.role ?? null);
    } catch {
      // A corrupt cache just means we fall back to the trainer-only tabs.
    }
  }, []);

  const isAdmin = role === "admin";
  const sections = isAdmin ? [...trainerSections, ...adminSections] : trainerSections;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <AppLayout>
      {/*
        No ToastProvider here.

        It used to wrap this layout's content, which placed it BELOW the pages
        that call useToast() — context flows downward only, so a page calling the
        hook during its own render resolved to the no-op fallback and every
        confirmation was silently discarded. The provider now lives in the root
        layout, above every page.

        Keeping a second one here would be worse than redundant: it renders its
        own toast container, so a toast dispatched from inside this layout would
        appear in a different place than one dispatched from the page above it.
        One provider, one place for toasts to appear.
      */}
      <div className="mx-auto w-full max-w-container-max min-w-0 space-y-6">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              {isAdmin ? t("panel.trainerWorkspace") : t("panel.personalTrainer")}
            </p>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
                {description && (
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                    {description}
                  </p>
                )}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>

          <nav
            aria-label={t("panel.sections")}
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
                      {t(section.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {children}
        </div>
    </AppLayout>
  );
}
