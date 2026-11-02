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
  assert.equal(r.data.name, "Jamie Rivera", "last name first is flipped"); assert.equal(r.data.email, "j@x.com"); assert.equal(r.data.hire, "2024-05-20"); assert.equal(r.data.mgr, "e1");
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

import { parseGrid, autoMap, missingFields, columnProfile, applyMap, headerSig } from "../public/roster.mjs";
import { readXlsx } from "../public/xlsx.mjs";
import { validateMap, runColumnMap } from "../netlify/lib/rostermap.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

test("common payroll export headings are matched without help", () => {
  const cases = {
    "First name,Last name,Work email,Personal email,Hire date,Manager": { first_name: 0, last_name: 1, email: 2, hire_date: 4, manager_name: 5 },
    "Legal First Name,Legal Last Name,Work Contact: Work Email,Hire Date,Reports To Name,Position Title": { first_name: 0, last_name: 1, email: 2, hire_date: 3, manager_name: 4, job_title: 5 },
    "Employee Name,Email Address,Original Hire Date,Supervisor,Job Title,Standard Hours": { name: 0, email: 1, hire_date: 2, manager_name: 3, job_title: 4, weekly_hours: 5 },
    "Full name,Work email,Start date,Manager email": { name: 0, email: 1, hire_date: 2, manager_email: 3 },
  };
  for (const [h, want] of Object.entries(cases)) { const m = autoMap(h.split(",")); assert.deepEqual(m, want, h); assert.deepEqual(missingFields(m), [], h); }
});
test("a title line above the headings is skipped; semicolons work; last-name-first names flip", () => {
  const g = parseGrid("Census report for Bayside\n\nName;Email;Hire date;Manager\n\"Rivera, Jamie\";j@x.co;45366;\n");
  assert.deepEqual(g.header, ["Name", "Email", "Hire date", "Manager"]);
  const [r] = checkRows(applyMap(g.body, autoMap(g.header)), [], TODAY);
  assert.equal(r.data.name, "Jamie Rivera");
  assert.equal(r.data.hire, "2024-03-15", "Excel date number");
});
test("Clerk only gets headings and data kinds, never values", () => {
  const g = parseGrid("Employee,Login,Began\nJamie Rivera,jamie@x.co,2021-03-15\n");
  const prof = columnProfile(g.header, g.body);
  assert.deepEqual(prof.map((c) => c.type), ["text", "email", "date"]);
  assert.ok(!JSON.stringify(prof).includes("Jamie") && !JSON.stringify(prof).includes("jamie@"));
});
test("Clerk's answer is checked: unknown fields, bad columns and reused columns are dropped", () => {
  const cols = [{}, {}, {}];
  assert.deepEqual(validateMap({ map: { name: 0, email: 0, hire_date: 2, evil: 1, job_title: 9 } }, cols).map, { name: 0, hire_date: 2 });
  assert.equal(validateMap("nope", cols), null);
});
test("Clerk matching is off without an AI key", async () => {
  assert.equal((await runColumnMap([{ heading: "x" }], {})).status, 503);
});
test("the same export gets the same signature, so its matches can be reused", () => {
  assert.equal(headerSig(["Hire Date", "Work Email"]), headerSig(["hire date", "work email"]));
});
test("reads an Excel file made by a spreadsheet program", { skip: (() => { try { execFileSync("python3", ["-c", "import openpyxl"]); return false; } catch { return "openpyxl not installed"; } })() }, async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "x-")), "t.xlsx");
  execFileSync("python3", ["-c", `import openpyxl,datetime
wb=openpyxl.Workbook();ws=wb.active;ws.title="Team"
ws.append(["Legal First Name","Legal Last Name","Work Email","Hire Date","Reports To"])
ws.append(["Jamie","Rivera","jamie@x.co",datetime.date(2021,3,15),None])
ws.append(["Sam","O'Brien & Co","sam@x.co",datetime.date(2024,8,5),"Rivera, Jamie"])
wb.create_sheet("Other").append(["ignore"])
wb.save(${JSON.stringify(f)})`]);
  const rows = await readXlsx(fs.readFileSync(f));
  const g = { header: rows[0], body: rows.slice(1) };
  const out = checkRows(applyMap(g.body, autoMap(g.header)), [], TODAY);
  assert.deepEqual(out.map((r) => [r.data.name, r.data.email, r.data.hire, r.action]), [["Jamie Rivera", "jamie@x.co", "2021-03-15", "add"], ["Sam O'Brien & Co", "sam@x.co", "2024-08-05", "add"]]);
  assert.equal(out[1].data.mgr, "row:2");
});
