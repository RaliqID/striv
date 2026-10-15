/**
 * Verifies every t("...") key used in code exists in the dictionary.
 *
 * Run from frontend/: node scripts/check-keys.mjs
 *
 * A missing key does not throw — `t()` falls back to returning the key itself,
 * so the raw string "profile.targetWeightLabel" appears in the UI. TypeScript
 * cannot catch it because the key is a plain string. This is the check that
 * does, and it is how the leaked key was found.
 *
 * Also reports keys passed as `t(someVar)`-style dynamic lookups that cannot be
 * verified, so a reviewer knows the check is not total.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

// --- dictionary keys ------------------------------------------------------
const dict = readFileSync(resolve(ROOT, "lib", "i18n", "translations.ts"), "utf8");

function keysOf(locale) {
  const start = dict.indexOf(`${locale}: {`);
  let depth = 0;
  let i = dict.indexOf("{", start);
  const from = i;
  for (; i < dict.length; i++) {
    if (dict[i] === "{") depth++;
    else if (dict[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = dict.slice(from, i + 1);
  const set = new Set();
  const re = /"([^"]+)":\s*"/g;
  let m;
  while ((m = re.exec(body))) set.add(m[1]);
  return set;
}

const en = keysOf("en");
const id = keysOf("id");

// --- keys used in code ----------------------------------------------------
const files = collect(join(ROOT, "app")).concat(collect(join(ROOT, "components")));
const missing = [];
const dynamic = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    // Static keys: t("some.key") or t('some.key')
    const re = /\bt\(\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(line))) {
      const key = m[1];
      if (!en.has(key)) {
        missing.push({ file: relative(ROOT, file), line: i + 1, key, locale: "en" });
      }
      if (!id.has(key)) {
        missing.push({ file: relative(ROOT, file), line: i + 1, key, locale: "id" });
      }
    }

    // Dynamic keys the checker cannot resolve.
    if (/\bt\(\s*[a-zA-Z_$]/.test(line)) {
      dynamic.push({ file: relative(ROOT, file), line: i + 1, text: line.trim().slice(0, 70) });
    }
  });
}

console.log(`dictionary: ${en.size} en / ${id.size} id\n`);

if (missing.length === 0) {
  console.log("all static t() keys exist in both locales");
} else {
  console.log(`${missing.length} MISSING KEY REFERENCE(S):`);
  for (const m of missing) {
    console.log(`  ${m.file}:${m.line}  [${m.locale}] ${m.key}`);
  }
}

if (dynamic.length > 0) {
  console.log(`\n${dynamic.length} dynamic lookup(s) not verifiable by this check:`);
  for (const d of dynamic.slice(0, 15)) {
    console.log(`  ${d.file}:${d.line}  ${d.text}`);
  }
  if (dynamic.length > 15) console.log(`  ... and ${dynamic.length - 15} more`);
}
