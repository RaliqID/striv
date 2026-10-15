/**
 * Finishes the last English strings on the admin user-detail page.
 * Run from frontend/: node scripts/i18n-userdetail2.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "app", "admin", "users", "[id]", "page.tsx");

let src = readFileSync(FILE, "utf8");
let n = 0;

/** Exact literal -> t() replacement. */
const SWAPS = [
  ['{user.is_suspended ? "Suspended" : "Active"}',
   '{user.is_suspended ? t("admin.userSuspended") : t("admin.statusActive")}'],

  ['? "This member cannot sign in. Suspending also ends all sessions."\n                  : "Suspending blocks sign-in immediately and revokes every session."',
   '? t("admin.suspendBodyOn")\n                  : t("admin.suspendBodyOff")'],

  ['{user.is_suspended ? "Unsuspend account" : "Suspend account"}',
   '{user.is_suspended ? t("admin.unsuspend") : t("admin.suspend")}'],

  ['confirmLabel={user.is_suspended ? "Unsuspend account" : "Suspend account"}',
   'confirmLabel={user.is_suspended ? t("admin.unsuspend") : t("admin.suspend")}'],

  ['>Password</p>', '>{t("admin.password")}</p>'],
  ['>Active sessions</p>', '>{t("admin.activeSessions")}</p>'],
];

for (const [from, to] of SWAPS) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    n++;
  } else {
    console.log(`  MISS  ${from.slice(0, 70)}`);
  }
}

writeFileSync(FILE, src, "utf8");
console.log(`${n}/${SWAPS.length} applied`);
