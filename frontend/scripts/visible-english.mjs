/**
 * Lists user-visible English text still hardcoded in JSX.
 *
 * Run from frontend/: node scripts/visible-english.mjs
 *
 * Deliberately narrower than the earlier audit: it reports only JSX TEXT NODES
 * (a line that is just words between tags) and quoted UI strings, and filters
 * out code, comments, className strings, imports and single words. The goal is
 * a list where every entry is something a user actually reads, so it can be
 * worked through to zero rather than skimmed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "app");
const COMPONENTS = join(ROOT, "components");

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Things that look like English but are not user-visible copy.
 *
 * A single list, and it discards the whole line: a comment is never rendered,
 * and neither is an import.
 *
 * There used to be a second list (SKIP_SOFT) that decided a line "looks like
 * styling or code" and silenced the quoted-string pattern on it. It has been
 * REMOVED, because deciding by LINE whether a STRING is copy is a proxy that was
 * wrong twice:
 *   - every line of app/page.tsx carries a className, so the whole landing page
 *     was skipped;
 *   - `const m = `Failed`` is a declaration line that carries copy, so it was
 *     skipped too.
 * Deciding by VALUE works and needs no such list: the patterns below require
 * real sentence shape, which already rejects `text-primary`, `/dashboard`,
 * `use client` and `GET`.
 */
const SKIP_HARD = [
  /^\s*(\/\/|\*|\/\*|\{?\/\*)/,           // comments
  /^\s*(import|export|type|interface)\s/,  // declarations
  /^\s*"(use client|use server)"/,
  /data-testid/,
  /\/url:/,                                // link targets
  /^\s*\}[,;]?\s*$/,

  // Password mask. "••••••••" is a row of bullet characters that visually
  // stand for "you are typing a secret"; it is not words and carries no
  // meaning to translate. Locale-independent by design, so it stays literal
  // in every locale. Matched specifically (an attribute whose value is only
  // bullets) so it cannot silence a real placeholder elsewhere.
  /(?:placeholder|title|alt|aria-label)="[•\u2022]+"/,
];

