/**
 * Appends the remaining translation keys to both dictionaries.
 *
 * Run from frontend/: node scripts/add-keys.mjs
 *
 * Anchored on the "reminders.title" key, which exists in both locales, and
 * inserts the same key list into each with the right language. Node writes
 * UTF-8 literally, so Indonesian accents and apostrophes survive.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

/** [key, english, indonesian] */
const KEYS = [
  ["history.trainingHistory", "Training History", "Riwayat Latihan"],
  ["history.last30", "Last 30 Days", "30 Hari Terakhir"],
  ["history.emptyTitle", "No training history yet.", "Belum ada riwayat latihan."],
  ["history.emptyBody", "Your first workout starts building your training story.", "Latihan pertamamu akan mulai membangun cerita latihanmu."],

  ["records.personalRecords", "Personal Records", "Rekor Pribadi"],
  ["records.heaviestLift", "Heaviest Lift", "Angkatan Terberat"],
  ["records.noneYet", "No records yet", "Belum ada rekor"],
  ["records.best1rm", "Best Est. 1RM", "Perkiraan 1RM Terbaik"],
  ["records.keepGoing", "Log more workouts to set records.", "Catat lebih banyak latihan untuk bikin rekor."],

  ["insights.why", "Why Striv thinks this", "Kenapa Striv berpikir begitu"],
  ["insights.notEnoughData", "Not enough data to project yet.", "Data belum cukup untuk memproyeksikan."],
  ["insights.feed", "Intelligence Feed", "Umpan Wawasan"],
  ["insights.macroTrend", "Macro Trend Analysis", "Analisis Tren Makro"],

  ["auth.signInGoogle", "Sign in with Google", "Masuk dengan Google"],
  ["auth.signUpGoogle", "Sign up with Google", "Daftar dengan Google"],
  ["auth.createOne", "Create one", "Buat akun"],
  ["auth.registerHint", "Start tracking your training.", "Mulai catat latihanmu."],

  ["routines.durationLabel", "Estimated Duration (min, optional)", "Perkiraan Durasi (menit, opsional)"],
  ["routines.noExercises", "No exercises yet. Add your first one below.", "Belum ada gerakan. Tambahkan yang pertama di bawah."],
  ["routines.addExercise", "Add Exercise", "Tambah Gerakan"],
  ["routines.hint", "Save a template to reuse next session.", "Simpan sebagai template untuk dipakai lagi."],

  ["goals.whatWorkingTowards", "What are you working towards?", "Kamu mau mencapai apa?"],
  ["goals.typeFixed", "The goal type is fixed once created, because changing it would reset your baseline.", "Jenis target tidak bisa diubah setelah dibuat, karena mengubahnya akan mereset titik awalmu."],
  ["goals.exercise", "Exercise", "Gerakan"],
  ["goals.exerciseFixed", "The exercise cannot be changed after a goal is created.", "Gerakan tidak bisa diubah setelah target dibuat."],
  ["goals.status", "Status", "Status"],
  ["goals.kindWeight", "Weight target", "Target beban"],
  ["goals.kindOneRm", "Estimated 1RM", "Perkiraan 1RM"],
  ["goals.kindWorkouts", "Workout count", "Jumlah latihan"],

  ["settings.exportFailed", "Could not export your data.", "Gagal mengekspor datamu."],
  ["settings.enterPassword", "Enter your password to confirm account deletion.", "Masukkan kata sandimu untuk mengonfirmasi penghapusan akun."],
  ["settings.deleteFailed", "Could not delete your account.", "Gagal menghapus akunmu."],
  ["settings.unitsBody1", "Choose how weights are displayed throughout the app. Your data is always stored in", "Pilih bagaimana beban ditampilkan di aplikasi. Datamu selalu tersimpan dalam"],

  ["panel.photoEvidence", "Photo evidence", "Bukti foto"],
  ["panel.sessions", "Recent sessions", "Sesi terakhir"],
];

let src = readFileSync(FILE, "utf8");

/** Build the insertion block for one language. */
const block = (index) =>
  KEYS.map(([key, en, id]) => `    "${key}": ${JSON.stringify(index === 1 ? en : id)},`).join("\n");

// English block goes before the reminders anchor; Indonesian goes before the
// Indonesian reminder key. Both anchors are unique, so the placement is exact.
const enAnchor = '    "reminders.title": "Training reminders",';
const idAnchor = '    "reminders.title": "Pengingat latihan",';

if (!src.includes(enAnchor) || !src.includes(idAnchor)) {
  console.error("anchor missing — aborting rather than corrupting the file");
  process.exit(1);
}

src = src.replace(enAnchor, `${block(1)}\n${enAnchor}`);
src = src.replace(idAnchor, `${block(2)}\n${idAnchor}`);

writeFileSync(FILE, src, "utf8");
console.log(`added ${KEYS.length} keys to both locales`);
