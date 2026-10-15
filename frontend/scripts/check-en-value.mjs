/**
 * Independent check: does the `en` block actually contain English?
 *
 * The tooling proves en and id have the SAME KEYS, but never that the en values
 * are English. A key copied across without translation, or an Indonesian value
 * pasted into the en block, would pass every existing check.
 *
 * This flags en values that look Indonesian, so the English locale can be
 * trusted rather than assumed. Read-only.
 *
 * Run from frontend/: node scripts/check-en-value.mjs
 *
 * Distinct from same-value.mjs, which finds keys whose two locales MATCH. This
 * looks for the opposite mistake: an en value that is Indonesian while its id
 * value is also Indonesian but worded differently -- which a same-value check
 * cannot see, because the two strings are not equal.
 *
 * APPROVED LOANWORDS ARE EXCLUDED from the marker list. Admin, Trainer, Member,
 * Reps, Bio, Target, Total and Striv stay identical across locales, so an
 * English string containing "Target Weight" is correct. Including them produced
 * 21 false positives and would have sent someone chasing bugs that did not
 * exist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");
const src = readFileSync(FILE, "utf8");
const idStart = src.indexOf("  id: {");
const enBlock = src.slice(0, idStart);
const idBlock = src.slice(idStart);

/** key -> value for one block. */
function entries(block) {
  const out = new Map();
  const re = /^\s*"([a-zA-Z0-9_.]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;
  let m;
  while ((m = re.exec(block))) out.set(m[1], m[2]);
  return out;
}

const en = entries(enBlock);
const id = entries(idBlock);

/**
 * Indonesian markers. Deliberately narrow and word-boundary anchored so English
 * words are not caught by accident (e.g. "dan" inside "abundant" must not hit).
 *
 * `target` and `total` are deliberately ABSENT. Both are approved loanwords
 * kept identical across locales (alongside Admin, Trainer, Member, Reps, Bio),
 * so an English string containing "Target Weight" or "Total users" is correct,
 * not a mistranslation. Including them produced 21 false positives and would
 * have sent someone hunting for bugs that did not exist.
 */
const ID_MARKERS =
  /\b(kamu|anda|latihan|sesi|gerakan|simpan|batal|hapus|tidak|belum|sudah|dengan|untuk|dari|yang|ini|itu|baru|hari|minggu|bulan|pelatih|klien|catatan|tambah|ubah|tutup|kirim|pilih|mulai|cari|lihat|buka|riwayat|rekor|pencapaian|pengingat|waktu|berat|tinggi|umur|gagal|berhasil|menit|detik|semua|lainnya|lebih|kurang|naik|turun|kemajuan|jumlah|percobaan|pengguna|kapasitas)\b/i;

const suspicious = [];
for (const [key, value] of en) {
  // An intentional loanword: identical in both locales, and allowed.
  const idValue = id.get(key);
  if (idValue !== undefined && value === idValue) continue;

  if (ID_MARKERS.test(value)) {
    suspicious.push({ key, value, kind: "looks Indonesian" });
  }
}

console.log(`en entries : ${en.size}`);
console.log(`id entries : ${id.size}`);
console.log(`suspicious : ${suspicious.length}`);
console.log("");

if (suspicious.length === 0) {
  console.log("PASS: no en value looks Indonesian.");
} else {
  console.log("en values that look Indonesian:");
  for (const s of suspicious) {
    console.log(`  ${s.key}\n      en: "${s.value}"\n      id: "${id.get(s.key) ?? "<absent>"}"`);
  }
}
