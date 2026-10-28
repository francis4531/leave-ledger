// Scores the Copilot intake against tests/intake-golden.json.
// Usage: ANTHROPIC_API_KEY=... node scripts/eval-intake.mjs   (optional LL_MODEL=...)
import fs from "node:fs";
import path from "node:path";
import { runIntake } from "../netlify/lib/intake.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const G = JSON.parse(fs.readFileSync(path.join(root, "tests", "intake-golden.json"), "utf8"));
const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, LL_MODEL: process.env.LL_MODEL };
if (!env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY first."); process.exit(1); }

let fields = 0, right = 0, rows = 0, rowsRight = 0, reasonRight = 0, input = 0, output = 0, ms = 0;
const fails = [];
for (const c of G.cases) {
  const r = await runIntake(c.text, G.today, env);
  if (r.error) { fails.push(`${c.id} error: ${r.error}`); rows++; continue; }
  input += r.usage.input; output += r.usage.output; ms += r.usage.ms;
  const d = r.draft, bad = [];
  for (const [k, want] of Object.entries(c.expect)) {
    if (k === "summaryMustNotContain") { const hit = want.filter((w) => d.summary.toLowerCase().includes(w)); fields++; if (hit.length) bad.push(`summary repeats ${hit.join(", ")}`); else right++; continue; }
    if (k === "flag") { fields++; if (!!d.flag === want) right++; else bad.push(`flag ${!!d.flag}`); continue; }
    fields++;
    if (d[k] === want) right++; else bad.push(`${k} ${JSON.stringify(d[k])} (want ${JSON.stringify(want)})`);
  }
  if (d.reason === c.expect.reason) reasonRight++;
  rows++; if (!bad.length) rowsRight++; else fails.push(`${c.id}${c.adversarial ? " [adversarial]" : ""}: ${bad.join("; ")}`);
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + "%";
console.log(`Leave type right: ${reasonRight}/${rows} (${pct(reasonRight, rows)})`);
console.log(`Rows fully right: ${rowsRight}/${rows} (${pct(rowsRight, rows)})`);
console.log(`Fields right:     ${right}/${fields} (${pct(right, fields)})`);
console.log(`Tokens: ${input} in, ${output} out · average ${Math.round(ms / Math.max(1, rows))} ms per request`);
if (fails.length) { console.log("\nMisses:"); fails.forEach((f) => console.log("  " + f)); }
