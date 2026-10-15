/**
 * Translates text that sits inside a tag on the same line.
 *
 * Run from frontend/: node scripts/i18n-inline.mjs
 *
 * The earlier scanner only matched a line that was PURELY text, so headings
 * written as `<h2 className="...">About Striv</h2>` were never reported. This
 * targets that shape specifically: the text between the final `>` of an opening
 * tag and the following `<`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** [file, [[exactVisibleText, replacementExpression], ...]] */
const JOBS = [
  ["app/page.tsx", [
    ["Volume Progression", "{t(\"landing.eyebrowVolume\")}"],
    ["Next Session", "{t(\"landing.eyebrowNext\")}"],
    ["About Striv", "{t(\"landing.eyebrowAbout\")}"],
    ["The Problem", "{t(\"landing.eyebrowProblem\")}"],
    ["The Striv Approach", "{t(\"landing.eyebrowApproach\")}"],
    ["How It Works", "{t(\"landing.eyebrowHow\")}"],
    ["Striv Intelligence", "{t(\"landing.eyebrowIntelligence\")}"],
    ["Why Striv", "{t(\"landing.eyebrowWhy\")}"],
    ["Get in Touch", "{t(\"landing.eyebrowContact\")}"],
    ["Name", "{t(\"landing.formName\")}"],
    ["Email", "{t(\"landing.formEmail\")}"],
    ["Message", "{t(\"landing.formMessage\")}"],
  ]],
  ["app/records/page.tsx", [
    ["All Types", "{t(\"records.allTypes\")}"],
  ]],
  ["app/progress/page.tsx", [
    ["Projected", "{t(\"progress.projected\")}"],
  ]],
];

/** Replace text sitting between `>` and `<` on the same line. */
function swapInline(src, text, replacement) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `>TEXT<` where TEXT is exactly the target (no nested markup).
  const re = new RegExp(`>(${escaped})<`, "g");
  let count = 0;
  const out = src.replace(re, (_m, _inner) => {
    count++;
    return `>${replacement}<`;
  });
  return { out, count };
}

let total = 0;

for (const [file, pairs] of JOBS) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.log(`  SKIP  ${file}`);
    continue;
  }

  let src = readFileSync(path, "utf8");
  let applied = 0;

  for (const [text, replacement] of pairs) {
    const { out, count } = swapInline(src, text, replacement);
    src = out;
    applied += count;
  }

  if (applied > 0) {
    writeFileSync(path, src, "utf8");
    total += applied;
    console.log(`  OK    ${file}  (${applied})`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${total} inline node(s) translated.`);
