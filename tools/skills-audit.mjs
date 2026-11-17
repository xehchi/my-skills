// בקרת תוכן לסקילים של "לציפי" (GAP). הרצה: node tools/skills-audit.mjs
// תופס שאריות ארכיטקטורה ישנה (Cloudflare/D1/React/Tiptap) בסקילים פעילים.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".claude/skills";
const STALE = [
  [/cloudflare|workers\.dev|pages\.dev|wrangler/i, "Cloudflare"],
  [/\bD1\b|CREATE TABLE|INSERT INTO/i, "D1/SQL"],
  [/\bReact\b|shadcn|Radix|Vite\b|@tiptap|TanStack|Recharts/i, "React/Tiptap"],
  [/Google OAuth|Cf-Access/i, "OAuth/Access"],
];

const files = [];
for (const name of readdirSync(ROOT)) {
  if (name.startsWith("_")) continue;
  const file = join(ROOT, name, "SKILL.md");
  try {
    files.push({ name, text: readFileSync(file, "utf8") });
  } catch { /* ללא SKILL.md */ }
}

let bad = 0;
for (const { name, text } of files) {
  const hits = STALE.filter(([re]) => re.test(text)).map(([, tag]) => tag);
  if (hits.length) bad++;
  console.log(
    `${name.padEnd(18)}${String(text.split("\n").length).padStart(5)} שורות  ` +
      (hits.length ? `⚠️  ${hits.join(", ")}` : "✅")
  );
}
console.log(`\n${files.length} סקילים פעילים, ${bad} עם שאריות ארכיטקטורה ישנה.`);
process.exitCode = bad ? 1 : 0;
