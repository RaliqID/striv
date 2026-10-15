/**
 * Applies the remaining i18n string swaps.
 *
 * Run from frontend/: node scripts/i18n-apply.mjs
 *
 * Node rather than shell because earlier PowerShell passes mangled non-ASCII
 * characters (em-dashes arrived double-encoded and swallowed quotes), which
 * silently corrupted source files. Node reads and writes UTF-8 literally.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** [file, component, [[exactSourceText, replacement], ...]] */
const JOBS = [
  ["app/dashboard/page.tsx", "DashboardPage", [
    ['uppercase tracking-wider mb-2">Workouts<', 'uppercase tracking-wider mb-2">{t("dashboard.statWorkouts")}<'],
    ['uppercase tracking-wider mb-2">Sets<', 'uppercase tracking-wider mb-2">{t("progress.sets")}<'],
    ['uppercase tracking-wider mb-2">Volume<', 'uppercase tracking-wider mb-2">{t("progress.volume")}<'],
    ['uppercase tracking-wider mb-2">Strength Trend<', 'uppercase tracking-wider mb-2">{t("progress.strengthTrend")}<'],
    ['>Strength Progress<', '>{t("dashboard.strengthProgress")}<'],
    ['>LAST 8 WEEKS<', '>{t("dashboard.last8Weeks")}<'],
    ["            Striv Intelligence\n", '            {t("dashboard.intelligence")}\n'],
    ['>Analyzed Window<', '>{t("dashboard.analyzedWindow")}<'],
    ['>Sessions<', '>{t("progress.sessions")}<'],
    ['>Strength Change<', '>{t("dashboard.strengthChange")}<'],
    ['>Active Goals<', '>{t("dashboard.activeGoals")}<'],
    ["              No active goals. Set one in Goals.\n", '              {t("dashboard.noActiveGoals")}\n'],
    ["              Go to Goals\n", '              {t("dashboard.goToGoals")}\n'],
    ["            Retry\n", '            {t("action.retry")}\n'],
    ['{g.exercise?.name ?? "All workouts"}', '{g.exercise?.name ?? t("goals.allWorkouts")}'],
  ]],

  ["app/workout/page.tsx", "WorkoutLobbyPage", [
    ["              My Routines\n", '              {t("workout.myRoutines")}\n'],
    ["                Manage\n", '                {t("workout.manage")}\n'],
    ["                No routines yet.\n", '                {t("routines.empty")}\n'],
    ["                View All\n", '                {t("workout.viewAll")}\n'],
    ["              Start Workout\n", '              {t("workout.startWorkout")}\n'],
  ]],

  ["app/exercises/page.tsx", "ExercisesPage", [
    ['aria-label="Search exercises"', 'aria-label={t("exercises.searchPlaceholder")}'],
    ["              Exercise Library\n", '              {t("exercises.title")}\n'],
    ["              No exercises found.\n", '              {t("exercises.empty")}\n'],
  ]],

  ["app/history/page.tsx", "HistoryPage", [
    ["                History\n", '                {t("history.title")}\n'],
    ["              No sessions recorded yet.\n", '              {t("history.empty")}\n'],
    ['"Workout Session"', 't("workout.session")'],
  ]],

  ["app/progress/page.tsx", "ProgressPage", [
    ["          Progress\n", '          {t("progress.title")}\n'],
    ["                    No strength data yet\n", '                    {t("progress.noStrength")}\n'],
  ]],

  ["app/records/page.tsx", "RecordsPage", [
    ["          Records\n", '          {t("records.title")}\n'],
    ["              No personal records yet.\n", '              {t("records.empty")}\n'],
  ]],

  ["app/insights/page.tsx", "InsightsPage", [
    ["          Insights\n", '          {t("insights.title")}\n'],
  ]],

  ["app/reviews/weekly/page.tsx", "WeeklyReviewPage", [
    ["              Weekly Review\n", '              {t("reviews.title")}\n'],
    ["            No review available yet.\n", '            {t("reviews.empty")}\n'],
  ]],

  ["app/workouts/[id]/page.tsx", "WorkoutDetailPage", [
    ["              Workout\n", '              {t("workout.session")}\n'],
    ["              Exercises\n", '              {t("nav.exercises")}\n'],
  ]],

  ["app/exercises/[slug]/page.tsx", "ExerciseDetailPage", [
    ["              About\n", '              {t("exercises.about")}\n'],
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

  // Ensure the import and hook are present.
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
    console.log(`  OK    ${file}  (${applied}/${swaps.length} swaps)`);
  } else {
    console.log(`  --    ${file}  (0 swaps matched)`);
  }
}

console.log(`\n${changed} file(s) updated.`);
