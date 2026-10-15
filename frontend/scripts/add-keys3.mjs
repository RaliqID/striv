/**
 * Appends the workout/trainer-page i18n keys.
 * Run from frontend/: node scripts/add-keys3.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["workout.complete", "Workout complete.", "Latihan selesai."],
  ["workout.backToDashboard", "Back to dashboard", "Kembali ke dasbor"],
  ["workout.noActiveSession", "No active session.", "Tidak ada sesi aktif."],
  ["workout.startFromLobby", "Start a workout from the Lobby first.", "Mulai latihan dari Lobi dulu."],
  ["workout.goToLobby", "Go to lobby", "Ke Lobi"],
  ["workout.minimize", "Minimize workout", "Kecilkan latihan"],
  ["workout.removeExercise", "Remove exercise", "Hapus gerakan"],
  ["workout.addSet", "Add set", "Tambah set"],
  ["workout.addExercise", "Add exercise", "Tambah gerakan"],
  ["workout.closeRestTimer", "Close rest timer", "Tutup pengatur istirahat"],
  ["workout.resting", "Resting", "Istirahat"],
  ["workout.noSessions", "No sessions yet.", "Belum ada sesi."],
  ["workout.noSessionsBody", "Start your first workout to build your routine history.", "Mulai latihan pertamamu untuk membangun riwayat."],
  ["workout.filterList", "Filter list", "Saring daftar"],
  ["workout.moreOptions", "More options", "Opsi lainnya"],
  ["action.dismiss", "Dismiss", "Tutup"],

  ["client.errNoSlot", "Add at least one slot.", "Tambahkan minimal satu jadwal."],
  ["client.errNoName", "Give the programme a name.", "Beri nama programnya."],
  ["client.errNoExercise", "Add at least one exercise.", "Tambahkan minimal satu gerakan."],
  ["client.notFound", "Client not found.", "Klien tidak ditemukan."],
  ["client.backToClients", "Back to clients", "Kembali ke klien"],
  ["client.removeSlot", "Remove slot", "Hapus jadwal"],
];

let src = readFileSync(FILE, "utf8");
const block = (i) => KEYS.map(([k, en, id]) => `    "${k}": ${JSON.stringify(i === 1 ? en : id)},`).join("\n");

for (const [loc, idx] of [["Training reminders", 1], ["Pengingat latihan", 2]]) {
  const anchor = `    "reminders.title": "${loc}",`;
  if (!src.includes(anchor)) {
    console.error(`anchor missing: ${anchor}`);
    process.exit(1);
  }
  src = src.replace(anchor, `${block(idx)}\n${anchor}`);
}

writeFileSync(FILE, src, "utf8");
console.log(`added ${KEYS.length} keys to both locales`);
