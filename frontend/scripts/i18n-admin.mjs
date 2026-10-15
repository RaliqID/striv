/**
 * Applies the admin-panel i18n swaps from admin-i18n.json.
 *
 * Run from frontend/: node scripts/i18n-admin.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(ROOT, "scripts/admin-i18n.json"), "utf8"));

let changed = 0;

for (const [file, job] of Object.entries(manifest)) {
  const path = resolve(ROOT, file);

  if (!existsSync(path)) {
    console.log(`  SKIP  ${file}`);
    continue;
  }

  const before = readFileSync(path, "utf8");
  let src = before;
  let applied = 0;

  for (const [from, to] of job.swaps) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      applied++;
    }
  }

  if (!src.includes('from "@/lib/i18n/provider"')) {
    const lines = src.split("\n");
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith("import ")) last = i;
    lines.splice(last + 1, 0, 'import { useTranslation } from "@/lib/i18n/provider";');
    src = lines.join("\n");
  }

  if (!src.includes("const { t } = useTranslation();")) {
    const re = new RegExp(`(export default function ${job.component}\\([^)]*\\)\\s*\\{)`);
    if (re.test(src)) {
      src = src.replace(re, "$1\n  const { t } = useTranslation();");
    } else {
      console.log(`  WARN  ${file}: component ${job.component} not matched`);
    }
  }

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    changed++;
    console.log(`  OK    ${file}  (${applied}/${job.swaps.length})`);
  } else {
    console.log(`  --    ${file}`);
  }
}

console.log(`\n${changed} file(s) updated.`);
