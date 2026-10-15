/**
 * Reports dictionary size and translation coverage.
 * Run from frontend/: node scripts/stats.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts"), "utf8");

function block(locale) {
  const start = src.indexOf(`${locale}: {`);
  if (start === -1) return "";
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

function keys(text) {
  const set = new Set();
  const re = /"([^"]+)":\s*"/g;
  let m;
  while ((m = re.exec(text))) set.add(m[1]);
  return set;
}

const en = keys(block("en"));
const id = keys(block("id"));

const missing = [...en].filter((k) => !id.has(k));
const extra = [...id].filter((k) => !en.has(k));

console.log(`en keys        : ${en.size}`);
console.log(`id keys        : ${id.size}`);
console.log(`missing in id  : ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
console.log(`extra in id    : ${extra.length}${extra.length ? " -> " + extra.join(", ") : ""}`);
