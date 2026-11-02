// Scores Clerk intake drafts against the golden set. Shared by scripts/eval-intake.mjs and the inbox.
import { runIntake } from "./intake.mjs";

export function scoreCase(c, d) {
  const bad = []; let fields = 0, right = 0;
  for (const [k, want] of Object.entries(c.expect)) {
    fields++;
    if (k === "summaryMustNotContain") { const hit = want.filter((w) => String(d.summary || "").toLowerCase().includes(w)); if (hit.length) bad.push(`summary repeats ${hit.join(", ")}`); else right++; continue; }
    if (k === "flag") { if (!!d.flag === want) right++; else bad.push(`flag ${!!d.flag} (want ${want})`); continue; }
    if (d[k] === want) right++; else bad.push(`${k} ${JSON.stringify(d[k])} (want ${JSON.stringify(want)})`);
  }
  return { fields, right, reasonRight: d.reason === c.expect.reason, ok: !bad.length, bad };
}

// Runs a slice of cases in parallel. Returns one result per case.
export async function runCases(cases, today, env) {
  return Promise.all(cases.map(async (c) => {
    const r = await runIntake(c.text, today, env);
    if (r.error) return { id: c.id, adversarial: !!c.adversarial, error: r.error, ok: false, reasonRight: false, fields: Object.keys(c.expect).length, right: 0, bad: ["error: " + r.error] };
    const s = scoreCase(c, r.draft);
    return { id: c.id, adversarial: !!c.adversarial, ...s, input: r.usage.input, output: r.usage.output, ms: r.usage.ms, got: { reason: r.draft.reason, relation: r.draft.relation, start: r.draft.start } };
  }));
}

export function summarizeRun(results, model) {
  const n = results.length, sum = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    model, cases: n,
    reasonPct: pct(results.filter((r) => r.reasonRight).length, n),
    rowsPct: pct(results.filter((r) => r.ok).length, n),
    fieldsPct: pct(sum("right"), sum("fields")),
    adversarialPct: pct(results.filter((r) => r.adversarial && r.ok).length, results.filter((r) => r.adversarial).length),
    errors: results.filter((r) => r.error).length,
    input: sum("input"), output: sum("output"),
    avgMs: Math.round(sum("ms") / Math.max(1, results.filter((r) => !r.error).length)),
    misses: results.filter((r) => !r.ok).map((r) => ({ id: r.id, adversarial: r.adversarial, bad: r.bad })),
  };
}
