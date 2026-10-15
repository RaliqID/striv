/**
 * Adds frontend keys for the 5 backend-lang keys that were being called from
 * React, where they resolved to nothing and rendered as raw key strings.
 *
 * Run from frontend/: node scripts/add-keys7.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FRONT = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["toast.trainerAssigned", "Trainer assigned.", "Trainer ditugaskan."],
  ["toast.scheduleSent", "Schedule sent to your client.", "Jadwal dikirim ke klienmu."],
  ["toast.programRemoved", "Programme removed.", "Program dihapus."],
  ["toast.saved", "Saved.", "Tersimpan."],
  ["toast.updated", "Updated.", "Diperbarui."],
];

let src = readFileSync(FRONT, "utf8");
const block = (i) => KEYS.map(([k, en, id]) => `    "${k}": ${JSON.stringify(i === 1 ? en : id)},`).join("\n");

for (const [anchorText, idx] of [["Training reminders", 1], ["Pengingat latihan", 2]]) {
  const anchor = `    "reminders.title": "${anchorText}",`;
  if (!src.includes(anchor)) {
    console.error(`anchor missing: ${anchor}`);
    process.exit(1);
  }
  src = src.replace(anchor, `${block(idx)}\n${anchor}`);
}

writeFileSync(FRONT, src, "utf8");

// Repoint the five call sites at the frontend keys.
const CALLSITES = [
  ["app/admin/training/page.tsx", 't("training.assigned")', 't("toast.trainerAssigned")'],
  ["app/trainer/clients/[id]/page.tsx", 't("training.schedule_sent")', 't("toast.scheduleSent")'],
  ["app/trainer/clients/[id]/page.tsx", 't("training.program_removed")', 't("toast.programRemoved")'],
  ["app/trainer/profile/page.tsx", 't("updated")', 't("toast.updated")'],
  ["components/ReminderSettings.tsx", 't("saved")', 't("toast.saved")'],
];

for (const [file, from, to] of CALLSITES) {
  const path = resolve(import.meta.dirname, "..", file);
  const c = readFileSync(path, "utf8");
  if (!c.includes(from)) {
    console.log(`  WARN  ${file}: ${from} not found`);
    continue;
  }
  writeFileSync(path, c.split(from).join(to), "utf8");
  console.log(`  OK    ${file}: ${from} -> ${to}`);
}

console.log(`\nadded ${KEYS.length} keys`);
