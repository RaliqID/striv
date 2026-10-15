/**
 * Whitespace-tolerant i18n pass.
 *
 * Run from frontend/: node scripts/i18n-ws.mjs
 *
 * Earlier passes hard-coded exact indentation in the search string, so a swap
 * silently did nothing whenever the target line was indented differently than
 * assumed — which is why several files reported "0 applied" despite clearly
 * containing the text. This matches on the trimmed content instead.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** [file, [[plainText, replacementExpression], ...]] */
const JOBS = [
  ["app/records/page.tsx", [
    ["Personal Records", "{t(\"records.personalRecords\")}"],
    ["All Types", "{t(\"records.allTypes\")}"],
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/progress/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["Projected", "{t(\"progress.projected\")}"],
    ["Volume trending upward. Keep pushing.", "{t(\"progress.trendUp\")}"],
    ["Consistent volume builds strength.", "{t(\"progress.trendSteady\")}"],
  ]],
  ["app/profile/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/insights/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["Confidence", "{t(\"insights.confidence\")}"],
    ["Macro Trend Analysis", "{t(\"insights.macroTrend\")}"],
    ["Intelligence Feed", "{t(\"insights.feed\")}"],
    ["Why Striv thinks this", "{t(\"insights.why\")}"],
  ]],
  ["app/settings/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["Export my data", "{t(\"settings.exportData\")}"],
    ["Delete account", "{t(\"settings.deleteAccount\")}"],
    ["Units", "{t(\"settings.units\")}"],
  ]],
  ["app/routines/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["New Routine", "{t(\"routines.new\")}"],
    ["Add Exercise", "{t(\"routines.addExercise\")}"],
  ]],
  ["app/goals/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/exercises/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/coach/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
  ]],
  ["app/history/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["Training History", "{t(\"history.trainingHistory\")}"],
    ["Last 30 Days", "{t(\"history.last30\")}"],
  ]],
  ["app/workouts/[id]/page.tsx", [
    ["Retry", "{t(\"action.retry\")}"],
    ["In progress", "{t(\"workout.inProgress\")}"],
  ]],
];

/**
 * Replace a JSX text node whose content equals `text`.
 *
 * Only matches a line that is whitespace then exactly the text (optionally
 * followed by a closing tag), so it never rewrites a string inside code or a
 * substring of a longer sentence.
 */
function swapJsxText(src, text, replacement) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s+)${escaped}(\\s*)$`, "gm");
  let count = 0;
  const out = src.replace(re, (_m, indent) => {
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
    const { out, count } = swapJsxText(src, text, replacement);
    src = out;
    applied += count;
  }

  if (applied > 0) {
    writeFileSync(path, src, "utf8");
    total += applied;
    console.log(`  OK    ${file}  (${applied} node(s))`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${total} JSX text node(s) translated.`);
