/**
 * Lists visible English text still hardcoded — both shapes.
 *
 * Run from frontend/: node scripts/scan-all.mjs
 *
 * Catches:
 *   1. a line that is purely text (a JSX text node)
 *   2. text between `>` and `<` on the same line (an inline node)
 *
 * Shape 2 was invisible to the first scanner, which is why headings like
 * `<h2 ...>About Striv</h2>` survived several passes.
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

const SKIP = [
  /^\s*(\/\/|\*|\/\*)/,
  /^\s*(import|export|type|interface)\s/,
  /className|classList/,
  /material-symbols-outlined/,
  /data-testid/,
  /\/url:/,
  /^\s*name:\s*"/,
  /^\s*value:\s*"/,
  /^\s*icon:\s*"/,
  /^\s*href:/,
  /^\s*(const|let|var|function|return)\s/,
  /t\(/,
  /aria-label=\{/,
  /htmlFor/,
  /\{\.\.\./,
];

/** Words that are units, brands, or intentional loanwords. */
const ALLOW = /^(kg|lbs|1RM|Striv|AI|kg\)|sets?|reps?|Seta|Email|Volume|Status|Live|Admin|Trainer|Member|Bio|Target|Workout|Muscle|Beginner|Intermediate|Advanced)$/i;

/** Shape 1: a line that is only text. */
const PURE_TEXT = /^\s{6,}([A-Z][A-Za-z0-9 ,.'!?&:;()/+-]{3,})\s*$/;

/** Shape 2: text between > and < on one line, no nested braces. */
const INLINE = />([A-Z][A-Za-z0-9 ,.'!?&:;()/+-]{3,})</g;

const files = collect(join(ROOT, "app")).concat(collect(join(ROOT, "components")));
const findings = [];

/**
 * Track JSX comment blocks so their prose is not reported.
 *
 * `{/*` … `*}/` spans several lines and its contents are English documentation,
 * not copy — reporting it produced false positives on every run and made the
 * count untrustworthy.
 */
function commentMask(lines) {
  const masked = new Array(lines.length).fill(false);
  let inBlock = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (!inBlock && (trimmed.startsWith("{/*") || trimmed.startsWith("/*"))) {
      inBlock = true;
    }

    if (inBlock) masked[i] = true;
    if (inBlock && (trimmed.endsWith("*/}") || trimmed.endsWith("*/"))) {
      inBlock = false;
    }

    // Single-line comments.
    if (/^\s*(\/\/|\*|<!--)/.test(line)) masked[i] = true;
  });

  return masked;
}

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const isComment = commentMask(lines);

  lines.forEach((line, i) => {
    if (isComment[i]) return;
    if (SKIP.some((re) => re.test(line))) return;
    if (!/[A-Za-z]{3}/.test(line)) return;

    const pure = PURE_TEXT.exec(line);
    if (pure && !ALLOW.test(pure[1].trim())) {
      findings.push({ file: relative(ROOT, file), line: i + 1, kind: "text", text: pure[1].trim() });
      return;
    }

    // Inline: take the last `>text<` on the line, which is the visible copy.
    INLINE.lastIndex = 0;
    let m;
    while ((m = INLINE.exec(line))) {
      const text = m[1].trim();
      if (ALLOW.test(text)) continue;
      // Skip when the text is actually an attribute value.
      const before = line.slice(0, m.index);
      if (/[a-zA-Z-]+="$/.test(before)) continue;
      findings.push({ file: relative(ROOT, file), line: i + 1, kind: "inline", text });
      break;
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
    console.log(`  ${String(it.line).padStart(4)}  [${it.kind}] ${it.text.slice(0, 70)}`);
  }
}

console.log(`\n${findings.length} visible English string(s) across ${byFile.size} file(s).`);
