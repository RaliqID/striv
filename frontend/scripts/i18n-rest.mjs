/**
 * Final i18n pass over the remaining member-facing screens.
 *
 * Run from frontend/: node scripts/i18n-rest.mjs
 *
 * Node, not shell: this copy contains apostrophes and en-dashes that earlier
 * PowerShell passes corrupted (see the mangled "Start Workout" in the exercise
 * detail page, caused by the shell eating a quote and matching inside an
 * import). Splitting on exact strings in UTF-8 avoids that class of bug.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** [file, component, [[exactSource, replacement], ...]] */
const JOBS = [
  ["app/history/page.tsx", "HistoryPage", [
    ["\n            Training History", "\n            {t(\"history.trainingHistory\")}"],
    ["\n              Last 30 Days", "\n              {t(\"history.last30\")}"],
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
    ["\n              No training history yet.", "\n              {t(\"history.emptyTitle\")}"],
    ["Your first workout starts building your training story.", "{t(\"history.emptyBody\")}"],
    ["\n                Start Workout", "\n                {t(\"workout.startWorkout\")}"],
    [">Exercises</", ">{t(\"nav.exercises\")}</"],
    ["\n                Duration", "\n                {t(\"history.duration\")}"],
  ]],

  ["app/records/page.tsx", "RecordsPage", [
    ["\n          Personal Records", "\n          {t(\"records.personalRecords\")}"],
    ["\n              Heaviest Lift", "\n              {t(\"records.heaviestLift\")}"],
    ["\n                No records yet", "\n                {t(\"records.noneYet\")}"],
    ["\n              Best Est. 1RM", "\n              {t(\"records.best1rm\")}"],
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
    ["Log more workouts to set records.", "{t(\"records.keepGoing\")}"],
  ]],

  ["app/insights/page.tsx", "InsightsPage", [
    ["\n                Why Striv thinks this", "\n                {t(\"insights.why\")}"],
    [">Confidence<", ">{t(\"insights.confidence\")}<"],
    ["Not enough data to project yet.", "{t(\"insights.notEnoughData\")}"],
    ["\n            Intelligence Feed", "\n            {t(\"insights.feed\")}"],
    ["\n            Retry", "\n            {t(\"action.retry\")}"],
    ["\n              No insights yet.", "\n              {t(\"insights.empty\")}"],
    ["\n                Start Workout", "\n                {t(\"workout.startWorkout\")}"],
    ["\n              Macro Trend Analysis", "\n              {t(\"insights.macroTrend\")}"],
  ]],

  ["app/login/page.tsx", "LoginPage", [
    ["\n            Sign in with Google", "\n            {t(\"auth.signInGoogle\")}"],
    ["\n              Create one", "\n              {t(\"auth.createOne\")}"],
  ]],

  ["app/register/page.tsx", "RegisterPage", [
    ["Start tracking your training.", "{t(\"auth.registerHint\")}"],
    ["\n              Confirm password", "\n              {t(\"auth.confirmPassword\")}"],
    ["\n            Sign up with Google", "\n            {t(\"auth.signUpGoogle\")}"],
  ]],

  ["app/routines/page.tsx", "RoutinesPage", [
    ["Estimated Duration (min, optional)", "{t(\"routines.durationLabel\")}"],
    ["\n                Exercises", "\n                {t(\"nav.exercises\")}"],
    ["No exercises yet. Add your first one below.", "{t(\"routines.noExercises\")}"],
    ["\n                    Add Exercise", "\n                    {t(\"routines.addExercise\")}"],
    ["\n                    Cancel", "\n                    {t(\"action.cancel\")}"],
    ["\n                  New Routine", "\n                  {t(\"routines.new\")}"],
    ["\n                  Retry", "\n                  {t(\"action.retry\")}"],
    ["Save a template to reuse next session.", "{t(\"routines.hint\")}"],
  ]],

  ["app/goals/page.tsx", "GoalsPage", [
    ["What are you working towards?", "{t(\"goals.whatWorkingTowards\")}"],
    ["The goal type is fixed once created, because changing it would reset your baseline.", "{t(\"goals.typeFixed\")}"],
    ["\n                  Exercise", "\n                  {t(\"goals.exercise\")}"],
    ["The exercise cannot be changed after a goal is created.", "{t(\"goals.exerciseFixed\")}"],
    ["\n                    Status", "\n                    {t(\"goals.status\")}"],
    ["\n                    Cancel", "\n                    {t(\"action.cancel\")}"],
    ['return "Weight target";', 'return t("goals.kindWeight");'],
    ['return "Estimated 1RM";', 'return t("goals.kindOneRm");'],
    ['return "Workout count";', 'return t("goals.kindWorkouts");'],
  ]],

  ["app/settings/page.tsx", "SettingsPage", [
    ['setError(e.message || "Could not load profile");', 'setError(e.message || t("common.loadFailed"));'],
    ['"Could not save the unit."', 't("common.actionFailed")'],
    ['throw new Error("Export failed.");', 'throw new Error(t("settings.exportFailed"));'],
    ['"Could not export your data."', 't("settings.exportFailed")'],
    ['"Enter your password to confirm account deletion."', 't("settings.enterPassword")'],
    ['"Could not delete your account."', 't("settings.deleteFailed")'],
    ["\n                Sign Out", "\n                {t(\"profile.signOut\")}"],
    ["Choose how weights are displayed throughout the app. Your data is always stored in", "{t(\"settings.unitsBody1\")}"],
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
