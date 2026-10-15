/**
 * Final member-page i18n pass.
 * Run from frontend/: node scripts/i18n-last.mjs
 *
 * Each entry: [file, componentName, [[exactSource, replacement], ...]]
 * Distinct component names per file so the hook is inserted in the right place.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const JOBS = [
  ["app/records/page.tsx", "RecordsPage", [
    ["\n          Personal Records", "\n          {t(\"records.personalRecords\")}"],
    ["\n              All Types", "\n              {t(\"records.allTypes\")}"],
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
  ]],

  ["app/progress/page.tsx", "ProgressPage", [
    ["\n          Retry", "\n          {t(\"action.retry\")}"],
    ["\n                    Projected", "\n                    {t(\"progress.projected\")}"],
    ["\n                      Volume trending upward. Keep pushing.", "\n                      {t(\"progress.trendUp\")}"],
    ["\n                      Consistent volume builds strength.", "\n                      {t(\"progress.trendSteady\")}"],
  ]],

  ["app/profile/page.tsx", "ProfilePage", [
    ["\n          Retry", "\n          {t(\"action.retry\")}"],
  ]],

  ["app/reviews/weekly/page.tsx", "ReviewsPage", [
    ['"Failed to generate review."', 't("reviews.generateFailed")'],
  ]],

  ["app/register/page.tsx", "RegisterPage", [
    ["\n          Striv", "\n          Striv"],
  ]],

  ["app/page.tsx", "LandingPage", [
    ["Log every detail of your workout with precision and ease. Our interface", "{t(\"landing.feat1\")}"],
    ["Message sent! We&apos;ll get back to you soon.", "{t(\"landing.contactSent\")}"],
  ]],

  ["app/history/page.tsx", "HistoryPage", [
    ["\n              Retry", "\n              {t(\"action.retry\")}"],
    ["\n                Exercises", "\n                {t(\"nav.exercises\")}"],
    ["\n                  Duration", "\n                  {t(\"history.duration\")}"],
  ]],

  ["app/insights/page.tsx", "InsightsPage", [
    ["\n              Retry", "\n              {t(\"action.retry\")}"],
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
  ]],

  ["app/settings/page.tsx", "SettingsPage", [
    ["\n              Retry", "\n              {t(\"action.retry\")}"],
    ["\n                Retry", "\n                {t(\"action.retry\")}"],
    ["\n                Export my data", "\n                {t(\"settings.exportData\")}"],
    ["\n                Delete account", "\n                {t(\"settings.deleteAccount\")}"],
  ]],

  ["app/routines/page.tsx", "RoutinesPage", [
    ["\n                  Retry", "\n                  {t(\"action.retry\")}"],
    ["\n                  New Routine", "\n                  {t(\"routines.new\")}"],
  ]],

  ["app/goals/page.tsx", "GoalsPage", [
    ["\n              Retry", "\n              {t(\"action.retry\")}"],
  ]],

  ["app/exercises/page.tsx", "ExercisesPage", [
    ["\n                  Retry", "\n                  {t(\"action.retry\")}"],
  ]],

  ["app/workouts/[id]/page.tsx", "SessionDetailPage", [
    ["\n          Retry", "\n          {t(\"action.retry\")}"],
    ["\n          Back", "\n          {t(\"action.back\")}"],
    ["\n              In progress", "\n              {t(\"workout.inProgress\")}"],
    ["\n              REPS", "\n              {t(\"client.repsUpper\")}"],
  ]],

  ["app/coach/page.tsx", "CoachPage", [
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
  ]],

  ["app/matching/page.tsx", "MatchingPage", [
    ["\n            Striv", "\n            Striv"],
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
    if (from === to) continue;
    if (src.includes(from)) {
      src = src.split(from).join(to);
      applied++;
    }
  }

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
      console.log(`  WARN  ${file}: ${component} signature not matched`);
    }
  }

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    changed++;
    console.log(`  OK    ${file}  (${applied})`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${changed} file(s) updated.`);
