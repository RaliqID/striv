/**
 * Final admin-panel i18n pass.
 *
 * Run from frontend/: node scripts/i18n-admin2.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const JOBS = [
  ["app/admin/audit/page.tsx", "AdminAuditPage", [
    ["\n            Search", "\n            {t(\"action.search\")}"],
    ["\n            Clear", "\n            {t(\"action.clear\")}"],
  ]],

  ["app/admin/page.tsx", "AdminOverviewPage", [
    ["\n              Manage users", "\n              {t(\"admin.manageUsers\")}"],
    ["\n              Security", "\n              {t(\"admin.viewSecurity\")}"],
  ]],

  ["app/admin/users/page.tsx", "AdminUsersPage", [
    ["\n            Export CSV", "\n            {t(\"admin.exportCsv\")}"],
    ["\n            Search", "\n            {t(\"action.search\")}"],
    ["\n            Clear", "\n            {t(\"action.clear\")}"],
  ]],

  ["app/admin/training/page.tsx", "AdminTrainingPage", [
    ['toast.success("Trainer assigned.");', 'toast.success(t("training.assigned"));'],
    ['"Couldn\'t assign."', 't("common.actionFailed")'],
    ['{rematching ? "Running…" : "Run matching sweep"}', '{rematching ? t("admin.running") : t(\"admin.runSweep\")}'],
    ['<Stat label="Active clients"', '<Stat label={t("admin.statActiveClients")}'],
    ['<Stat label="Total capacity"', '<Stat label={t("admin.statTotalCapacity")}'],
    ["\n                Waiting for a trainer", "\n                {t(\"admin.waitingForTrainer\")}"],
    ["Every trainer is at capacity. Add a trainer, or free up slots, then run the sweep.", "{t(\"admin.waitingHint\")}"],
    ["No trainers yet. Promote a user to the trainer role to start matching members.", "{t(\"admin.noTrainers\")}"],
  ]],

  ["app/admin/users/[id]/page.tsx", "AdminUserDetailPage", [
    ['toast.success("Account deleted.");', 'toast.success(t("admin.accountDeleted"));'],
    ['message={error || "User not found."}', 'message={error || t("admin.userNotFound")}'],
    ["\n                All users", "\n                {t(\"admin.allUsers\")}"],
    ['label: "Active sessions",', 'labelKey: "admin.activeSessions",'],
    ['title="Account details"', 'title={t("admin.accountDetails")}'],
    ['description="Correct the member\'s name or email address."', 'description={t("admin.accountDetailsDesc")}'],
    ["Changing the email signs the member out of all devices.", "{t(\"admin.emailChangeWarning\")}"],
    ["\n                    Save changes", "\n                    {t(\"settings.saveChanges\")}"],
    ["\n                    Cancel", "\n                    {t(\"action.cancel\")}"],
    ['title="Training profile"', 'title={t("admin.trainingProfile")}'],
    ['description="Onboarding answers supplied by the member."', 'description={t("admin.trainingProfileDesc")}'],
    ['title="No profile data."', 'title={t("admin.noProfileData")}'],
    ['description="The member has not completed onboarding."', 'description={t("admin.noProfileDesc")}'],
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
    if (src.includes(from)) {
      src = src.split(from).join(to);
      applied++;
    }
  }

  // The shared admin-only banner, present in every admin page.
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
    if (re.test(src)) src = src.replace(re, "$1\n  const { t } = useTranslation();");
  }

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    changed++;
    console.log(`  OK    ${file}  (${applied}/${swaps.length})`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${changed} file(s) updated.`);
