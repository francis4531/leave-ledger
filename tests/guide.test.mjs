// The Guide tab content and the EDD filing steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eddSteps, eddIds, LEAVES, RIGHTS, EDD } from "../public/guide.mjs";
import { buildPlan, sampleData } from "../public/engine.mjs";

const D = sampleData("2026-11-01"), co = D.company, emp = D.employees[0]; // Priya: eligible for everything
const plan = (reason, o) => { const c = { reason, opts: { start: "2027-02-01", weeks: 6, disWeeks: 10, bondWeeks: 12, days: 3, hours: 8, relation: "parent", ...o } }; return [c, buildPlan(emp, co, reason, c.opts)]; };

test("own health: one SDI claim, filed between day 9 and day 49", () => {
  const [c, P] = plan("own_health");
  const e = eddSteps(c, P);
  assert.deepEqual(e.claims.map((x) => x.kind), ["sdi"]);
  assert.deepEqual(e.claims[0].window, { from: "2027-02-10", to: "2027-03-22" });
  assert.ok(eddIds(c, P).includes("sdi-doctor"));
});
test("family care: one PFL claim from the first day to day 41, with the care forms", () => {
  const [c, P] = plan("family_care");
  const e = eddSteps(c, P);
  assert.deepEqual(e.claims.map((x) => x.kind), ["pfl"]);
  assert.deepEqual(e.claims[0].window, { from: "2027-02-01", to: "2027-03-14" });
  assert.match(e.claims[0].steps.find((s) => s.id === "pfl-docs").d, /DE 2501F/);
});
test("pregnancy with bonding: SDI first, then the PFL form EDD sends after", () => {
  const [c, P] = plan("pregnancy_bonding");
  const e = eddSteps(c, P);
  assert.deepEqual(e.claims.map((x) => x.kind), ["sdi", "pfl"]);
  assert.ok(e.claims[0].note, "pregnancy note");
  assert.ok(e.claims[1].steps.some((s) => /DE 2501FP/.test(s.d)));
  assert.ok(e.claims[1].window.from > e.claims[0].window.from);
});
test("short leaves have no EDD steps", () => {
  for (const r of ["bereavement", "repro", "sick"]) { const [c, P] = plan(r); assert.equal(eddSteps(c, P), null, r); assert.deepEqual(eddIds(c, P), []); }
});
test("step ids are unique within a leave", () => {
  for (const r of ["own_health", "family_care", "bonding", "pregnancy_bonding"]) { const [c, P] = plan(r); const ids = eddIds(c, P); assert.equal(new Set(ids).size, ids.length, r); }
});
test("guide copy follows the house style: no dashes, links go to edd.ca.gov", () => {
  const text = JSON.stringify([LEAVES, RIGHTS]) + JSON.stringify(eddSteps(...plan("pregnancy_bonding")));
  assert.ok(!/[–—]/.test(text), "no en or em dashes");
  for (const u of Object.values(EDD)) assert.match(u, /^https:\/\/(myedd\.)?edd\.ca\.gov(\/|$)/);
});
