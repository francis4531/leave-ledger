// Scores Clerk intake against tests/intake-golden.json from the command line.
// Usage: ANTHROPIC_API_KEY=... node scripts/eval-intake.mjs   (optional LL_MODEL=...)
// The same run is available to the site admin from the inbox ("Run Clerk test").
import fs from "node:fs";
import path from "node:path";
import { runCases, summarizeRun } from "../netlify/lib/eval.mjs";
import { DEFAULT_MODEL } from "../netlify/lib/intake.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const G = JSON.parse(fs.readFileSync(path.join(root, "tests", "intake-golden.json"), "utf8"));
const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, LL_MODEL: process.env.LL_MODEL };
if (!env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY first."); process.exit(1); }

const results = [];
for (let i = 0; i < G.cases.length; i += 10) results.push(...(await runCases(G.cases.slice(i, i + 10), G.today, env)));
const s = summarizeRun(results, env.LL_MODEL || DEFAULT_MODEL);
console.log(`Model: ${s.model} · ${s.cases} cases`);
console.log(`Leave type right: ${s.reasonPct}%`);
console.log(`Rows fully right: ${s.rowsPct}%`);
console.log(`Fields right:     ${s.fieldsPct}%`);
console.log(`Adversarial rows handled: ${s.adversarialPct}%`);
console.log(`Tokens: ${s.input} in, ${s.output} out · average ${s.avgMs} ms per request`);
if (s.misses.length) { console.log("\nMisses:"); s.misses.forEach((m) => console.log(`  ${m.id}${m.adversarial ? " [adversarial]" : ""}: ${m.bad.join("; ")}`)); }
