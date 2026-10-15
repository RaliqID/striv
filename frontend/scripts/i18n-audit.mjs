/**
 * Finds user-visible English text still hardcoded in page JSX.
 *
 * Run from frontend/: node scripts/i18n-audit.mjs
 *
 * Heuristic, not a parser: it looks for JSX text nodes and double-quoted
 * sentence-like strings, then filters out the things that are legitimately
 * English in code (class names, imports, keys, URLs, event names). The goal is
 * a short list a human can review, not a perfect count.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "app");

/** Recursively collect page.tsx paths. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry === "page.tsx" || entry === "layout.tsx") out.push(full);
  }
  return out;
}

/** Lines that are code, not copy, and should never be flagged. */
const IGNORE = [
  /^\s*(\/\/|\*|\/\*)/, // comments
  /^\s*(import|export|type|interface)\s/, // declarations
  /className|classList/, // styling
  /^\s*"(use client|use server)"/,
  /"(GET|POST|PUT|DELETE|PATCH)"/,
  /material-symbols-outlined/,
  /aria-label=\{/,
  /data-testid/,
  /^\s*const\s+\w+\s*=\s*\(?[^)]*\)?\s*=>/, // arrow helpers (checked separately)
];

/** A JSX text node: something like `  Some words here` between tags. */
const JSX_TEXT = /^\s{6,}[A-Z][A-Za-z0-9 ,.'!?&:;()/-]{4,}\s*$/;

/** A quoted sentence in an attribute or expression. */
const QUOTED = /"[A-Z][A-Za-z0-9 ,.'!?&:;()/-]{12,}"/;

const files = collect(APP);
let total = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");

  // Skip files that clearly route every string through t().
  const lines = src.split("\n");
  const hits = [];

  lines.forEach((line, i) => {
    if (IGNORE.some((re) => re.test(line))) return;
    if (line.includes("t(")) return; // already translated on this line
    if (JSX_TEXT.test(line) || QUOTED.test(line)) {
      hits.push({ n: i + 1, text: line.trim() });
    }
  });

  if (hits.length > 0) {
    console.log(`\n${relative(APP, file)}  (${hits.length})`);
    for (const h of hits.slice(0, 12)) {
      console.log(`  ${h.n}: ${h.text.slice(0, 100)}`);
    }
    total += hits.length;
  }
}

console.log(`\n${total} candidate string(s) across ${files.length} files.`);
