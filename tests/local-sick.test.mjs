// City paid sick leave: the employee gets the more generous of the state and the city rule, for each limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sickUseCap, sickBalanceCap, sickUsable, LOCAL_SICK, buildPlan } from "../public/engine.mjs";

const emp = { id: "x", name: "A B", hire: "2020-01-01", hours12: 2000, sick: 70, sickUsedYr: 45, shiftHours: 8, weeklyHours: 40, cfraUsed: 0, fmlaUsed: 0, reproUsed: 0, hiQuarter: 15000 };
const co = (sickCity, headcount = 20) => ({ name: "Co", headcount, within75: true, holidays: [], sickCity, wbaMax: 1765, wbaMin: 50, band90: 16279.9, band70: 20931.3 });

test("state only: 40 hours or 5 shifts a year, balance up to 80 or 10 shifts", () => {
  assert.equal(sickUseCap(emp, co("")), 40); assert.equal(sickBalanceCap(emp, co("")), 80);
  assert.equal(sickUsable(emp, co("")), 0, "45 used of 40");
});
test("San Francisco and Oakland: no yearly use limit; the state's 80-hour balance stays because it is higher", () => {
  for (const c of ["sf", "oakland"]) { assert.equal(sickUseCap(emp, co(c)), Infinity); assert.equal(sickUsable(emp, co(c)), 70); assert.equal(sickBalanceCap(emp, co(c)), 80); }
});
test("size tiers: Berkeley under 25 limits use to 48; 25 or more has no limit", () => {
  assert.equal(sickUseCap(emp, co("berkeley", 20)), 48); assert.equal(sickUseCap(emp, co("berkeley", 30)), Infinity);
  assert.equal(sickUsable(emp, co("berkeley", 20)), 3);
});
test("Los Angeles allows 48 a year; San Diego keeps the state 40", () => {
  assert.equal(sickUseCap(emp, co("la")), 48); assert.equal(sickUseCap(emp, co("sandiego")), 40);
  assert.equal(sickUseCap({ ...emp, shiftHours: 10 }, co("la")), 50, "5 ten-hour shifts beat the city's 48");
});
test("every city has a name, a law and numbers; a sick plan names the city rule", () => {
  for (const [k, L] of Object.entries(LOCAL_SICK)) { assert.ok(L.name && L.law, k); assert.ok(L.bal(5) >= 40 && L.bal(100) >= 40, k); }
  const P = buildPlan(emp, co("oakland"), "sick", { start: "2026-12-01", hours: 8 });
  assert.ok(P.facts.some((f) => /Oakland rules apply/.test(f.t)));
});
