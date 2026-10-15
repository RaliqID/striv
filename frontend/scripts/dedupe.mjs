/**
 * Removes duplicate dictionary keys, keeping the first occurrence in each locale.
 * Run from frontend/: node scripts/dedupe.mjs
 *
 * A duplicate is legal JavaScript (last wins) but means one value is dead, and
 * the surviving value is not necessarily the one intended.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");
let lines = readFileSync(FILE, "utf8").split("\n");

/** Track seen keys per locale block. */
const seenEn = new Set();
const seenId = new Set();
let inEn = false;
let inId = false;
const removed = [];

const out = [];
for (const line of lines) {
  // Detect which locale block we are inside by the marker lines.
  if (/^\s*en:\s*\{/.test(line)) inEn = true;
  if (/^\s*id:\s*\{/.test(line)) {
    inEn = false;
    inId = true;
  }

  const m = /^\s*"([^"]+)":\s*"/.exec(line);

  if (m && (inEn || inId)) {
    const key = m[1];
    const set = inEn ? seenEn : seenId;

    if (set.has(key)) {
      removed.push(`${inEn ? "en" : "id"}:${key}`);
      continue; // drop the duplicate line
    }
    set.add(key);
  }

  out.push(line);
}

writeFileSync(FILE, out.join("\n"), "utf8");
console.log(removed.length ? `removed: ${removed.join(", ")}` : "no duplicates found");
