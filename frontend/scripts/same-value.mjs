/**
 * Finds dictionary entries whose Indonesian value is identical to the English.
 *
 * A key with the same string in both locales is either a deliberate
 * untranslated term (kg, 1RM, CPU) or a forgotten translation. Separating the
 * two automatically is not possible, so this lists them for review — which is
 * how the leftover "Personal trainer" was found.
 *
 * Run from frontend/: node scripts/same-value.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");
const src = readFileSync(FILE, "utf8");

/** Pull one locale block out of the file. */
function block(locale) {
  const start = src.indexOf(`${locale}: {`);
  if (start === -1) return "";
  // Walk to the matching close brace at column 2.
  let depth = 0;
  let i = src.indexOf("{", start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(from, i + 1);
}

function pairs(text) {
  const map = new Map();
  const re = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text))) map.set(m[1], m[2]);
  return map;
}

const en = pairs(block("en"));
const id = pairs(block("id"));

/** Terms that are correctly identical in both languages. */
const ALLOWED = /^(kg|lbs|1RM|kg total|AI|CPU|X|PRs|Striv|Email|WhatsApp|Volume|Status|Live|Live session)$/i;

const same = [];
for (const [key, enVal] of en) {
  const idVal = id.get(key);
  if (idVal !== undefined && idVal === enVal && !ALLOWED.test(enVal)) {
    same.push({ key, value: enVal });
  }
}

console.log(`${same.length} key(s) where id === en:\n`);
for (const { key, value } of same) {
  console.log(`  ${key.padEnd(38)} "${value}"`);
}
