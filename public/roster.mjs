/* Leave Ledger roster import: the template, a forgiving CSV reader, and row checks.
   Shared by the browser (preview before import) and the server (which checks every row again). */

// Columns in the template, in order. Only name, email and hire_date are required.
// Any other file works too: columns are matched by heading, and HR picks the rest.
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
// Every field Leave Ledger can read from a file, with the headings HR and payroll exports commonly use.
export const FIELDS = [
  { key: "name", label: "Full name" }, { key: "first_name", label: "First name" }, { key: "last_name", label: "Last name" },
  { key: "email", label: "Work email", req: true }, { key: "hire_date", label: "Hire (joining) date", req: true },
  { key: "job_title", label: "Job title" }, { key: "manager_name", label: "Manager's name" }, { key: "manager_email", label: "Manager's email" },
  { key: "weekly_hours", label: "Hours a week" }, { key: "hours_per_day", label: "Hours a day" },
  { key: "hours_worked_last_12_months", label: "Hours worked, last 12 months" }, { key: "sick_hours_balance", label: "Sick hours balance" },
  { key: "highest_quarter_wages", label: "Highest quarter wages" },
];
const ALIASES = {
  name: ["name", "full_name", "employee", "employee_name", "employee_full_name", "legal_name", "worker", "worker_name", "display_name"],
  first_name: ["first_name", "legal_first_name", "given_name", "first", "fname", "employee_first_name"],
  last_name: ["last_name", "legal_last_name", "family_name", "surname", "last", "lname", "employee_last_name"],
  email: ["email", "work_email", "email_address", "work_email_address", "business_email", "work_contact_work_email", "company_email", "primary_work_email"],
  hire_date: ["hire_date", "joining_date", "start_date", "date_of_joining", "hired", "date_hired", "original_hire_date", "hire_date_original", "employment_start_date", "most_recent_hire_date", "seniority_date", "service_date"],
  job_title: ["job_title", "title", "role", "position", "position_title", "job", "job_name"],
  manager_name: ["manager_name", "manager", "reports_to", "reports_to_name", "supervisor", "supervisor_name", "direct_manager", "manager_full_name"],
  manager_email: ["manager_email", "reports_to_email", "supervisor_email", "manager_work_email"],
  weekly_hours: ["weekly_hours", "hours_per_week", "standard_hours", "scheduled_hours", "default_hours"],
  hours_per_day: ["hours_per_day", "shift_hours", "daily_hours"],
  hours_worked_last_12_months: ["hours_worked_last_12_months", "hours_last_12_months", "hours_12_months", "hours_worked"],
  sick_hours_balance: ["sick_hours_balance", "sick_hours", "sick_balance", "sick_leave_balance", "sick_time_balance", "paid_sick_leave_balance"],
  highest_quarter_wages: ["highest_quarter_wages", "high_quarter_wages"],
};
// Looser rules for headings no alias caught. Order matters.
const LOOSE = [
  ["manager_email", (h) => /(manager|supervisor|reports_to)/.test(h) && /email/.test(h)],
  ["email", (h) => /email/.test(h) && !/(personal|home|manager|supervisor|reports|emergency)/.test(h)],
  ["hire_date", (h) => /(hire|join|start).*date|date.*(hire|join)/.test(h) && !/(term|end|birth)/.test(h)],
  ["first_name", (h) => /first.*name|given/.test(h) && !/(manager|supervisor|preferred|emergency)/.test(h)],
  ["last_name", (h) => /last.*name|surname/.test(h) && !/(manager|supervisor|emergency)/.test(h)],
  ["manager_name", (h) => /(manager|supervisor|reports_to)/.test(h) && !/(email|id|number)/.test(h)],
  ["job_title", (h) => /(job|position).*title|^title$/.test(h)],
];
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const headerSig = (header) => header.map(norm).join("|");

