/**
 * Applies the admin-panel and coach i18n swaps.
 *
 * Run from frontend/: node scripts/i18n-final.mjs
 *
 * Node rather than shell: previous PowerShell passes corrupted non-ASCII
 * characters, and there are em-dashes and apostrophes throughout this copy.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const JOBS = [
  ["app/admin/page.tsx", "AdminOverviewPage", [
    ["\n              Manage users", "\n              {t(\"admin.manageUsers\")}"],
    ["\n              Security", "\n              {t(\"admin.viewSecurity\")}"],
    ['message="This area is available to administrators only." near', 'XX_UNUSED_XX'],
    ['detail="Active in 30 days"', 'detail={t("admin.activeIn30")}'],
    ['label="Volume lifted"', 'label={t("admin.volumeLifted")}'],
  ]],

  ["app/admin/security/page.tsx", "AdminSecurityPage", [
    ['{ value: 1, label: "Last 24 hours" },', '{ value: 1, labelKey: "admin.last24h" },'],
    ['Login throttling is active', '{t("admin.throttleActive")}'],
    ['Each IP is limited to 20 attempts per minute, and each account to 5 attempts per', '{t("admin.throttleBody1")}'],
    ['label: "Total attempts",', 'labelKey: "admin.totalAttempts",'],
    ['label: "Failed attempts",', 'labelKey: "admin.failedAttempts",'],
    ['label: "Distinct sources",', 'labelKey: "admin.distinctSources",'],
    ['label: "Locked accounts",', 'labelKey: "admin.lockedAccounts",'],
    ['detail: "Currently over the limit",', 'detailKey: "admin.overLimit",'],
  ]],

  ["app/admin/audit/page.tsx", "AdminAuditPage", [
    ["\n          Search", "\n          {t(\"action.search\")}"],
    ["\n            Clear", "\n            {t(\"action.clear\")}"],
    ['title={filtersActive ? "No entries match these filters." : "No admin actions recorded yet."}', 'title={filtersActive ? t("admin.auditEmptyFiltered") : t("admin.auditEmptyTitle")}'],
    ['? "Try a different search term or clear the filters."', '? t("admin.emptyFilteredBody")'],
    [': "Actions such as suspending an account or resetting a password will appear here."', ': t("admin.auditEmptyBody")}'],
    ['Clear filters', '{t("admin.clearFilters")}'],
  ]],

  ["app/admin/users/page.tsx", "AdminUsersPage", [
    ['{ value: "admin", label: "Administrators" },', '{ value: "admin", labelKey: "admin.roleAdminPlural" },'],
    ['setError("Could not export users.");', 'setError(t("admin.exportFailed"));'],
    ["\n              Export CSV", "\n              {t(\"admin.exportCsv\")}"],
    ["\n              Search", "\n              {t(\"action.search\")}"],
    ["\n              Clear", "\n              {t(\"action.clear\")}"],
    ['title={filtersActive ? "No users match these filters." : "No users yet."}', 'title={filtersActive ? t("admin.usersEmptyFiltered") : t("admin.usersEmptyTitle")}'],
    ['? "Try a different search term or clear the filters."', '? t("admin.emptyFilteredBody")'],
    [': "Accounts will appear here once people sign up."', ': t("admin.usersEmptyBody")}'],
    ['Clear filters', '{t("admin.clearFilters")}'],
    [">Trainer</Badge>", ">{t(\"role.trainer\")}</Badge>"],
  ]],

  ["app/admin/training/page.tsx", "AdminTrainingPage", [
    ['"Couldn\'t load training data."', 't("common.loadFailed")'],
    ['"Rematch failed."', 't("admin.rematchFailed")'],
  ]],

  ["app/coach/page.tsx", "CoachPage", [
    ["\n            New chat", "\n            {t(\"coach.newChat\")}"],
    ["\n            No conversations yet.", "\n            {t(\"coach.noConversations\")}"],
    ['alt="Attached image"', 'alt={t("coach.attachedImage")}'],
    ['alt="Image to attach"', 'alt={t("coach.imageToAttach")}'],
    ["\n            Image attached", "\n            {t(\"coach.imageAttached\")}"],
    ['placeholder="Ask about your training..."', 'placeholder={t("coach.inputPlaceholder")}'],
    ["Ask about your training, progress, or get advice based on your data.", "{t(\"coach.emptyHint\")}"],
  ]],

  ["app/workouts/[id]/page.tsx", "SessionDetailPage", [
    ['setError("Couldn\'t load workout.");', 'setError(t("common.loadFailed"));'],
    ["\n          Workout not found.", "\n          {t(\"history.notFound\")}"],
    ["\n          Back to History", "\n          {t(\"history.backToHistory\")}"],
    ["\n          Retry", "\n          {t(\"action.retry\")}"],
    ['{data.notes?.trim() ? data.notes.trim() : "Workout Session"}', '{data.notes?.trim() ? data.notes.trim() : t("workout.session")}'],
    ["\n              In progress", "\n              {t(\"workout.inProgress\")}"],
    ['<span className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">Volume</span>', '<span className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">{t("progress.volume")}</span>'],
    ["\n            No exercises were logged in this session.", "\n            {t(\"history.noExercises\")}"],
    ["\n            No sets logged.", "\n            {t(\"history.noSets\")}"],
  ]],
];

let changed = 0;

for (const [file, component, swaps] of JOBS) {
  const path = resolve(ROOT, file);

  if (!existsSync(path)) {
    console.log(`  SKIP  ${file}`);
    continue;
  }

  const before = readFileSync(path, "utf8");
  let src = before;
  let applied = 0;

  for (const [from, to] of swaps) {
    if (from === 'message="This area is available to administrators only." near') continue;
    if (src.includes(from)) {
      src = src.split(from).join(to);
      applied++;
    }
  }

  // Shared error banner text, which appears in several admin pages.
  src = src.split('message="This area is available to administrators only."')
    .join('message={t("admin.adminsOnly")}');

  if (!src.includes('from "@/lib/i18n/provider"')) {
    const lines = src.split("\n");
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith("import ")) last = i;
    lines.splice(last + 1, 0, 'import { useTranslation } from "@/lib/i18n/provider";');
    src = lines.join("\n");
  }

  if (!src.includes("const { t } = useTranslation();")) {
    const re = new RegExp(`(export default function ${component}\\([^)]*\\)\\s*\\{)`);
    if (re.test(src)) {
      src = src.replace(re, "$1\n  const { t } = useTranslation();");
    } else {
      console.log(`  WARN  ${file}: component ${component} not matched`);
    }
  }

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    changed++;
    console.log(`  OK    ${file}  (${applied} swaps)`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${changed} file(s) updated.`);
