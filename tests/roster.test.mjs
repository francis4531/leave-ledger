// Roster import (template, reader, row checks) and the manager's notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { templateCSV, parseTable, checkRows, COLUMNS } from "../public/roster.mjs";
import { managerNotice, sensitiveNote, nextWorkday } from "../public/notices.mjs";
import { sampleData, buildPlan, caseDates, REASONS } from "../public/engine.mjs";

const TODAY = "2026-11-01";
const existing = [{ id: "e1", name: "Dana Ortiz", email: "dana@co.example" }, { id: "e2", name: "Lee Park", email: "lee@co.example" }, { id: "e3", name: "Lee Park", email: "lee2@co.example" }];

test("the template reads back cleanly and passes its own checks", () => {
  const t = parseTable(templateCSV());
  assert.deepEqual(t.missing, []);
  assert.equal(t.header.length, COLUMNS.length);
  const rows = checkRows(t.rows, [], TODAY);
  assert.deepEqual(rows.map((r) => r.action), ["add", "add", "add"]);
  assert.equal(rows[1].data.mgr, "row:2", "manager found in the same file");
  assert.ok(rows[2].data.hoursEst, "blank hours are estimated");
});
test("reads quotes, commas, tabs, US dates and header aliases", () => {
  const t = parseTable('Full Name,Work Email,Start Date,Reports To\n"Rivera, Jamie",J@X.COM,5/20/2024,Dana Ortiz\n');
  assert.deepEqual(t.missing, []);
  const [r] = checkRows(t.rows, existing, TODAY);
  assert.equal(r.data.name, "Rivera, Jamie"); assert.equal(r.data.email, "j@x.com"); assert.equal(r.data.hire, "2024-05-20"); assert.equal(r.data.mgr, "e1");
  const tab = parseTable("name\temail\thire_date\nA B\ta@b.co\t2020-01-01\n");
  assert.equal(checkRows(tab.rows, [], TODAY)[0].action, "add");
});
test("missing columns are named", () => {
  assert.deepEqual(parseTable("name,email\nA,a@b.co\n").missing, ["hire_date"]);
});
test("bad rows are left out with a reason; matching email updates", () => {
  const rows = checkRows([
    { name: "", email: "x", hire_date: "2030-01-01" },
    { name: "Dana Ortiz", email: "DANA@co.example", hire_date: "2018-09-04" },
    { name: "Dup", email: "d@x.co", hire_date: "2020-02-30" },
    { name: "Dup2", email: "d@x.co", hire_date: "2020-02-03" },
    { name: "Ann", email: "ann@x.co", hire_date: "2020-01-01", manager_name: "Lee Park" },
    { name: "Bo", email: "bo@x.co", hire_date: "2020-01-01", manager_name: "Lee Park", manager_email: "lee2@co.example" },
    { name: "Cy", email: "cy@x.co", hire_date: "2020-01-01", weekly_hours: "99" },
  ], existing, TODAY);
  assert.equal(rows[0].action, "skip"); assert.equal(rows[0].errors.length, 3);
  assert.equal(rows[1].action, "update"); assert.equal(rows[1].match, "e1");
  assert.match(rows[2].errors.join(), /Hire date should look like/);
  assert.match(rows[3].errors.join(), /Same email/);
  assert.equal(rows[4].data.mgr, undefined); assert.match(rows[4].warnings.join(), /Two employees/);
  assert.equal(rows[5].data.mgr, "e3");
  assert.match(rows[6].errors.join(), /Weekly hours/);
});
test("the employee limit is kept", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ name: "N" + i, email: `n${i}@x.co`, hire_date: "2020-01-01" }));
  assert.equal(checkRows(many, existing, TODAY, 5).filter((r) => r.action === "add").length, 2);
});

test("the manager's notice never says why, for any kind of leave", () => {
  const D = sampleData(TODAY), co = D.company, emp = D.employees[0], mgr = D.employees[8];
  const words = /pregnan|baby|birth|bond|adopt|foster|surg|medical|illness|sick|death|died|funeral|bereave|miscarr|repro|cfra|fmla|pdl|sdi|pfl|edd|state pay|\$|parent|grandparent|spouse|child/i;
  for (const reason of Object.keys(REASONS).filter((r) => r !== "unknown")) {
    const c = { id: "x", empId: emp.id, reason, opts: { start: "2026-12-01", weeks: 4, disWeeks: 10, bondWeeks: 12, days: 3, hours: 8, relation: "parent" }, tasks: [] };
    const tmp = { ...D, cases: [c] }, d = caseDates(c, tmp);
    for (const kind of ["approved", "update"]) {
      const m = managerNotice(kind, { emp, mgr, co, start: d.start, end: d.end, protectedLeave: true, hr: "Grace Okafor" });
      const text = m.subject + "\n" + m.body.replace("health or family matters", "");
      assert.ok(!words.test(text), `${reason}/${kind} leaks: ${text.match(words)}`);
      assert.match(m.body, /Expected back/);
    }
  }
});
test("expected back skips weekends and holidays; notes that give the reason away are caught", () => {
  assert.equal(nextWorkday("2026-11-28", []), "2026-11-30");
  assert.equal(nextWorkday("2026-11-26", ["2026-11-26", "2026-11-27"]), "2026-11-30");
  for (const t of ["after her surgery", "baby is due", "funeral Friday", "on CFRA", "mental health", "looking after his mom", "Grandmother passed"]) assert.ok(sensitiveNote(t), t);
  for (const t of ["A temp starts Monday", "Please cover the Tuesday roasts", ""]) assert.equal(sensitiveNote(t), null, t);
});