/** A JSX text node: leading whitespace then words, on its own line. */
const JSX_TEXT = /^\s{6,}([A-Z][A-Za-z0-9 ,.'!?&:;()/+-]{3,})\s*$/;

/**
 * Text sharing a line with its own tag: `<h4 className="...">Hypertrophy B</h4>`.
 *
 * Added after the landing page was found to be entirely invisible to this
 * scanner. JSX_TEXT requires the text to occupy a line by itself, so every
 * element written on one line -- which is how most of app/page.tsx is written --
 * was skipped. That meant the first page a visitor ever sees was the one page
 * never audited.
 *
 * Captures the inner text of a simple one-line element, ignoring anything that
 * is already a t() call or an interpolation.
 */
const INLINE_TEXT =
  /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>\s*([A-Z][A-Za-z0-9][A-Za-z0-9 ,.'!?&:;()/+-]{2,})\s*<\/[a-zA-Z][a-zA-Z0-9]*>/;

/**
 * A quoted string that reads like a sentence.
 *
 * Covers single quotes and backticks as well as double quotes.
 *
 * This was double-quote-only, which hid two whole classes of real copy:
 *   setError('Save failed.')          -- single-quoted literal
 *   `Failed for ${name}`              -- template literal
 * An earlier audit found strings of both kinds by hand; the detector was never
 * widened to match, so the gap kept regenerating. Template literals are matched
 * on their LITERAL TEXT ONLY (interpolations are ignored) because that is the
 * part a translator would need.
 */
const QUOTED_SENTENCE =
  /(?:"|'|`)([A-Z][a-z]+(?:\s+[a-zA-Z()/.,'-]+){1,})(?:"|'|`)/;

/**
 * User-facing attributes carrying a literal value.
 *
 * Added after a review found eight real strings this scanner had missed:
 * placeholder text and short labels such as "Sets", "Reps" and "kg" sit on
 * attribute lines that JSX_TEXT does not match (the line does not start with
 * indentation-then-words), and the units were explicitly excluded by SKIP.
 * Both were genuinely user-visible, so the gap was in the detector, not the
 * app. Captures the value of any of these attributes.
 */
const ATTR_LITERAL =
  /\b(?:placeholder|title|alt|aria-label|label|description|helperText)="([^"]{3,})"/;

/**
 * An attribute whose value is a JSX expression containing literal text.
 *
 * Added after a fixture test showed these were invisible: a plain
 * `attr="literal"` pattern cannot see through the braces in
 *
 *     <b aria-label={`Dynamic Label ${x}`} />
 *
 * The text inside the braces is read aloud by a screen reader, so it is copy.
 * Captures the literal runs, ignoring the ${...} interpolations.
 */
const ATTR_EXPRESSION =
  /\b(?:placeholder|title|alt|aria-label|label)\s*=\s*\{\s*`([^`]{3,})`\s*\}/;

/**
 * Label arrays and object literals declared at module scope.
 *
 * Also found by the fixture test:
 *
 *     const D = ["Array Label One", "Two"];
 *
 * These are routinely rendered into <option> lists, badges and filters, so they
 * are copy. Matched only when the line declares an array/object of quoted
 * strings, to avoid flagging every ordinary call argument.
 */
const LABEL_COLLECTION =
  /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z0-9_]+\s*(?::[^=]+)?=\s*[\[{]\s*"[A-Z][^"]{3,}"/;

/**
 * Short standalone UI labels.
 *
 * "Sets", "Reps" and "kg" are real labels a member reads, but they are a single
 * word, so neither JSX_TEXT (needs 6+ spaces of indent) nor QUOTED_SENTENCE
 * (needs two words) catches them. Matched only when the whole JSX child is one
 * of these known words, to avoid flagging stray identifiers.
 */
const SHORT_LABEL =
  /^\s{6,}\{\s*"([A-Za-z][A-Za-z]{1,5})"\s*\}\s*$|^\s{6,}(Sets|Reps|REPS|kg|lbs)\s*$/;

const files = [...collect(APP), ...collect(COMPONENTS)];
const findings = [];

/**
 * Strip comments before scanning a block.
 *
 * A line-by-line SKIP was not enough: only the FIRST line of a multiline
 * comment starts with the comment marker, so the prose on every following line
 * looked like ordinary text and was reported as untranslated copy. Twenty of
 * the entries in one run were the scanner flagging its own explanatory comments.
 *
 * Removing comments wholesale is both simpler and more accurate than tracking
 * comment state per line, and it cannot hide real copy because a string that
 * sits inside a comment is not rendered either way. Line structure is preserved
 * by blanking rather than deleting, so reported line numbers still line up.
 */
function stripComments(source) {
  // Replace the body of every /* ... */ (including JSX {/* ... */}) with
  // whitespace, keeping the newlines so line numbers stay correct.
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, " ")
  ).replace(/^[ \t]*\/\/.*$/gm, "");
}

for (const file of files) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");

  lines.forEach((line, i) => {
    // A comment or import is never rendered — the line is discarded outright.
    if (SKIP_HARD.some((re) => re.test(line))) return;
    if (line.includes("t(")) return;              // already translated
    if (!/[A-Za-z]{3}/.test(line)) return;

    /*
     * Note there is deliberately NO line-shape suppression here any more.
     *
     * SKIP_SOFT used to decide that a line "looks like styling or code" and
     * silence the quoted-string pattern on it. That was a proxy for the real
     * question -- "is this STRING copy?" -- and it was wrong twice: once hiding
     * the landing page (every line carried a className) and once hiding
     * `const m = `Failed`` (a declaration line carrying copy).
     *
     * The pattern is narrowed by VALUE instead, which is the question that
     * actually matters, and needs no help: requiring a capitalised word plus at
     * least one more word rejects `text-primary`, `/dashboard`, `use client`
     * and `GET` on its own.
     */
    const jsx = JSX_TEXT.exec(line);
    /*
     * The quoted-string pattern is NOT suppressed by line shape.
     *
     * It used to be, via a "looks like styling" flag, and that was the root of a
     * whole class of bugs: whether a LINE looks like code says nothing about
     * whether a STRING on it is copy. `const m = `Failed`` lives on a
     * declaration line yet holds user-facing text, so suppressing by line hid it.
     *
     * No suppression is needed, because the pattern is already narrowed by
     * VALUE: it requires a capitalised word followed by at least one more word,
     * which rejects `text-primary`, `/dashboard`, `use client` and `GET`.
     * Deciding on the value is correct; deciding on the line was a proxy that
     * repeatedly proved wrong.
     */
    const quoted = QUOTED_SENTENCE.exec(line);
    const attr = ATTR_LITERAL.exec(line);
    const short = SHORT_LABEL.exec(line);
    const inline = INLINE_TEXT.exec(line);
    const attrExpr = ATTR_EXPRESSION.exec(line);
    const collection = LABEL_COLLECTION.exec(line);

    if (jsx) {
      findings.push({ file: relative(ROOT, file), line: i + 1, text: jsx[1], kind: "jsx" });
    } else if (attr) {
      // An attribute whose value is a literal — already-translated ones are
      // ruled out by the `t(` check above.
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: attr[1],
        kind: "attr",
      });
    } else if (short) {
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: (short[1] ?? short[2]).trim(),
        kind: "label",
      });
    } else if (attrExpr) {
      // An attribute whose value is a template literal, e.g.
      // aria-label={`Delete ${name}`} — the literal part is screen-reader copy.
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: attrExpr[1].trim(),
        kind: "attr-expr",
      });
    } else if (collection) {
      // A module-scope array/object of labels, typically rendered into options
      // or badges, e.g. const DAYS = ["Monday", "Tuesday"];
      const first = /"([^"]{3,})"/.exec(line);
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: first ? first[1] : line.trim().slice(0, 60),
        kind: "collection",
      });
    } else if (inline) {
      // Text sharing its line with the tag, e.g. <h4 ...>Hypertrophy B</h4>.
      // Checked after the dedicated shapes above so a more precise match wins.
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: inline[1].trim(),
        kind: "inline",
      });
    } else if (quoted) {
      // Skip if it is inside a t() call on an adjacent line.
      const near = [lines[i - 1], line, lines[i + 1]].join(" ");
      if (/t\("/.test(near)) return;
      findings.push({ file: relative(ROOT, file), line: i + 1, text: quoted[1], kind: "string" });
    }
  });
}

/** Group by file so the list can be worked through a file at a time. */
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

for (const [file, items] of [...byFile.entries()].sort()) {
  console.log(`\n${file}  (${items.length})`);
  for (const item of items) {
    console.log(`  ${String(item.line).padStart(4)}  [${item.kind}] ${item.text.slice(0, 72)}`);
  }
}

console.log(`\n${findings.length} visible English string(s) across ${byFile.size} file(s).`);
