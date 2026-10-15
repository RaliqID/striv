/**
 * Translates the last user-visible strings.
 * Run from frontend/: node scripts/i18n-final3.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const JOBS = [
  ["app/admin/users/[id]/page.tsx", [
    ["All users", "{t(\"admin.allUsers\")}"],
    ["Suspended", "{t(\"admin.suspendedLabel\")}"],
    ["Active", "{t(\"admin.statusActive\")}"],
    ["Password reset pending", "{t(\"admin.resetPending\")}"],
    ["Edit", "{t(\"action.edit\")}"],
    ["Save changes", "{t(\"settings.saveChanges\")}"],
    ["Cancel", "{t(\"action.cancel\")}"],
    ["Issues a one-time password and signs the member out everywhere.", "{t(\"admin.resetPasswordHint\")}"],
    ["Reset password", "{t(\"admin.resetPassword\")}"],
    ["Sign out everywhere", "{t(\"admin.revokeSessions\")}"],
    ["Permanently removes the member and all of their data. This cannot be undone.", "{t(\"admin.deleteHint\")}"],
    ["Delete account", "{t(\"settings.deleteAccount\")}"],
    ["Temporary password", "{t(\"admin.tempPassword\")}"],
    ["Copy", "{t(\"action.copy\")}"],
  ]],

  ["app/matching/page.tsx", [
    ["Your personal trainer is ready", "{t(\"matching.ready\")}"],
    ["Finding your personal trainer", "{t(\"matching.finding\")}"],
    ["Continue without waiting", "{t(\"matching.continueWithout\")}"],
  ]],

  ["app/onboarding/page.tsx", [
    ["You&apos;ll be matched with a personal trainer", "{t(\"onboarding.matchTitle\")}"],
  ]],

  ["app/register/page.tsx", [
    ["Sign in", "{t(\"auth.signIn\")}"],
  ]],

  ["app/settings/page.tsx", [
    ["Select", "{t(\"settings.select\")}"],
    ["Build Muscle", "{t(\"onboarding.goalMuscle\")}"],
    ["Get Stronger", "{t(\"onboarding.goalStrength\")}"],
    ["Conditioning", "{t(\"onboarding.goalEndurance\")}"],
    ["Download everything you have logged, or permanently remove your account.", "{t(\"settings.dataBody\")}"],
    ["This permanently deletes your profile, every workout, goal and conversation. This cannot be undone.", "{t(\"settings.deleteBody\")}"],
    ["Confirm your password", "{t(\"settings.confirmPassword\")}"],
  ]],

  ["app/trainer/clients/[id]/page.tsx", [
    ["Back to clients", "{t(\"client.backToClients\")}"],
    ["Your client confirms these slots. Once accepted, the relationship is active.", "{t(\"client.scheduleHint\")}"],
  ]],

  ["app/trainer/profile/page.tsx", [
    ["Active clients", "{t(\"settings.activeClients\")}"],
    ["Average rating", "{t(\"settings.averageRating\")}"],
    ["No specialisation (general)", "{t(\"settings.noSpecialisation\")}"],
    ["Build muscle / hypertrophy", "{t(\"settings.specMuscle\")}"],
    ["Get stronger / powerlifting", "{t(\"settings.specStrength\")}"],
    ["Conditioning / endurance", "{t(\"settings.specEndurance\")}"],
    ["Members whose goal matches this are matched to you first.", "{t(\"settings.specHint\")}"],
    ["Maximum clients at once. Once you reach this, no new members are assigned to you.", "{t(\"settings.capacityHint\")}"],
  ]],

  ["app/workout/page.tsx", [
    ["Lobby", "{t(\"workout.lobby\")}"],
  ]],
];

function swapInline(src, text, replacement) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  const out = src.replace(new RegExp(`>(${escaped})<`, "g"), () => {
    count++;
    return `>${replacement}<`;
  });
  return { out, count };
}

function swapPure(src, text, replacement) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  const out = src.replace(new RegExp(`^(\\s+)${escaped}(\\s*)$`, "gm"), (_m, indent) => {
    count++;
    return `${indent}${replacement}`;
  });
  return { out, count };
}

let total = 0;

for (const [file, pairs] of JOBS) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.log(`  SKIP  ${file}`);
    continue;
  }

  let src = readFileSync(path, "utf8");
  let applied = 0;

  for (const [text, replacement] of pairs) {
    let r = swapInline(src, text, replacement);
    src = r.out;
    applied += r.count;
    r = swapPure(src, text, replacement);
    src = r.out;
    applied += r.count;
  }

  if (applied > 0) {
    writeFileSync(path, src, "utf8");
    total += applied;
    console.log(`  OK    ${file}  (${applied})`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${total} node(s) translated.`);
