// Runs the California rules answer key (tests/rules-cases.json) against the rules engine.
// The answer key was written from the law and official guidance, separately from the engine code.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as E from "../public/engine.mjs";

const CASES = JSON.parse(fs.readFileSync(new URL("./rules-cases.json", import.meta.url), "utf8"));
// Cases listed here are known disagreements waiting on a decision; they are reported, not failed.
const KNOWN = fs.existsSync(new URL("./rules-known.json", import.meta.url)) ? JSON.parse(fs.readFileSync(new URL("./rules-known.json", import.meta.url), "utf8")) : {};

const EMP = { hire: "2020-01-01", hours12: 2000, cfraUsed: 0, fmlaUsed: 0, sick: 40, sickUsedYr: 0, reproUsed: 0, hiQuarter: 15000 };
const CO = { headcount: 20, within75: false, holidays: [], band90: 16279.9, band70: 20931.3, wbaMax: 1765, wbaMin: 50 };
const OPTS = { weeks: 4, disWeeks: 6, bondWeeks: 0, days: 1, hours: 8, relation: "parent" };

// Warning text from the engine, mapped to the answer key's tags.
const WARN = [
  ["cfra_balance", /only .* of CFRA remain|past the CFRA balance/i],
  ["not_cfra_eligible", /Not eligible for CFRA/i],
  ["pdl_over_4_months", /past 4 months of PDL/i],
  ["under_30_days", /under 30 days/i],
  ["over_5_days", /requires 5 days/i],
  ["repro_cap", /cap it at 20/i],
  ["sick_not_yet", /day 90 of employment/i],
  ["sick_over_available", /hours are usable/i],
];
const tagsOf = (warnings, facts) => {
  const tags = new Set(WARN.filter(([, re]) => warnings.some((w) => re.test(w.t))).map(([t]) => t));
  if (facts.some((f) => /PFL starts covering a designated individual/i.test(f.t))) tags.add("designated_no_pfl");
  return [...tags];
};
const seg = (P, cls) => P.segs.find((s) => s.cls === cls);

function check(c) {
  const emp = { ...EMP, ...(c.input.employee || {}) }, co = { ...CO, ...(c.input.company || {}) };
  const opts = { ...OPTS, ...(c.input.opts || {}) };
  const start = opts.start || c.input.today;
  const x = c.expect, problems = [];
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}: expected ${JSON.stringify(want)}, engine gave ${JSON.stringify(got)}`); };

  if (x.elig) {
    const el = E.eligibility(emp, co, start);
    const got = { cfra: el.cfra.ok, fmla: el.fmla.ok, fmlaCovered: el.fmla.covered, pdl: el.pdl.ok, bereavement: el.short.ok, sick: el.sick.ok, cfraRemainingWeeks: el.cfra.remaining };
    for (const k of Object.keys(x.elig)) eq(`elig.${k}`, got[k], x.elig[k]);
  }
  if (x.benefit) {
    const b = E.weeklyBenefit(emp, co);
    if (x.benefit.amount != null) eq("benefit.amount", b && Math.round(b.amount * 100) / 100, x.benefit.amount);
    if ("rate" in x.benefit) eq("benefit.rate", b && b.rate, x.benefit.rate);
    if (x.benefit.capped != null) eq("benefit.capped", b && b.capped, x.benefit.capped);
  }
  let P = null;
  if ((x.plan || x.tasks) && c.input.reason) P = E.buildPlan(emp, co, c.input.reason, { ...opts, start });
  if (x.plan) {
    const p = x.plan;
    for (const l of p.lawsInclude || []) if (!P.laws.includes(l)) problems.push(`plan.laws: expected to include ${l}, engine gave ${JSON.stringify(P.laws)}`);
    for (const l of p.lawsExclude || []) if (P.laws.includes(l)) problems.push(`plan.laws: expected not to include ${l}, engine gave ${JSON.stringify(P.laws)}`);
    if (p.paysSDI != null) eq("plan.paysSDI", P.pays.sdi, p.paysSDI);
    if (p.paysPFL != null) eq("plan.paysPFL", P.pays.pfl, p.paysPFL);
    if (p.sdiPayStart != null) eq("plan.sdiPayStart", seg(P, "sdi")?.start ?? null, p.sdiPayStart);
    if (p.pflEnd != null) eq("plan.pflEnd", seg(P, "pfl")?.end ?? null, p.pflEnd);
    if (p.pflWeeks != null) { const s = seg(P, "pfl"); eq("plan.pflWeeks", s ? Math.round((E.diffDays(s.start, s.end) / 7) * 100) / 100 : 0, p.pflWeeks); }
    if (p.pdlEnd != null) eq("plan.pdlEnd", seg(P, "pdl")?.end ?? null, p.pdlEnd);
    if (p.end != null) eq("plan.end", P.end, p.end);
    if ("jobProtectedUntil" in p) {
      const prot = P.segs.filter((s) => s.lane === "protect" && s.cls !== "none").map((s) => s.end).sort();
      eq("plan.jobProtectedUntil", prot.length ? prot[prot.length - 1] : null, p.jobProtectedUntil);
    }
    if (p.warnsAbout) {
      const got = tagsOf(P.warnings, P.facts);
      for (const t of p.warnsAbout) if (!got.includes(t)) problems.push(`plan.warnsAbout: expected "${t}", engine gave ${JSON.stringify(got)}`);
    }
  }
  if (x.tasks) {
    const T = E.makeTasks(c.input.reason, c.input.requested || start, P, co);
    for (const [k, due] of Object.entries(x.tasks)) eq(`tasks.${k}`, T.find((t) => t.key === k)?.due ?? null, due);
  }
  return problems;
}

const byArea = {};
for (const c of CASES) (byArea[c.area] = byArea[c.area] || []).push(c);
for (const [area, list] of Object.entries(byArea)) {
  describe(`rules: ${area}`, () => {
    for (const c of list) {
      const known = KNOWN[c.id];
      test(`${c.id}: ${c.desc}`, { todo: known ? `known: ${known}` : undefined }, () => {
        const problems = check(c);
        assert.ok(problems.length === 0, `${c.desc}\nSource: ${c.source}\n  ${problems.join("\n  ")}`);
      });
    }
  });
}
