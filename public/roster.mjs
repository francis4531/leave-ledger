/* Leave Ledger roster import: the template, a forgiving CSV reader, and row checks.
   Shared by the browser (preview before import) and the server (which checks every row again). */

// Columns in the template, in order. Only name, email and hire_date are required.
export const COLUMNS = [
  { key: "name", label: "name", req: true, help: "First and last name" },
  { key: "email", label: "email", req: true, help: "Work email. Used to match the employee on the next import" },
  { key: "job_title", label: "job_title", help: "Optional" },
  { key: "hire_date", label: "hire_date", req: true, help: "Joining date, as 2024-05-20 or 5/20/2024" },
  { key: "manager_name", label: "manager_name", help: "Must match another employee's name. Leave blank for none" },
  { key: "manager_email", label: "manager_email", help: "Optional. Use it when two employees share a name" },
  { key: "weekly_hours", label: "weekly_hours", help: "Usual hours a week. Blank means 40" },
  { key: "hours_per_day", label: "hours_per_day", help: "Usual shift length. Blank means 8" },
  { key: "hours_worked_last_12_months", label: "hours_worked_last_12_months", help: "From payroll. Blank means we estimate it from weekly hours" },
  { key: "sick_hours_balance", label: "sick_hours_balance", help: "Optional. From payroll" },
  { key: "highest_quarter_wages", label: "highest_quarter_wages", help: "Optional. Used to estimate state pay" },
];
const ALIASES = {
  name: ["name", "full_name", "employee", "employee_name"], email: ["email", "work_email", "email_address"], job_title: ["job_title", "title", "role", "position"],
  hire_date: ["hire_date", "joining_date", "start_date", "date_of_joining", "hired"], manager_name: ["manager_name", "manager", "reports_to"], manager_email: ["manager_email"],
  weekly_hours: ["weekly_hours", "hours_per_week"], hours_per_day: ["hours_per_day", "shift_hours"], hours_worked_last_12_months: ["hours_worked_last_12_months", "hours_last_12_months", "hours_12_months"],
  sick_hours_balance: ["sick_hours_balance", "sick_hours", "sick_balance"], highest_quarter_wages: ["highest_quarter_wages", "high_quarter_wages"],
};

const EXAMPLES = [
  ["Jamie Rivera", "jamie.rivera@example.com", "Office manager", "2021-03-15", "", "", "40", "8", "2040", "40", "19500"],
  ["Sam Patel", "sam.patel@example.com", "Dental assistant", "2024-08-05", "Jamie Rivera", "", "32", "8", "1650", "24", "12800"],
  ["Lee Chen", "lee.chen@example.com", "Front desk, part time", "2026-01-12", "Jamie Rivera", "", "20", "5", "", "", ""],
];
const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
export const templateCSV = () => [COLUMNS.map((c) => c.label), ...EXAMPLES].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// Reads CSV, or tab-separated text pasted from a spreadsheet. Handles quotes and line breaks inside quotes.
export function parseTable(text) {
  text = String(text || "").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === "") q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  if (!clean.length) return { header: [], rows: [], missing: COLUMNS.filter((c) => c.req).map((c) => c.label) };
  const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const map = {};
  clean[0].forEach((h, i) => { const n = norm(h); for (const [k, al] of Object.entries(ALIASES)) if (al.includes(n) && map[k] === undefined) map[k] = i; });
  const missing = COLUMNS.filter((c) => c.req && map[c.key] === undefined).map((c) => c.label);
  const out = clean.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[i] ?? ""])));
  return { header: clean[0], rows: out, missing };
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
function toDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
  if (m) [, y, mo, d] = m; else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) { [, mo, d, y] = m; if (y.length === 2) y = (+y > 50 ? "19" : "20") + y; } else return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(iso + "T00:00:00Z");
  return isNaN(t) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}
