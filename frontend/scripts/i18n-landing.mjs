/**
 * Finishes the landing page i18n.
 * Run from frontend/: node scripts/i18n-landing.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "app", "page.tsx");

const SWAPS = [
  ["}`}>{label}</div>", "}`}>{t(labelKey)}</div>"],
  ['{ num: "1", title: "Clarity" },', '{ num: "1", titleKey: "landing.clarity" },'],
  ['{ num: "3", title: "Evidence" },', '{ num: "3", titleKey: "landing.evidence" },'],
  ["text-primary uppercase tracking-tight\">{item.title}</h4>", "text-primary uppercase tracking-tight\">{t(item.titleKey)}</h4>"],
  ["Everything about your training, in one place.", "{t(\"landing.sectionEverything\")}"],
  ["Turn training data into something you can understand.", "{t(\"landing.sectionTurn\")}"],
  ["From workout to insight.", "{t(\"landing.sectionFrom\")}"],
  ["Training is more than numbers.", "{t(\"landing.sectionMoreThan\")}"],
  ["Train with context, not just numbers.", "{t(\"landing.sectionContext\")}"],
  ["Train with clarity.", "{t(\"landing.sectionClarity\")}"],
  ["More data doesn&apos;t always mean more understanding.", "{t(\"landing.sectionData\")}"],
  ["Every set, every rep, every moment of exertion builds a larger narrative.", "{t(\"landing.sectionNarrative\")}"],
];

let src = readFileSync(FILE, "utf8");
let applied = 0;

for (const [from, to] of SWAPS) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    applied++;
  }
}

writeFileSync(FILE, src, "utf8");
console.log(`${applied}/${SWAPS.length} applied`);
