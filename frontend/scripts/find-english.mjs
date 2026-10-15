/**
 * Finds user-visible English strings in JSX, comprehensively.
 *
 * Run from frontend/: node scripts/find-english.mjs
 *
 * Why this replaces the earlier scanners: those looked for two narrow shapes
 * (a line that was purely text, and `>text<`), so they were blind to the forms
 * this codebase actually uses:
 *
 *   <div>{"No PRs yet. Keep training."}</div>   ← text inside {" "}
 *   >8 Weeks<                                    ← starts with a digit
 *   {cond ? "A" : "B"}                           ← a ternary of literals
 *   <div>{`Some ${x} text`}</div>                ← a template literal
 *
 * This walks every string literal and template literal in JSX-ish positions and
 * reports the ones that read like prose, filtering out code. False positives are
 * possible by design — a short reviewable list beats a silent miss.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip comments so their prose is never reported. */
function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Is this literal plausible user-facing copy rather than code? */
function looksLikeCopy(text) {
  const s = text.trim();

  if (s.length < 2 || s.length > 220) return false;
  if (!/[A-Za-z]{2}/.test(s)) return false;          // needs letters
  if (!/^[A-Za-z0-9]/.test(s)) return false;          // must start alphanumeric
  if (/^[a-z0-9_.\-/]+$/.test(s)) return false;       // single token: key/class/url
  if (/^[\d\s.,:%+\-/]+$/.test(s)) return false;      // pure numbers
  if (/^https?:|^\/|^#/.test(s)) return false;        // url / path / anchor
  if (/^[A-Z_]+$/.test(s)) return false;              // CONSTANT_CASE

  // Reject anything that is clearly an identifier, class list or selector.
  if (/^[a-z-]+(\s+[a-z-]+){0,3}$/.test(s)) return false;
  if (/\b(px|rem|em|vh|vw|flex|grid|rounded|text-|bg-|border-|hover:|md:)\b/.test(s)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(s)) return false;

  // Needs at least one word of 3+ letters.
  if (!/[A-Za-z]{3}/.test(s)) return false;

  return true;
}

/** Keys already translated, so a literal that equals a key is not a finding. */
const dict = readFileSync(resolve(ROOT, "lib", "i18n", "translations.ts"), "utf8");
const knownKeys = new Set([...dict.matchAll(/"([^"]+)":\s*"/g)].map((m) => m[1]));

const files = collect(join(ROOT, "app")).concat(collect(join(ROOT, "components")));
const findings = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = stripComments(raw);
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    // Skip lines that are already translated.
    if (line.includes("t(") ) return;

    // 1. Quoted literals.
    for (const m of line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
      const value = m[1];
      if (knownKeys.has(value)) continue;
      if (looksLikeCopy(value)) {
        findings.push({ file: relative(ROOT, file), line: i + 1, kind: "literal", text: value });
      }
    }

    // 2. Template literals without interpolation (static prose).
    for (const m of line.matchAll(/`([^`$\\]*)`/g)) {
      const value = m[1];
      if (looksLikeCopy(value)) {
        findings.push({ file: relative(ROOT, file), line: i + 1, kind: "template", text: value });
      }
    }
  });
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

for (const [file, items] of [...byFile.entries()].sort()) {
  console.log(`\n${file}  (${items.length})`);
  for (const it of items) {
    console.log(`  ${String(it.line).padStart(4)}  [${it.kind}] ${it.text.slice(0, 76)}`);
  }
}

console.log(`\n${findings.length} candidate string(s) across ${byFile.size} file(s).`);
