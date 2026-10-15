/**
 * Finishes the admin user-detail page.
 *
 * Run from frontend/: node scripts/i18n-userdetail.mjs
 *
 * Handles attribute-shaped strings (title="X" description="X") as well as text
 * nodes, since this page uses both.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "app", "admin", "users", "[id]", "page.tsx");

/** [attributeName, englishValue, translationKey] */
const ATTRS = [
  ["title", "User account", "admin.userAccount"],
  ["title", "Access control", "admin.accessControl"],
  ["description", "Change what this account can do and where it is signed in.", "admin.accessControlDesc"],
  ["title", "Recent workouts", "admin.recentWorkouts"],
  ["description", "Last 10 sessions", "admin.last10"],
  ["title", "No workouts logged.", "admin.noWorkouts"],
  ["title", "Coach conversations", "admin.coachConversations"],
  ["description", "Last 20 sessions", "admin.last20"],
  ["title", "No conversations.", "admin.noConversations"],
  ["title", "Danger zone", "admin.dangerZone"],
  ["description", "Irreversible actions. These are recorded in the audit log.", "admin.dangerZoneDesc"],
  ["title", "Change this administrator's role?", "admin.confirmRoleChange"],
  ["title", "Delete this account?", "admin.confirmDelete"],
  ["title", "Contains images", "admin.containsImages"],
];

/** [englishText, translationKey] shown via t() */
const TEXTS = [
  ["Joined", "admin.joined"],
  ["Last active", "admin.lastActive"],
  ["Name", "admin.fieldName"],
  ["Email", "admin.fieldEmail"],
  ["Chat messages", "admin.chatMessages"],
];

let src = readFileSync(FILE, "utf8");
let applied = 0;

for (const [attr, value, key] of ATTRS) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "&#39;");
  const variants = [value, value.replace(/'/g, "\\'")];

  for (const v of variants) {
    const from = `${attr}="${v}"`;
    if (src.includes(from)) {
      src = src.split(from).join(`${attr}={t("${key}")}`);
      applied++;
      break;
    }
  }
}

for (const [text, key] of TEXTS) {
  const from = `>${text}<`;
  if (src.includes(from)) {
    src = src.split(from).join(`>{t("${key}")}<`);
    applied++;
  }
}

writeFileSync(FILE, src, "utf8");
console.log(`${applied} replacement(s)`);
for (const [attr, value, key] of ATTRS) {
  const stillThere = src.includes(`${attr}="${value}"`);
  if (stillThere) console.log(`  MISSED  ${attr}="${value}"`);
}
