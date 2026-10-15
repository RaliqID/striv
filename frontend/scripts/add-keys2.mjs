/**
 * Appends the shared-component i18n keys.
 *
 * Run from frontend/: node scripts/add-keys2.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

/** [key, english, indonesian] */
const KEYS = [
  ["pagination.showing", "Showing :from-:to of :total", "Menampilkan :from-:to dari :total"],
  ["pagination.previous", "Previous", "Sebelumnya"],
  ["pagination.next", "Next", "Berikutnya"],
  ["pagination.pageOf", "Page :page of :total", "Halaman :page dari :total"],

  ["action.confirm", "Confirm", "Konfirmasi"],

  ["admin.sections", "Admin sections", "Bagian admin"],
  ["admin.accessDenied", "Access denied", "Akses ditolak"],

  ["panel.sections", "Trainer sections", "Bagian trainer"],

  ["nav.insightsAlerts", "Insights and alerts", "Wawasan dan peringatan"],
  ["nav.yourProfile", "Your profile", "Profilmu"],
  ["nav.profileFor", "Profile for", "Profil"],
];

let src = readFileSync(FILE, "utf8");

const block = (i) => KEYS.map(([k, en, id]) => `    "${k}": ${JSON.stringify(i === 1 ? en : id)},`).join("\n");

const enAnchor = '    "reminders.title": "Training reminders",';
const idAnchor = '    "reminders.title": "Pengingat latihan",';

if (!src.includes(enAnchor) || !src.includes(idAnchor)) {
  console.error("anchor missing");
  process.exit(1);
}

src = src.replace(enAnchor, `${block(1)}\n${enAnchor}`);
src = src.replace(idAnchor, `${block(2)}\n${idAnchor}`);

writeFileSync(FILE, src, "utf8");
console.log(`added ${KEYS.length} keys to both locales`);
