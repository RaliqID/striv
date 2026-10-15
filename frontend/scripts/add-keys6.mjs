/**
 * Appends the last keys.
 * Run from frontend/: node scripts/add-keys6.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["action.copy", "Copy", "Salin"],

  ["admin.resetPassword", "Reset password", "Reset kata sandi"],
  ["admin.resetPasswordHint", "Issues a one-time password and signs the member out everywhere.", "Menerbitkan kata sandi sekali pakai dan mengeluarkan member dari semua perangkat."],
  ["admin.revokeSessions", "Sign out everywhere", "Keluarkan dari semua perangkat"],
  ["admin.deleteHint", "Permanently removes the member and all of their data. This cannot be undone.", "Menghapus member dan seluruh datanya secara permanen. Tindakan ini tidak bisa dibatalkan."],
  ["admin.tempPassword", "Temporary password", "Kata sandi sementara"],

  ["settings.select", "Select", "Pilih"],
  ["settings.dataBody", "Download everything you have logged, or permanently remove your account.", "Unduh semua yang sudah kamu catat, atau hapus akunmu secara permanen."],
  ["settings.deleteBody", "This permanently deletes your profile, every workout, goal and conversation. This cannot be undone.", "Ini akan menghapus profilmu, semua latihan, target, dan percakapan secara permanen. Tidak bisa dibatalkan."],
  ["settings.confirmPassword", "Confirm your password", "Konfirmasi kata sandi"],
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
