/**
 * Appends the last batch of page keys.
 * Run from frontend/: node scripts/add-keys4.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");

const KEYS = [
  ["action.back", "Back", "Kembali"],

  ["records.allTypes", "All Types", "Semua Jenis"],
  ["progress.projected", "Projected", "Proyeksi"],
  ["progress.trendUp", "Volume trending upward. Keep pushing.", "Volume naik. Pertahankan."],
  ["progress.trendSteady", "Consistent volume builds strength.", "Volume yang konsisten membangun kekuatan."],

  ["settings.exportData", "Export my data", "Ekspor dataku"],
  ["settings.units", "Units", "Satuan"],

  ["reviews.generateFailed", "Failed to generate review.", "Gagal membuat evaluasi."],

  ["client.repsUpper", "REPS", "REPETISI"],

  ["landing.feat1", "Log every detail of your workout with precision and ease.", "Catat setiap detail latihanmu dengan presisi dan mudah."],
  ["landing.contactSent", "Message sent! We will get back to you soon.", "Pesan terkirim! Kami akan segera membalas."],
  ["landing.startTracking", "Start tracking", "Mulai latihan"],
  ["landing.seeHow", "See how it works", "Lihat cara kerjanya"],
  ["landing.heroTitle", "Your training has a story.", "Latihanmu punya cerita."],
  ["landing.heroBody1", "Track your workouts, discover your progress, and understand what your training", "Catat latihanmu, temukan kemajuanmu, dan pahami apa yang sebenarnya"],
  ["landing.heroBody2", "is actually telling you.", "dikatakan latihanmu."],
  ["landing.quote", "Your data tells a story. Striv helps you read it.", "Datamu bercerita. Striv membantumu membacanya."],
  ["landing.ctaTitle", "Start understanding your training.", "Mulai pahami latihanmu."],
  ["landing.ctaBody", "Track every session. Understand your progress. Train with more clarity.", "Catat setiap sesi. Pahami kemajuanmu. Latihan lebih terarah."],
  ["landing.explore", "Explore Striv", "Jelajahi Striv"],
  ["landing.faqTitle", "Have a question about Striv?", "Ada pertanyaan tentang Striv?"],
  ["landing.sendMessage", "Send message", "Kirim pesan"],
  ["landing.errFields", "Please fill in all fields.", "Isi semua kolom dulu ya."],
  ["landing.stepTrain", "Train", "Latihan"],
  ["landing.stepTrainDesc", "Log workout", "Catat latihan"],
  ["landing.stepAnalyze", "Analyze", "Analisis"],
  ["landing.stepAnalyzeDesc", "Process history", "Proses riwayat"],
  ["landing.stepUnderstand", "Understand", "Pahami"],
  ["landing.stepUnderstandDesc", "Meaningful patterns", "Pola yang berarti"],
  ["landing.clarity", "Clarity", "Kejelasan"],
  ["landing.evidence", "Evidence", "Bukti"],
  ["landing.sectionEverything", "Everything about your training, in one place.", "Semua tentang latihanmu, di satu tempat."],
  ["landing.sectionTurn", "Turn training data into something you can understand.", "Ubah data latihan jadi sesuatu yang kamu pahami."],
  ["landing.sectionFrom", "From workout to insight.", "Dari latihan jadi wawasan."],
  ["landing.sectionMoreThan", "Training is more than numbers.", "Latihan lebih dari sekadar angka."],
  ["landing.sectionContext", "Train with context, not just numbers.", "Latihan dengan konteks, bukan sekadar angka."],
  ["landing.sectionClarity", "Train with clarity.", "Latihan lebih terarah."],
  ["landing.sectionData", "More data doesn't always mean more understanding.", "Data lebih banyak belum tentu lebih paham."],
  ["landing.sectionNarrative", "Every set, every rep, every moment of exertion builds a larger narrative.", "Setiap set, setiap repetisi, setiap usaha membangun cerita yang lebih besar."],
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