const num = (v, lo, hi) => { const s = String(v ?? "").replace(/[$,\s]/g, ""); if (s === "") return null; const n = +s; return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN; };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// Checks every row against the employees already in Leave Ledger.
// Returns rows with { action: "add" | "update" | "skip", data, errors, warnings, match }.
export function checkRows(rows, existing, today, limit = 250) {
  const lower = (s) => String(s || "").trim().toLowerCase();
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [lower(e.email), e]));
  const seen = new Set();
  const out = rows.slice(0, 1000).map((r, i) => {
    const errors = [], warnings = [], data = {};
    data.name = String(r.name || "").trim().slice(0, 80);
    if (!data.name) errors.push("Name is missing");
    data.email = lower(r.email).slice(0, 120);
    if (!data.email) errors.push("Email is missing"); else if (!EMAIL_RE.test(data.email)) errors.push("Email does not look right");
    else if (seen.has(data.email)) errors.push("Same email as an earlier row"); else seen.add(data.email);
    data.hire = toDate(r.hire_date);
    if (!r.hire_date) errors.push("Hire date is missing"); else if (!data.hire) errors.push("Hire date should look like 2024-05-20 or 5/20/2024"); else if (data.hire > today) errors.push("Hire date is in the future");
    data.role = String(r.job_title || "").trim().slice(0, 80);
    const wk = num(r.weekly_hours, 1, 80), day = num(r.hours_per_day, 1, 24), h12 = num(r.hours_worked_last_12_months, 0, 4000), sick = num(r.sick_hours_balance, 0, 400), hq = num(r.highest_quarter_wages, 0, 1e6);
    if (Number.isNaN(wk)) errors.push("Weekly hours should be 1 to 80"); else data.weeklyHours = wk;
    if (Number.isNaN(day)) errors.push("Hours per day should be 1 to 24"); else data.shiftHours = day;
    if (Number.isNaN(h12)) errors.push("Hours worked should be 0 to 4,000"); else data.hours12 = h12;
    if (Number.isNaN(sick)) errors.push("Sick hours should be 0 to 400"); else data.sick = sick;
    if (Number.isNaN(hq)) errors.push("Highest quarter wages should be a dollar amount"); else data.hiQuarter = hq;
    if (data.hours12 == null && data.hire && data.hire <= today) {
      const weeks = Math.min(52, Math.max(0, daysBetween(data.hire, today) / 7));
      data.hours12 = Math.round(weeks * (data.weeklyHours || 40)); data.hoursEst = true;
      warnings.push(`Hours worked estimated at ${data.hours12.toLocaleString()} from weekly hours. Check it, because it decides family leave eligibility`);
    }
    data.mgrName = String(r.manager_name || "").trim().slice(0, 80); data.mgrEmail = lower(r.manager_email).slice(0, 120);
    const match = data.email ? byEmail.get(data.email) : null;
    return { line: i + 2, action: errors.length ? "skip" : match ? "update" : "add", data, errors, warnings, match: match ? match.id : null };
  });
  // Managers can be anyone already in Leave Ledger or anyone in this file.
  const pool = [...existing.map((e) => ({ id: e.id, name: e.name, email: lower(e.email) })),
    ...out.filter((r) => r.action === "add").map((r) => ({ id: "row:" + r.line, name: r.data.name, email: r.data.email }))];
  for (const r of out) {
    if (r.action === "skip" || (!r.data.mgrName && !r.data.mgrEmail)) { r.data.mgr = r.data.mgrName || r.data.mgrEmail ? undefined : null; continue; }
    let found = r.data.mgrEmail ? pool.filter((p) => p.email === r.data.mgrEmail) : pool.filter((p) => lower(p.name) === lower(r.data.mgrName));
    if (r.data.mgrEmail && !found.length && r.data.mgrName) found = pool.filter((p) => lower(p.name) === lower(r.data.mgrName));
    const self = r.match || "row:" + r.line;
    found = found.filter((p) => p.id !== self && p.email !== r.data.email);
    if (found.length === 1) r.data.mgr = found[0].id;
    else if (found.length > 1) { r.data.mgr = undefined; r.warnings.push(`Two employees are named ${r.data.mgrName}. Add manager_email to pick one. Manager left as is`); }
    else { r.data.mgr = undefined; r.warnings.push(`Manager "${r.data.mgrName || r.data.mgrEmail}" is not in Leave Ledger or this file. Manager left as is`); }
  }
  const adds = out.filter((r) => r.action === "add");
  if (existing.length + adds.length > limit) {
    let room = Math.max(0, limit - existing.length);
    for (const r of adds) { if (room > 0) { room--; continue; } r.action = "skip"; r.errors.push(`Leave Ledger holds up to ${limit} employees`); }
  }
  return out;
}

export const HR_SYSTEMS = ["Gusto", "Rippling", "ADP", "Paychex", "Paylocity", "BambooHR", "Justworks", "QuickBooks Payroll", "Workday", "Other", "None, we use spreadsheets"];
