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

// Found by role-playing testers in November 2026. Each test pins one fix.
describe("letters, tasks and dates follow eligibility", () => {
  const sofia = () => D.employees.find((e) => e.id === "e3");
  test("a notice to someone who does not qualify never promises the job or health coverage", () => {
    const L = letter("c5", "notice");
    assert.match(L.body, /You do not qualify yet/);
    assert.doesNotMatch(L.body, /same job or a comparable one/);
    assert.doesNotMatch(L.body, /group health coverage continues/);
    assert.doesNotMatch(L.body, /Medical certification/, "no certification is asked for when no protected leave applies");
    assert.match(L.body, /not protected by state or federal leave law/);
    assert.doesNotMatch(L.body, /enclosed/, "no forms are promised that the app does not provide");
  });
  test("someone who qualifies still gets the rights paragraph", () => {
    assert.match(letter("c3", "notice").body, /same job or a comparable one/);
  });
  test("family care asks for the family member's doctor, not the employee's", () => {
    const L = letter("c3", "notice", (c) => { c.reason = "family_care"; c.opts.relation = "parent"; });
    assert.match(L.body, /ask your parent's health care provider/);
    assert.doesNotMatch(L.body, /ask your health care provider/);
  });
  test("the HR steps leave out designation and health coverage when no protected leave applies", () => {
    const P = E.buildPlan(sofia(), D.company, "family_care", { start: "2026-12-07", weeks: 4, relation: "parent" });
    const keys = E.makeTasks("family_care", TODAY, P, D.company).map((t) => t.key);
    assert.ok(keys.includes("notice") && keys.includes("brochure"));
    for (const k of ["cert", "designate", "benefits"]) assert.ok(!keys.includes(k), k);
  });
  test("below 5 employees: no BY LAW leave steps, and the right reason for bereavement", () => {
    const co = { ...D.company, headcount: 3 }, e = D.employees.find((x) => x.id === "e1");
    const P = E.buildPlan(e, co, "pregnancy_bonding", { start: "2026-12-07", disWeeks: 6, bondWeeks: 8 });
    const T = E.makeTasks("pregnancy_bonding", TODAY, P, co);
    assert.equal(T.find((t) => t.key === "notice").legal, false);
    assert.ok(!T.some((t) => ["designate", "benefits", "cert"].includes(t.key)));
    assert.ok(!P.facts.some((f) => /7 months of job protection|Keep group health/.test(f.t)));
    const B = E.buildPlan(e, co, "bereavement", { start: "2026-12-07", days: 5, relation: "parent" });
    assert.ok(B.warnings.some((w) => /fewer than 5 employees/.test(w.t)));
    assert.ok(!B.warnings.some((w) => /under 30 days/.test(w.t)), "a 3-year employee is not told they are too new");
  });
  test("the return date is the next workday, the same in the plan and every letter", () => {
    // 6 weeks from Dec 7 ends Jan 18, a company holiday, so the first day back is Tuesday Jan 19.
    const e = D.employees.find((x) => x.id === "e1");
    const P = E.buildPlan(e, D.company, "family_care", { start: "2026-12-07", weeks: 6, relation: "parent" });
    assert.equal(P.end, "2027-01-18"); assert.equal(P.back, "2027-01-19");
    const c = { ...structuredClone(caseOf("c3")), empId: "e1", reason: "family_care", opts: { start: "2026-12-07", weeks: 6, relation: "parent" } };
    c.tasks = E.makeTasks("family_care", TODAY, P, D.company);
    for (const k of ["designate", "return"]) assert.match(draftLetter(k, c, e, D.company, P, TODAY, "Grace").body, /Jan 19, 2027/, k);
  });
  test("pregnancy disability longer than 4 months is called out, with what it means for pay", () => {
    const e = D.employees.find((x) => x.id === "e1");
    const P = E.buildPlan(e, D.company, "pregnancy_bonding", { start: "2026-12-07", disWeeks: 20, bondWeeks: 12 });
    const w = P.warnings.find((x) => /past 4 months of PDL/.test(x.t));
    assert.ok(w && w.bad); assert.match(w.t, /SDI keeps paying instead/);
  });
  test("the note to a manager catches pregnancy, surgery and grief wording, and lets ordinary notes through", async () => {
    const { sensitiveNote } = await import("../public/notices.mjs");
    for (const t of ["She is expecting in February", "newborn arrives in Feb", "recovers from the C-section", "OB appointments and labor", "She is due Feb 10", "post-op recovery", "Recovering from an operation", "grieving", "under a lot of stress"]) assert.ok(sensitiveNote(t), t);
    for (const t of ["A temp starts Monday", "Please keep the delivery route covered", "Due back on Monday", "Sofia covers the register on weekends"]) assert.equal(sensitiveNote(t), null, t);
  });
});
