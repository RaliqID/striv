/**
 * Finishes the admin security page.
 * Run from frontend/: node scripts/i18n-security.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "app", "admin", "security", "page.tsx");

let src = readFileSync(FILE, "utf8");
let applied = 0;

const SWAPS = [
  // The corrupted paragraph: an English fragment was left glued to the key.
  [
    `                    {t("admin.throttleBody1")}\n                    15 minutes per IP. Once an account is locked, even the correct password is\n                    refused until the window passes.`,
    `                    {t("admin.throttleBody")}`,
  ],

  // Table header row.
  [
    '{["When", "Account", "IP address", "Result"].map((header) => (',
    '{["admin.colWhen", "admin.colAccount", "admin.colIp", "admin.colResult"].map((headerKey) => (',
  ],

  // Result badge.
  ['{attempt.successful ? "Success" : "Failed"}', '{attempt.successful ? t("admin.success") : t("admin.failed")}'],

  // Failure-count badges.
  ['{formatNumber(row.failures)} fails', '{t("admin.fails", { count: formatNumber(row.failures) })}'],

  // "N accounts targeted" / "From N addresses".
  [
    '{formatNumber(row.distinct_emails)} account\n              {row.distinct_emails === 1 ? "" : "s"} targeted',
    '{t("admin.accountsTargetedShort", { count: formatNumber(row.distinct_emails) })}',
  ],
  [
    'From {formatNumber(row.distinct_ips)} address\n              {row.distinct_ips === 1 ? "" : "es"}',
    '{t("admin.fromAddresses", { count: formatNumber(row.distinct_ips) })}',
  ],
];

for (const [from, to] of SWAPS) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    applied++;
  } else {
    console.log(`  MISS  ${from.slice(0, 60).replace(/\n/g, " ")}`);
  }
}

// The header consumer needs the new variable name.
src = src.replace(/\{header\}(?=<\/)/, "{t(headerKey)}");

writeFileSync(FILE, src, "utf8");
console.log(`${applied}/${SWAPS.length} applied`);
