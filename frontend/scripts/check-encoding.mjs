/**
 * Scan the whole dictionary for genuinely corrupt characters.
 *
 * Written after being wrong twice in a row: the em-dash in app/manifest.ts and
 * the plus-minus in landing.mockWorkoutDuration both LOOKED like mojibake in the
 * terminal ("�?" and "�65") but were perfectly valid Unicode (U+2014 and U+00B1).
 * PowerShell on this machine cannot render non-ASCII, so the terminal cannot be
 * trusted to answer this question. Codepoints can.
 *
 * So this reports only unambiguous corruption:
 *   - U+FFFD REPLACEMENT CHARACTER: a byte sequence that was already lost.
 *   - UTF-8 mojibake read as Latin-1, e.g. "Ã©" for "é" (bytes C3 A9 shown as two
 *     characters). Detected by looking for the specific double-encoded lead bytes.
 *   - A known multi-byte sequence split across a quote, which indicates the file
 *     was edited by a tool that counted bytes instead of characters.
 *
 * Anything else is left alone: an unusual-but-valid codepoint is not a bug, and
 * "normalising" one would silently change copy.
 *
 * Run from frontend/: node scripts/check-encoding.mjs
 * Read-only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");
const src = readFileSync(FILE, "utf8");

/** Every `"key": "value"` pair, with the line it sits on. */
const pairs = [];
const re = /^\s*"([a-zA-Z0-9_.]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;
let m;
while ((m = re.exec(src))) {
  const line = src.slice(0, m.index).split("\n").length;
  pairs.push({ key: m[1], value: m[2], line });
}

/**
 * The two mojibake lead bytes. A single one can be legitimate in some scripts,
 * but C3 followed by a punctuation-range byte is the signature of UTF-8 being
 * decoded as Latin-1, which is what a broken edit produces.
 */
const MOJIBAKE = /\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]/;

const problems = [];
for (const p of pairs) {
  const issues = [];
  if (p.value.includes("\uFFFD")) issues.push("U+FFFD replacement character");
  if (MOJIBAKE.test(p.value)) issues.push("UTF-8 mojibake (double-encoded)");
  if (issues.length) problems.push({ ...p, issues });
}

console.log(`dictionary entries scanned : ${pairs.length}`);

// Report the non-ASCII characters actually in use, so a reviewer can see that
// the special characters are intentional rather than damaged.
const special = new Map();
for (const p of pairs) {
  for (const ch of p.value) {
    if (ch.codePointAt(0) > 0x7f) {
      special.set(ch, (special.get(ch) ?? 0) + 1);
    }
  }
}

console.log("");
console.log("non-ASCII characters in use (expected, NOT errors):");
if (special.size === 0) {
  console.log("  (none)");
} else {
  for (const [ch, count] of [...special.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${JSON.stringify(ch)}  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}  x${count}`
    );
  }
}

console.log("");
if (problems.length === 0) {
  console.log("PASS: no corrupt characters found.");
} else {
  console.log(`FAIL: ${problems.length} entr(y/ies) with corrupt characters:`);
  for (const p of problems) {
    console.log(`  line ${p.line}  ${p.key}`);
    console.log(`      value: ${JSON.stringify(p.value)}`);
    console.log(`      issue: ${p.issues.join(", ")}`);
  }
  process.exitCode = 1;
}
