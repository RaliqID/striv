/**
 * Appends the final round of keys.
 * Run from frontend/: node scripts/add-keys5.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["action.send", "Send", "Kirim"],

  ["error.title", "Something went wrong", "Terjadi kesalahan"],
  ["error.body", "An unexpected error occurred. You can try again or head back to the dashboard.", "Terjadi kesalahan tak terduga. Coba lagi atau kembali ke dasbor."],
  ["error.tryAgain", "Try again", "Coba lagi"],
  ["error.goDashboard", "Go to dashboard", "Ke dasbor"],

  ["insights.unlockHint", "Log 4+ sessions of a main lift to unlock trend analysis.", "Catat 4+ sesi gerakan utama untuk membuka analisis tren."],

  ["profile.frequencyLabel", "Training Frequency (days/week)", "Frekuensi Latihan (hari/minggu)"],
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
