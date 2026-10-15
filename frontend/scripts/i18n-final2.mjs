/**
 * Translates the remaining visible English strings.
 *
 * Run from frontend/: node scripts/i18n-final2.mjs
 *
 * Handles both shapes: a pure text node and an inline `>text<` node. Matching is
 * on trimmed content so indentation differences do not silently skip a swap.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** [file, [[visibleText, replacementExpression], ...]] */
const JOBS = [
  ["app/admin/audit/page.tsx", [
    ["Search", "{t(\"action.search\")}"],
    ["Clear", "{t(\"action.clear\")}"],
  ]],
  ["app/admin/users/page.tsx", [
    ["Export CSV", "{t(\"admin.exportCsv\")}"],
    ["Search", "{t(\"action.search\")}"],
    ["Clear", "{t(\"action.clear\")}"],
  ]],
  ["app/coach/page.tsx", [
    ["Send", "{t(\"action.send\")}"],
  ]],
  ["app/error.tsx", [
    ["Something went wrong", "{t(\"error.title\")}"],
    ["An unexpected error occurred. You can try again or head back to the dashboard.", "{t(\"error.body\")}"],
    ["Try again", "{t(\"error.tryAgain\")}"],
    ["Go to dashboard", "{t(\"error.goDashboard\")}"],
  ]],
  ["app/goals/page.tsx", [
    ["Exercise", "{t(\"goals.exercise\")}"],
    ["Cancel", "{t(\"action.cancel\")}"],
  ]],
  ["app/history/page.tsx", [
    ["Start Workout", "{t(\"workout.startWorkout\")}"],
    ["Exercises", "{t(\"nav.exercises\")}"],
    ["Duration", "{t(\"history.duration\")}"],
  ]],
  ["app/insights/page.tsx", [
    ["Log 4+ sessions of a main lift to unlock trend analysis.", "{t(\"insights.unlockHint\")}"],
    ["No insights yet.", "{t(\"insights.empty\")}"],
    ["Start Workout", "{t(\"workout.startWorkout\")}"],
  ]],
  ["app/login/page.tsx", [
    ["Create one", "{t(\"auth.createOne\")}"],
  ]],
  ["app/matching/page.tsx", [
    ["What your trainer does", "{t(\"matching.whatTrainerDoes\")}"],
    ["Meet your trainer", "{t(\"matching.meetTrainer\")}"],
    ["Go to dashboard", "{t(\"matching.goDashboard\")}"],
  ]],
  ["app/onboarding/page.tsx", [
    ["Continue", "{t(\"action.continue\")}"],
    ["Back", "{t(\"onboarding.back\")}"],
  ]],
  ["app/settings/page.tsx", [
    ["Biodata", "{t(\"profile.biodata\")}"],
    ["Training Profile", "{t(\"profile.trainingProfile\")}"],
    ["Experience", "{t(\"profile.experience\")}"],
    ["Primary Goal", "{t(\"profile.primaryGoal\")}"],
    ["Training Frequency (days/week)", "{t(\"profile.frequencyLabel\")}"],
    ["Save", "{t(\"action.save\")}"],
  ]],
  ["app/trainer/profile/page.tsx", [
    ["Specialisation", "{t(\"settings.specialisation\")}"],
    ["Capacity", "{t(\"settings.capacity\")}"],
    ["Bio", "{t(\"settings.bio\")}"],
    ["Save changes", "{t(\"settings.saveChanges\")}"],
  ]],
  ["app/workout/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/routines/page.tsx", [
    ["Exercises", "{t(\"nav.exercises\")}"],
  ]],
];

/** Replace `>TEXT<` on one line. */
function swapInline(src, text, replacement) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  const out = src.replace(new RegExp(`>(${escaped})<`, "g"), () => {
    count++;
    return `>${replacement}<`;
  });
  return { out, count };
}

/** Replace a line that is only TEXT. */
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