// Matches file columns to fields. Returns { field: columnIndex }.
export function autoMap(header) {
  const map = {}, used = new Set(), H = header.map(norm);
  for (const [k, al] of Object.entries(ALIASES)) { const i = H.findIndex((h, j) => !used.has(j) && al.includes(h)); if (i >= 0) { map[k] = i; used.add(i); } }
  for (const [k, test] of LOOSE) { if (map[k] !== undefined) continue; const i = H.findIndex((h, j) => !used.has(j) && test(h)); if (i >= 0) { map[k] = i; used.add(i); } }
  if (map.name !== undefined && map.first_name !== undefined && map.last_name !== undefined) { delete map.first_name; delete map.last_name; }
  return map;
}
// What is still needed: an email, a hire date, and a name (full, or first and last).
export function missingFields(map) {
  const out = [];
  if (map.name === undefined && (map.first_name === undefined || map.last_name === undefined)) out.push("name");
  for (const f of FIELDS.filter((x) => x.req)) if (map[f.key] === undefined) out.push(f.key);
  return out;
}
export function applyMap(body, map) {
  const get = (r, k) => (map[k] !== undefined && map[k] !== null ? String(r[map[k]] ?? "").trim() : "");
  return body.map((r) => {
    const o = {};
    for (const f of FIELDS) if (!["name", "first_name", "last_name"].includes(f.key)) o[f.key] = get(r, f.key);
    o.name = get(r, "name") || [get(r, "first_name"), get(r, "last_name")].filter(Boolean).join(" ");
    return o;
  });
}
// What kind of data each column holds, without the values. This is all Clerk sees when matching columns.
export function columnProfile(header, body) {
  return header.map((h, i) => {
    const vals = body.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
    const share = (re) => vals.length ? vals.filter((v) => re.test(v)).length / vals.length : 0;
    const type = !vals.length ? "empty" : share(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) > 0.6 ? "email" : share(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[2-7]\d{4}(\.\d+)?)$/) > 0.6 ? "date" : share(/^[$]?[\d,]+(\.\d+)?$/) > 0.6 ? "number" : share(/^[A-Za-z' .-]+,\s*[A-Za-z' .-]+$/) > 0.6 ? "name, last first" : "text";
    return { i, heading: String(h).slice(0, 80), type, filled: vals.length && body.length ? Math.round((vals.length / body.length) * 100) : 0 };
  });
}

const EXAMPLES = [
  ["Jamie Rivera", "jamie.rivera@example.com", "Office manager", "2021-03-15", "", "", "40", "8", "2040", "40", "19500"],
  ["Sam Patel", "sam.patel@example.com", "Dental assistant", "2024-08-05", "Jamie Rivera", "", "32", "8", "1650", "24", "12800"],
  ["Lee Chen", "lee.chen@example.com", "Front desk, part time", "2026-01-12", "Jamie Rivera", "", "20", "5", "", "", ""],
];
const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
export const templateCSV = () => [COLUMNS.map((c) => c.label), ...EXAMPLES].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// Reads CSV, or tab-separated text pasted from a spreadsheet. Handles quotes and line breaks inside quotes.
export function parseGrid(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  // The separator is whichever of tab, semicolon or comma shows up most in the first lines.
  const head = text.split(/\r?\n/).slice(0, 10).join("\n"), count = (c) => head.split(c).length - 1;
  const sep = ["\t", ";", ","].reduce((b, c) => (count(c) > count(b) ? c : b), ",");
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
  return gridFromRows(rows);
}
// Some exports put a title or a blank line above the headings. Use the first row that looks like headings.
export function gridFromRows(rows) {
  const clean = rows.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c));
  let h = 0;
  for (let i = 0; i < Math.min(clean.length, 10); i++) { const m = autoMap(clean[i]); if (Object.keys(m).length >= 2) { h = i; break; } }
  return { header: clean[h] || [], body: clean.slice(h + 1) };
}
// One step: read, match columns automatically, and turn rows into fields.
export function parseTable(text) {
  const g = parseGrid(text), map = autoMap(g.header);
  return { header: g.header, rows: applyMap(g.body, map), missing: g.header.length ? missingFields(map) : ["name", "email", "hire_date"], map };
}

// "Rivera, Jamie" becomes "Jamie Rivera", as many payroll exports list names last name first.
const flipName = (n) => { n = String(n || "").trim().replace(/\s+/g, " "); const m = n.match(/^([^,]+),\s*([^,]+)$/); return m ? `${m[2]} ${m[1]}` : n; };
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
function toDate(s) {
  s = String(s || "").trim();
  if (/^[2-7]\d{4}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5).toISOString().slice(0, 10); // Excel date number
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
    data.name = flipName(r.name).slice(0, 80);
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
    data.mgrName = flipName(r.manager_name).slice(0, 80); data.mgrEmail = lower(r.manager_email).slice(0, 120);
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
