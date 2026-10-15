/**
 * Translates the final 17 user-visible strings.
 * Run from frontend/: node scripts/i18n-final4.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const JOBS = [
  ["app/admin/users/[id]/page.tsx", [
    ["Done", "{t(\"action.done\")}"],
    ["They will get the trainer workspace: their own client list, programme builder, schedule editor and live session monitoring.", "{t(\"admin.makeTrainerHint\")}"],
    ["Specialisation", "{t(\"settings.specialisation\")}"],
    ["Build muscle / hypertrophy", "{t(\"settings.specMuscle\")}"],
    ["Get stronger / powerlifting", "{t(\"settings.specStrength\")}"],
    ["Conditioning / endurance", "{t(\"settings.specEndurance\")}"],
    ["Capacity", "{t(\"settings.capacity\")}"],
    ["Maximum concurrent clients before matching stops routing to them.", "{t(\"admin.capacityHint\")}"],
  ]],

  ["app/insights/page.tsx", [
    ["Evidence-based insights derived from your training data. Deterministic patterns first, AI interpretation second.", "{t(\"insights.feedBody\")}"],
    ["Proj", "{t(\"insights.proj\")}"],
  ]],

  ["app/reviews/weekly/page.tsx", [
    ["AI-interpreted training week summaries. Generated from your workout data.", "{t(\"reviews.body\")}"],
  ]],

  ["app/routines/page.tsx", [
    ["Cancel", "{t(\"action.cancel\")}"],
  ]],

  ["app/settings/page.tsx", [
    ["This permanently deletes your profile, every workout, goal and conversation. This cannot be undone.", "{t(\"settings.deleteBody\")}"],
  ]],

  ["app/workout/active/page.tsx", [
    ["Remove exercise", "{t(\"workout.removeExercise\")}"],
  ]],
];

/** The delete strings wrap across lines, so match on a distinctive prefix. */
const MULTILINE = [
  ["app/settings/page.tsx", "This permanently deletes your profile, every workout, goal and conversation.", "{t(\"settings.deleteBody\")}"],
  ["app/insights/page.tsx", "Evidence-based insights derived from your training data.", "{t(\"insights.feedBody\")}"],
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
