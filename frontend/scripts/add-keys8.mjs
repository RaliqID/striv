/**
 * Adds the reward-screen translation keys.
 * Run from frontend/: node scripts/add-keys8.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["reward.newRecordTitle", "New personal record", "Rekor pribadi baru"],
  ["reward.exercise", "Exercise", "Gerakan"],
  ["reward.firstRecord", "First record for this lift", "Rekor pertama untuk gerakan ini"],
  ["reward.beatsPrevious", "Beats your previous best", "Melebihi rekor sebelumnya"],
  ["reward.from", "from", "dari"],
  ["reward.streak", "Streak", "Rentetan"],
  ["reward.weeks", "weeks", "minggu"],
  ["reward.streakRecord", "Your longest streak yet", "Rentetan terpanjangmu"],
  ["reward.vsLastWeek", "vs last week", "vs minggu lalu"],
  ["reward.volumeLastWeek", ":value kg last week", ":value kg minggu lalu"],
];

let src = readFileSync(FILE, "utf8");
const block = (i) => KEYS.map(([k, en, id]) => `    "${k}": ${JSON.stringify(i === 1 ? en : id)},`).join("\n");

for (const [anchorText, idx] of [["Training reminders", 1], ["Pengingat latihan", 2]]) {
  const anchor = `    "reminders.title": "${anchorText}",`;
  if (!src.includes(anchor)) {
    console.error(`anchor missing: ${anchor}`);
    process.exit(1);
  }
  src = src.replace(anchor, `${block(idx)}\n${anchor}`);
}

writeFileSync(FILE, src, "utf8");
console.log(`added ${KEYS.length} keys to both locales`);
