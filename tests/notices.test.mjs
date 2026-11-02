// The letters HR sends: right facts in, private details out.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as E from "../public/engine.mjs";
import { draftLetter, hasLetter, LETTERS } from "../public/notices.mjs";

const TODAY = "2026-11-01";
const D = E.sampleData(TODAY);
const caseOf = (id) => D.cases.find((c) => c.id === id);
const letter = (id, key, tweak) => {
  const c = structuredClone(caseOf(id)); if (tweak) tweak(c);
  const e = D.employees.find((x) => x.id === c.empId);
  return draftLetter(key, c, e, D.company, E.planFor(c, D), TODAY, "Grace Okafor");
};

describe("letters", () => {
  test("every legal letter task in the sample company has a draft", () => {
    for (const c of D.cases) for (const t of c.tasks) {
      if (!hasLetter(c, t.key)) continue;
      const L = letter(c.id, t.key);
      assert.ok(L && L.subject && L.body.length > 200, `${c.id} ${t.key}`);
      assert.ok(L.body.includes("Grace Okafor") && L.body.includes(D.company.name), "signed by HR for the company");
    }
  });
  test("eligibility notice states what the employee qualifies for, with the right balance", () => {
    const L = letter("c3", "notice"); // Jordan: own health, 4 CFRA weeks used
    assert.match(L.body, /You qualify for this leave/);
    assert.match(L.body, /you have 8 weeks available/);
    assert.match(L.body, /certification form and return it to me by Oct 27, 2026/);
    assert.match(L.body, /State Disability Insurance/);
    assert.ok(!/Paid Family Leave/.test(L.body), "own health is not PFL");
  });
  test("a notice to someone who does not qualify says why", () => {
    const L = letter("c5", "notice"); // Sofia: under 12 months and 1,250 hours
    assert.match(L.body, /You do not qualify yet/);
    assert.match(L.body, /12 months of service/);
    assert.match(L.body, /1,250 hours/);
  });
  test("pregnancy notice covers PDL with hours from the schedule, then CFRA bonding", () => {
    const L = letter("c1", "notice");
    assert.match(L.body, /Pregnancy Disability Leave \(PDL\)\. You qualify/);
    assert.match(L.body, /693\.2 hours/);
    assert.match(L.body, /to bond with your new child/);
    assert.match(L.body, /DE 2515 and DE 2511/);
  });
  test("FMLA appears at 50+ employees, and the 75-mile test is explained when it fails", () => {
    const L = letter("c3", "notice", () => {});
    assert.ok(!/FMLA/.test(L.body), "38 employees: no FMLA");
    const co = { ...D.company, headcount: 60, within75: false };
    const c = caseOf("c3"), e = D.employees.find((x) => x.id === c.empId);
    const L2 = draftLetter("notice", c, e, co, E.buildPlan(e, co, c.reason, c.opts), TODAY, "Grace");
    assert.match(L2.body, /You do not qualify for federal FMLA leave/);
    assert.match(L2.body, /75 miles/);
  });
  test("designation notice gives the protected dates and the return date", () => {
    const L = letter("c1", "designate");
    assert.match(L.body, /Pregnancy Disability Leave: Oct 27, 2026 to Jan 4, 2027/);
    assert.match(L.body, /California Family Rights Act leave: Jan 5, 2027 to Mar 29, 2027/);
    assert.match(L.body, /expected return date is Mar 30, 2027/);
  });
  test("bereavement and reproductive loss letters follow their own rules", () => {
    const B = letter("c4", "confirm");
    assert.match(B.body, /Nov 2, 2026 to Nov 6, 2026 \(5 workdays\)/);
    assert.match(B.body, /documentation of the death/);
    const R = letter("c4", "confirm", (c) => { c.reason = "repro"; });
    assert.match(R.body, /do not need to give us any documentation/);
    assert.ok(!/documentation of the death/.test(R.body));
  });
  test("letters never include a manager's note or HR's private notes", () => {
    const L = letter("c3", "notice", (c) => { c.notes = "SECRET manager note"; c.hrNote = "SECRET hr note"; });
    assert.ok(!/SECRET/.test(L.body));
  });
  test("only tasks with a letter get one", () => {
    const c = caseOf("c2");
    assert.equal(hasLetter(c, "brochure"), false);
    assert.equal(hasLetter(c, "confirm"), false);
    assert.equal(hasLetter(c, "notice"), true);
    assert.ok(Object.keys(LETTERS).length >= 5);
  });
  test("no em or en dashes in any letter", () => {
    for (const c of D.cases) for (const t of c.tasks) {
      const L = hasLetter(c, t.key) && letter(c.id, t.key);
      if (L) assert.ok(!/[–—]/.test(L.subject + L.body), `${c.id} ${t.key}`);
    }
  });
});
