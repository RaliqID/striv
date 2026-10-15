/**
 * Regression test for visible-english.mjs.
 *
 * WHY THIS EXISTS
 * The English scanner was wrong SEVEN times, and every fix was reactive -- found
 * because a string escaped into the product, not because the detector was
 * understood:
 *   1. attribute literals (placeholder/title/alt) on their own line
 *   2. short single-word labels (Sets, Reps, kg)
 *   3. multi-line JSX comments counted as copy
 *   4. inline text sharing a line with its tag (<h4 ...>Text</h4>)
 *   5. everything on a line containing className -- hid the ENTIRE landing page
 *   6. single-quoted and template literals
 *   7. template literals / aria expressions / label arrays, all hidden because
 *      the line-shape suppression decided a declaration line could not hold copy
 *
 * This test inverts that. Each shape has a fixture with the expected text stated
 * EXPLICITLY, so a gap is found by running the test rather than by noticing a
 * missing translation in the UI.
 *
 * It also guards the structural fix: the scanner no longer suppresses by line
 * shape, because "this line looks like code" says nothing about whether a STRING
 * on it is copy. If someone reintroduces line-based suppression, cases 5 and 7
 * fail here.
 *
 * Run from frontend/: node scripts/test-scanner.mjs
 * Writes a temporary fixture and removes it.
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "components", "__scanner_fixture.tsx");

/**
 * [label, snippet, the exact text that must appear in the scanner's report]
 *
 * The expectation is written out by hand rather than derived from the snippet.
 * An earlier version derived it with a regex, which returned null for three
 * cases and printed "MISSED ... null" -- reading as a scanner failure when it
 * was a failure of the test. A test that can mis-report must not be trusted.
 */
const CASES = [
  ["jsx own line", `        Hardcoded Heading Here`, "Hardcoded Heading Here"],
  ["inline element", `      <h4 className="x">Inline Heading</h4>`, "Inline Heading"],
  ["double quote", `      setError("Double quoted error");`, "Double quoted error"],
  ["single quote", `      setError('Single quoted error');`, "Single quoted error"],
  ["template literal", "      const m = `Template literal text`;", "Template literal text"],
  ["placeholder attr", `      <input placeholder="Placeholder here" />`, "Placeholder here"],
  ["attr + className", `      <input className="y" placeholder="Attr On Class Line" />`, "Attr On Class Line"],
  ["short label", `      <span>Sets</span>`, "Sets"],
  ["ternary text", `      {saving ? "Ternary Text Here" : "Other"}`, "Ternary Text Here"],
  ["option child", `      <option value="1">Monday</option>`, "Monday"],
  ["aria expression", "      <b aria-label={`Dynamic Label ${x}`} />", "Dynamic Label"],
  ["array label", `      const D = ["Array Label One", "Two"];`, "Array Label One"],
];

const body = [
  '"use client";',
  "export default function Fixture() {",
  ...CASES.map(([, snippet]) => snippet),
  "  return null;",
  "}",
].join("\n");

writeFileSync(FIXTURE, body, "utf8");

let output = "";
try {
  output = execFileSync("node", ["scripts/visible-english.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
} catch (err) {
  // The scanner exits non-zero only on its own error; capture either way.
  output = (err.stdout || "") + (err.stderr || "");
} finally {
  unlinkSync(FIXTURE);
}

console.log("scanner fixture test\n");
let caught = 0;
const missed = [];
for (const [name, , expected] of CASES) {
  const found = output.includes(expected);
  if (found) caught++;
  else missed.push({ name, expected });
  console.log(`  ${found ? "ok  " : "FAIL"}  ${name.padEnd(18)} "${expected}"`);
}

console.log("");
console.log(`${caught}/${CASES.length} shapes detected`);

// Confirm the fixture was removed, so the test cannot pollute the repo.
let leaked = false;
try {
  readFileSync(FIXTURE);
  leaked = true;
} catch {
  leaked = false;
}
if (leaked) console.log("  !! fixture file was NOT removed");

if (missed.length || leaked) {
  console.log("");
  console.log("FAILED:");
  for (const m of missed) console.log(`  blind to ${m.name}: "${m.expected}"`);
  process.exitCode = 1;
} else {
  console.log("PASS: every shape is detected.");
}
