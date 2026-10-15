/**
 * Reports duplicate keys inside each locale block.
 *
 * A duplicate key is legal JavaScript (last one wins) but it means one of the
 * two values is silently dead — and since the duplicates came from an append
 * script running twice, finding them is how the translation file is kept
 * trustworthy.
 *
 * Run from frontend/: node scripts/dupes.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "lib", "i18n", "translations.ts");
const src = readFileSync(FILE, "utf8");

function block(locale) {
  const start = src.indexOf(`${locale}: {`);
  if (start === -1) return { body: "", at: -1 };
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
  // Line number of the locale block's opening brace.
  const at = src.slice(0, from).split("\n").length;
  return { body: src.slice(from, i + 1), at };
}

for (const loc of ["en", "id"]) {
  const { body, at } = block(loc);
  const re = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  const seen = new Map();
  let m;
  while ((m = re.exec(body))) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, c]) => c > 1);
  console.log(`${loc} (block at line ${at}): ${dupes.length} duplicate(s)`);
  for (const [k, c] of dupes) console.log(`  ${k}  x${c}`);
}
