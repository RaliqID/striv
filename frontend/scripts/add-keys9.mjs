/**
 * Adds the 5 dictionary keys referenced by the in-progress dashboard/progress
 * edits but never added, so check-keys.mjs is clean.
 *
 * Run from frontend/: node scripts/add-keys9.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FRONT = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

// [key, en, id]
const KEYS = [
  ["dashboard.today", "Today", "Hari ini"],
  ["dashboard.yesterday", "Yesterday", "Kemarin"],
  ["dashboard.daysAgo", ":count days ago", ":count hari lalu"],
  ["dashboard.noData", "No data yet.", "Belum ada data."],
  ["progress.aiPredicted", "AI prediction", "Prediksi AI"],
];

let src = readFileSync(FRONT, "utf8");

const enBlock = KEYS.map(([k, en]) => `    "${k}": ${JSON.stringify(en)},`).join("\n");
const idBlock = KEYS.map(([k, , id]) => `    "${k}": ${JSON.stringify(id)},`).join("\n");

for (const [anchor, block] of [
  ['    "reminders.title": "Training reminders",', enBlock],
  ['    "reminders.title": "Pengingat latihan",', idBlock],
]) {
  if (!src.includes(anchor)) {
    console.error(`anchor missing: ${anchor}`);
    process.exit(1);
  }
  src = src.replace(anchor, `${block}\n${anchor}`);
}

writeFileSync(FRONT, src, "utf8");
console.log(`added ${KEYS.length} keys to both locales`);
