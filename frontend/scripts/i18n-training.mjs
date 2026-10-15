/**
 * Finishes the admin training page.
 * Run from frontend/: node scripts/i18n-training.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "app", "admin", "training", "page.tsx");

let src = readFileSync(FILE, "utf8");
const SWAPS = [
  ['<Stat label="Trainers"', '<Stat label={t("admin.statTrainers")}'],
  ['<Stat label="Available"', '<Stat label={t("admin.statAvailable")}'],
  ['label="Waiting"', 'label={t("admin.statWaiting")}'],
  ['label="No schedule"', 'label={t("admin.statNoSchedule")}'],
  ['>Trainer roster</h2>', '>{t("admin.trainerRoster")}</h2>'],
  ['<th className="px-4 py-3">Trainer</th>', '<th className="px-4 py-3">{t("admin.colTrainer")}</th>'],
  ['<th className="px-4 py-3">Specialisation</th>', '<th className="px-4 py-3">{t("admin.colSpecialisation")}</th>'],
  ['<th className="px-4 py-3">Load</th>', '<th className="px-4 py-3">{t("admin.colLoad")}</th>'],
  ['<th className="px-4 py-3">Rating</th>', '<th className="px-4 py-3">{t("admin.colRating")}</th>'],
  ['<th className="px-4 py-3">Status</th>', '<th className="px-4 py-3">{t("admin.colStatus")}</th>'],
  ['<Badge tone="ok">{trainer.slots_free} free</Badge>', '<Badge tone="ok">{t("admin.slotsFree", { count: trainer.slots_free })}</Badge>'],
];

let applied = 0;
for (const [from, to] of SWAPS) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    applied++;
  } else {
    console.log(`  MISS  ${from}`);
  }
}

writeFileSync(FILE, src, "utf8");
console.log(`${applied}/${SWAPS.length} applied`);
