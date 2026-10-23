import {
  addDays, diffDays, fmt, fmtS, money, esc, plural, RULES, REASONS, REL, relName,
  weeklyBenefit, eligibility, buildPlan, planFor as planForD, caseDates as caseDatesD, caseStatus as caseStatusD,
} from "./engine.mjs";

/* ---------- State ---------- */
let S = null;          // {me, today, data}
let TODAY = "";
const UI = {
  view: null, tab: "overview", caseId: null,
  planner: { empId: "e1", reason: "pregnancy_bonding", relation: "parent", start: "", weeks: 6, disWeeks: 10, bondWeeks: 12, days: 5, hours: 8 },
  req: { reason: "own_health", relation: "parent", start: "", weeks: 4, disWeeks: 10, bondWeeks: 12, days: 3, hours: 8 },
  flag: { empId: "", heard: "", note: "" },
  login: { email: "", password: "", error: "" },
};
try { const r = JSON.parse(localStorage.getItem("ll-ui") || "{}"); if (r.tab) UI.tab = r.tab; if (r.view) UI.view = r.view; } catch (e) {}
const saveUI = () => { try { localStorage.setItem("ll-ui", JSON.stringify({ tab: UI.tab, view: UI.view })); } catch (e) {} };

const D = () => S.data;
const emp = (id) => D().employees.find((e) => e.id === id) || (D().team || []).find((e) => e.id === id);
const planFor = (c) => planForD(c, D());
const caseDates = (c) => caseDatesD(c, D());
const caseStatus = (c) => caseStatusD(c, D(), TODAY);

/* ---------- API ---------- */
async function api(path, body) {
  const r = await fetch("/api/" + path, body === undefined ? { credentials: "same-origin" } : {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: "The server did not answer. Try again." }));
  if (r.status === 401 && path !== "login") { S = null; renderLogin(); throw new Error("signed out"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}
function accept(j) {
  S = { me: j.me, today: j.today, data: j.data }; TODAY = j.today;
  if (!UI.view || !S.me.views.includes(UI.view)) UI.view = S.me.views[0];
  if (!UI.planner.start) UI.planner.start = addDays(TODAY, 14);
  if (!UI.req.start) UI.req.start = addDays(TODAY, 14);
  if (!UI.flag.heard) UI.flag.heard = TODAY;
  if (S.me.role === "hr" && !D().employees.some((e) => e.id === UI.planner.empId)) UI.planner.empId = D().employees[0].id;
}
async function act(a, okMsg) {
  try { const j = await api("action", a); accept(j); render(); if (okMsg) toast(okMsg); return j; }
  catch (e) { if (e.message !== "signed out") toast(e.message); return null; }
}

/* ---------- Helpers ---------- */
const pill = (t, cls = "") => `<span class="pill ${cls}">${esc(t)}</span>`;
function dueState(t) {
  if (t.done) return { t: `Done ${fmtS(t.doneOn)}`, cls: "ok" };
  if (!t.due) return { t: "Waiting on certification", cls: "" };
  const d = diffDays(TODAY, t.due);
  if (d < 0) return { t: `${-d} day${d === -1 ? "" : "s"} overdue`, cls: "bad" };
  if (d === 0) return { t: "Due today", cls: "bad" };
  if (d <= 3) return { t: `Due ${fmtS(t.due)}`, cls: "warn" };
  return { t: `Due ${fmtS(t.due)}`, cls: "" };
}
function openTasks() {
  const out = [];
  D().cases.forEach((c) => c.tasks.forEach((t) => { if (!t.done && !t.optional) out.push({ c, t }); }));
  return out.sort((a, b) => ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : 1));
}
const overdueCount = () => openTasks().filter((x) => x.t.due && x.t.due <= TODAY).length;
function checksHTML(list) { return `<div class="checks">${list.map((c) => `<div class="chk ${c.ok ? "y" : "n"}"><i aria-hidden="true">${c.ok ? "✓" : "✕"}</i><span>${esc(c.t)}</span></div>`).join("")}</div>`; }
const COLORS = { pdl: "var(--pdl)", cfra: "var(--cfra)", fmla: "var(--fmla)", short: "var(--short)", sdi: "var(--sdi)", pfl: "var(--pfl)", sick: "var(--sdi)", unpaid: "var(--unpaid)", wait: "var(--unpaid)", none: "var(--bad)" };

function timelineHTML(p) {
  if (!p.segs.length) return "";
  const s0 = p.segs.reduce((m, x) => (x.start < m ? x.start : m), p.segs[0].start);
  const e0 = p.segs.reduce((m, x) => (x.end > m ? x.end : m), p.segs[0].end);
  const span = Math.max(7, diffDays(s0, e0));
  const pos = (d) => Math.max(0, Math.min(100, (diffDays(s0, d) / span) * 100));
  const lanes = [["protect", "Job protection"], ["concurrent", "Runs alongside"], ["pay", "Pay"]].filter(([k]) => p.segs.some((s) => s.lane === k));
  const ticks = []; const n = span > 60 ? 5 : 3;
  for (let i = 0; i <= n; i++) ticks.push(addDays(s0, Math.round((span * i) / n)));
  const todayIn = TODAY >= s0 && TODAY <= e0;
  return `<div class="tl" role="img" aria-label="Leave timeline">
    <div class="tl-axis">${ticks.map((d, i) => `<span style="left:${i === n ? "auto" : pos(d) + "%"};${i === n ? "right:0;transform:none" : ""}">${fmtS(d)}</span>`).join("")}</div>
    ${lanes.map(([k, name]) => `<div class="lane"><div class="ln">${name}</div><div class="track">
      ${p.segs.filter((s) => s.lane === k).map((s) => `<div class="sg ${s.cls}" style="left:${pos(s.start)}%;width:${pos(s.end) - pos(s.start)}%" title="${esc(s.label)} · ${fmtS(s.start)} to ${fmtS(addDays(s.end, -1))}">${esc(s.label)}</div>`).join("")}
      ${todayIn ? `<div class="today-line" style="left:${pos(TODAY)}%" title="Today"></div>` : ""}
    </div></div>`).join("")}
  </div>
  <div class="seglist">${p.segs.map((s) => `<div><span class="sw" style="background:${COLORS[s.cls]}"></span><span><b>${esc(s.label)}</b> <span class="muted small">${esc(s.sub || "")}</span></span><span class="mono small">${fmtS(s.start)} to ${fmtS(addDays(s.end, -1))}</span></div>`).join("")}</div>`;
}
function factsHTML(p) {
  return `${p.warnings.map((w) => `<div class="warnbox ${w.bad ? "bad" : ""}">${esc(w.t)}</div>`).join("")}
  ${p.facts.length ? `<div class="notes">${p.facts.map((f) => `<div class="note"><span>${esc(f.t)}</span><span class="cite">${esc(f.c)}</span></div>`).join("")}</div>` : ""}`;
}
function payHTML(p) {
  if (!(p.pays.sdi || p.pays.pfl)) return "";
  const w = p.wba;
  return `<div class="infobox">${w ? `Estimated weekly benefit <b class="mono">${money(w.amount)}</b>: ${Math.round(w.rate * 100)}% of ${money(w.weekly)} average weekly wages in the highest base-period quarter${w.capped ? ", capped at the 2026 maximum" : ""}. EDD makes the final calculation.` : "EDD calculates the benefit from base-period wages."} ${p.pays.sdi ? `SDI claim due within ${RULES.sdi.fileWithin} days of the first day out. ` : ""}${p.pays.pfl ? `PFL claim due within ${RULES.pfl.fileWithin} days of the first day of leave.` : ""}</div>`;
}
function eligHTML(p, reason) {
  const el = p.el, blocks = [];
  if (reason === "pregnancy_bonding") blocks.push(["PDL", el.pdl]);
  if (["pregnancy_bonding", "own_health", "family_care", "bonding"].includes(reason)) { blocks.push(["CFRA", el.cfra]); blocks.push(["FMLA", el.fmla]); }
  if (["bereavement", "repro"].includes(reason)) blocks.push([reason === "repro" ? "Reproductive loss" : "Bereavement", el.short]);
  if (reason === "sick") blocks.push(["Paid sick leave", el.sick]);
  return `<div class="elig">${blocks.map(([n, b]) => `<div><div class="panel-h"><h3>${n}</h3>${b.ok ? pill("Eligible", "ok") : pill(n === "FMLA" && !b.covered ? "Not covered" : "Not eligible", n === "FMLA" && !b.covered ? "" : "bad")}</div>${checksHTML(b.checks)}${b.remaining !== undefined && b.ok ? `<div class="small muted">${plural(b.remaining, "week")} left in the 12-month period</div>` : ""}</div>`).join("")}</div>`;
}
function relSelect(id, kind, val) {
  return `<div class="field"><label for="${id}">Family member</label><select id="${id}" data-bind="relation">${REL[kind].map(([k, n]) => `<option value="${k}" ${k === val ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
}
function lengthFields(prefix, f) {
  const u = REASONS[f.reason].unit;
  if (u === "two") return `<div class="row"><div class="field"><label for="${prefix}dis">Disability weeks</label><input id="${prefix}dis" type="number" min="1" max="30" step="1" value="${f.disWeeks}" data-bind="disWeeks" data-num><span class="hint">Before and after birth, per the provider</span></div><div class="field"><label for="${prefix}bond">Bonding weeks</label><input id="${prefix}bond" type="number" min="0" max="12" step="1" value="${f.bondWeeks}" data-bind="bondWeeks" data-num></div></div>`;
  if (u === "weeks") return `<div class="field"><label for="${prefix}wk">Length in weeks</label><input id="${prefix}wk" type="number" min="1" max="52" step="1" value="${f.weeks}" data-bind="weeks" data-num></div>`;
  if (u === "days") return `<div class="field"><label for="${prefix}dy">Workdays</label><input id="${prefix}dy" type="number" min="1" max="20" step="1" value="${f.days}" data-bind="days" data-num></div>`;
  if (u === "hours") return `<div class="field"><label for="${prefix}hr">Hours</label><input id="${prefix}hr" type="number" min="1" max="80" step="1" value="${f.hours}" data-bind="hours" data-num></div>`;
  return "";
}
const optsFrom = (f) => ({ start: f.start, weeks: +f.weeks, disWeeks: +f.disWeeks, bondWeeks: +f.bondWeeks, days: +f.days, hours: +f.hours, relation: f.relation });

function lawsHTML() {
  const co = D().company, c5 = co.headcount >= 5, c50 = co.headcount >= 50 && co.within75;
  const L = [
    ["CFRA", c5, c5 ? "12 weeks, job protected" : "Needs 5+ employees", "var(--cfra)"],
    ["PDL", c5, c5 ? "Up to 4 months" : "Needs 5+ employees", "var(--pdl)"],
    ["FMLA", c50, c50 ? "Runs with CFRA or PDL" : "Under 50 employees", "var(--fmla)"],
    ["SDI and PFL", true, "State pays, not you", "var(--sdi)"],
    ["Paid sick leave", true, "40 hours a year", "var(--sdi)"],
    ["Bereavement", c5, c5 ? "5 days per death" : "Needs 5+ employees", "var(--short)"],
    ["Reproductive loss", c5, c5 ? "5 days, 20 a year" : "Needs 5+ employees", "var(--short)"],
  ];
  return `<div class="laws">${L.map(([n, on, why, col]) => `<div class="law ${on ? "" : "off"}"><span class="nm"><span class="dot" style="background:${on ? col : "var(--line)"}"></span>${n}</span><span class="why">${on ? "" : "Does not apply · "}${why}</span></div>`).join("")}</div>`;
}

/* ---------- HR ---------- */
function queueHTML(items, showEmp = true) {
  if (!items.length) return `<p class="muted">Nothing open. New requests add their deadlines here.</p>`;
  return `<div class="queue">${items.map(({ c, t }) => { const s = dueState(t); return `<div class="qrow ${t.done ? "done" : ""}">
    <input type="checkbox" id="t-${c.id}-${t.key}" data-task="${c.id}|${t.key}" ${t.done ? "checked" : ""} ${!t.due && !t.done ? "disabled" : ""} aria-label="Mark done: ${esc(t.label)}">
    <div><div class="t">${esc(t.label)}${t.legal ? '<span class="req">Required</span>' : ""}</div>
    <div class="s">${showEmp ? `<button class="linkish" data-open="${c.id}">${esc(emp(c.empId).name)}</button> · ${esc(REASONS[c.reason].hr)} · ` : ""}${esc(t.hint || "")}</div></div>
    ${pill(s.t, s.cls)}</div>`; }).join("")}</div>`;
}
function hrOverview() {
  const open = openTasks(); const od = open.filter((x) => x.t.due && x.t.due <= TODAY).length;
  const active = D().cases.filter((c) => caseStatus(c).t !== "Returned");
  const out = D().cases.filter((c) => caseStatus(c).t === "On leave");
  const ret30 = D().cases.filter((c) => { const d = caseDates(c); return d.end && d.end > TODAY && diffDays(TODAY, d.end) <= 30; });
  const log = (D().log || []).slice(0, 8);
  return `<div class="head"><div><h2>Today at ${esc(D().company.name)}</h2><p>${fmt(TODAY)} · ${D().company.headcount} employees in California</p></div><div class="btns"><button class="btn primary" data-tab="plan">Plan a leave</button></div></div>
  ${lawsHTML()}
  <div class="stats">
    <div class="stat ${od ? "alert" : ""}"><div class="label">Overdue or due today</div><div class="n">${od}</div></div>
    <div class="stat"><div class="label">Open deadlines</div><div class="n">${open.filter((x) => x.t.due).length}</div></div>
    <div class="stat"><div class="label">Out today</div><div class="n">${out.length}</div></div>
    <div class="stat"><div class="label">Returning in 30 days</div><div class="n">${ret30.length}</div></div>
  </div>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h3>Compliance deadlines</h3><span class="small muted">Business days skip weekends and company holidays</span></div>${queueHTML(open)}</section>
    <div class="stack">
    <section class="panel"><div class="panel-h"><h3>Active leaves</h3><span class="small muted">${active.length}</span></div>
      <div class="queue">${active.map((c) => { const d = caseDates(c), s = caseStatus(c); return `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div><button class="linkish" data-open="${c.id}">${esc(emp(c.empId).name)}</button><div class="s">${esc(REASONS[c.reason].hr)} · <span class="mono">${fmtS(d.start)}${d.end ? " to " + fmtS(addDays(d.end, -1)) : ""}</span></div></div>${pill(s.t, s.cls)}</div>`; }).join("") || '<p class="muted">No active leaves.</p>'}</div>
    </section>
    <section class="panel"><h3>Recent activity</h3><div class="queue">${log.map((l) => `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t" style="font-weight:500">${esc(l.text)}</div><div class="s">${esc(l.by)}</div></div><span class="mono small muted">${new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</span></div>`).join("") || '<p class="muted">Nothing yet.</p>'}</div></section>
    </div>
  </div>`;
}
function hrCases() {
  if (UI.caseId) return hrCase(D().cases.find((c) => c.id === UI.caseId));
  return `<div class="head"><div><h2>Leave cases</h2><p>Every request, who raised it, and where it stands.</p></div></div>
  <section class="panel"><div class="tw"><table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th><th>Deadlines</th><th>From</th></tr></thead><tbody>
  ${D().cases.map((c) => { const d = caseDates(c), s = caseStatus(c); const od = c.tasks.filter((t) => !t.done && t.due && t.due <= TODAY).length; const left = c.tasks.filter((t) => !t.done && !t.optional).length;
    return `<tr class="click" data-open="${c.id}" tabindex="0"><td><b>${esc(emp(c.empId).name)}</b><div class="small muted">${esc(emp(c.empId).role)}</div></td><td>${esc(REASONS[c.reason].hr)}</td><td class="mono small">${fmtS(d.start)}${d.end ? " to " + fmtS(addDays(d.end, -1)) : ""}</td><td>${pill(s.t, s.cls)}</td><td>${od ? pill(od + " overdue", "bad") : left ? pill(left + " open", "") : pill("All done", "ok")}</td><td class="small muted">${{ hr: "HR", employee: "Employee", manager: "Manager" }[c.source]}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">No cases.</td></tr>'}
  </tbody></table></div></section>`;
}
function hrCase(c) {
  if (!c) { UI.caseId = null; return hrCases(); }
  const e = emp(c.empId), s = caseStatus(c);
  const items = c.tasks.map((t) => ({ c, t }));
  let body;
  if (c.reason === "unknown") {
    body = `<section class="panel"><h3>Set the leave type</h3><p class="muted small">Flagged by ${esc(emp(e.mgr)?.name || "a manager")} on ${fmt(c.requested)}${c.notes ? `: “${esc(c.notes)}”` : ""}. Talk with the employee, then set the leave type.</p>
      <div class="row"><div class="field"><label for="cv-reason">Leave type</label><select id="cv-reason">${Object.entries(REASONS).filter(([k]) => k !== "unknown").map(([k, r]) => `<option value="${k}">${r.hr}</option>`).join("")}</select></div><div class="field"><label for="cv-start">Start date</label><input type="date" id="cv-start" value="${addDays(TODAY, 7)}"></div></div>
      <div class="btns"><button class="btn primary" data-convert="${c.id}">Set leave type</button></div></section>`;
  } else {
    const p = planFor(c);
    body = `<section class="panel"><div class="panel-h"><h3>Leave plan</h3><span class="small muted">${esc(REASONS[c.reason].hr)}${c.opts.relation && REASONS[c.reason].rel ? " · " + esc(relName(c.opts.relation)) : ""}</span></div>${timelineHTML(p)}${payHTML(p)}</section>
    <section class="panel"><h3>Eligibility</h3>${eligHTML(p, c.reason)}${factsHTML(p)}</section>`;
  }
  return `<div class="head"><div><button class="linkish" data-back>← All cases</button><h2 style="margin-top:6px">${esc(e.name)}</h2><p>${esc(e.role)} · hired ${fmt(e.hire)} · requested ${fmt(c.requested)}</p></div>${pill(s.t, s.cls)}</div>
  <div class="grid2"><div class="stack">${body}</div>
  <div class="stack"><section class="panel"><h3>Deadlines</h3>${queueHTML(items, false)}</section>
  <section class="panel"><h3>Manager coverage note</h3><p class="small ${c.coverage ? "" : "muted"}">${esc(c.coverage || "No coverage plan yet. The manager adds it from their view.")}</p></section>
  <section class="panel"><div class="field"><label for="hrnote">Private HR notes</label><textarea id="hrnote" data-casenote="${c.id}" placeholder="Visible to HR only. Saves when you leave the box.">${esc(c.hrNote || "")}</textarea></div>
  <div class="btns"><button class="btn" data-delete="${c.id}">Delete case</button></div></section></div></div>`;
}
function hrPlan() {
  const f = UI.planner, e = emp(f.empId), R = REASONS[f.reason];
  const p = buildPlan(e, D().company, f.reason, optsFrom(f));
  return `<div class="head"><div><h2>Plan a leave</h2><p>Pick the employee and reason. The plan stacks every California and federal entitlement, shows pay, and lists the notices you owe.</p></div></div>
  <div class="grid2 form">
    <section class="panel" data-form="planner">
      <div class="field"><label for="pl-emp">Employee</label><select id="pl-emp" data-bind="empId">${D().employees.map((x) => `<option value="${x.id}" ${x.id === f.empId ? "selected" : ""}>${esc(x.name)} · ${esc(x.role)}</option>`).join("")}</select></div>
      <div class="field"><label for="pl-reason">Reason</label><select id="pl-reason" data-bind="reason">${Object.entries(REASONS).filter(([k]) => k !== "unknown").map(([k, r]) => `<option value="${k}" ${k === f.reason ? "selected" : ""}>${r.hr}</option>`).join("")}</select></div>
      ${R.rel ? relSelect("pl-rel", R.rel, f.relation) : ""}
      <div class="field"><label for="pl-start">${f.reason === "bereavement" ? "First day off" : "Start date"}</label><input type="date" id="pl-start" value="${f.start}" data-bind="start"></div>
      ${lengthFields("pl-", f)}
      <div class="btns"><button class="btn primary" data-createcase>Open case and start deadlines</button></div>
      <p class="small muted">Opening a case sets the request date to today and starts the 5 business day notice clock.</p>
    </section>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h3>${esc(e.name)}</h3><span class="small muted">Ends ${fmt(addDays(p.end, -1))}</span></div>${timelineHTML(p)}${payHTML(p)}</section>
      <section class="panel"><h3>Eligibility</h3>${eligHTML(p, f.reason)}${factsHTML(p)}</section>
    </div>
  </div>`;
}
function hrEmployees() {
  const co = D().company;
  return `<div class="head"><div><h2>Employees</h2><p>Eligibility is checked as of today. Hours and balances come from payroll; edit them in place.</p></div></div>
  <section class="panel"><div class="tw"><table><thead><tr><th>Employee</th><th>Hired</th><th class="num">Hours (12 mo)</th><th class="num">CFRA left</th><th class="num">Sick hours</th><th>Today</th></tr></thead><tbody>
  ${D().employees.map((e) => { const el = eligibility(e, co, TODAY); return `<tr><td><b>${esc(e.name)}</b><div class="small muted">${esc(e.role)}</div></td><td class="mono small">${fmt(e.hire)}</td>
  <td class="num"><input type="number" aria-label="Hours for ${esc(e.name)}" id="h-${e.id}" data-emp="${e.id}|hours12" value="${e.hours12}" style="width:86px;text-align:right"></td>
  <td class="num">${plural(el.cfra.remaining, "wk")}</td>
  <td class="num"><input type="number" aria-label="Sick hours for ${esc(e.name)}" id="s-${e.id}" data-emp="${e.id}|sick" value="${e.sick}" style="width:70px;text-align:right"></td>
  <td><div class="btns" style="gap:4px">${pill("CFRA", el.cfra.ok ? "ok" : "bad")}${el.fmla.covered ? pill("FMLA", el.fmla.ok ? "ok" : "bad") : ""}${pill("PDL", el.pdl.ok ? "ok" : "bad")}${pill("Bereavement", el.short.ok ? "ok" : "bad")}${pill("Sick", el.sick.ok ? "ok" : "warn")}</div></td></tr>`; }).join("")}
  </tbody></table></div><p class="small muted">Sick leave accrues at 1 hour per 30 worked. You may cap the balance at 80 hours and yearly use at 40.</p></section>`;
}
function hrSettings() {
  const co = D().company;
  return `<div class="head"><div><h2>Company settings</h2><p>Headcount decides which laws apply. Change it to see FMLA switch on at 50. Changes apply for every test account.</p></div></div>
  <div class="grid2 even"><section class="panel">
    <div class="field"><label for="co-name">Company name</label><input type="text" id="co-name" value="${esc(co.name)}" data-co="name"></div>
    <div class="field"><label for="co-hc">Employees (count everyone, full and part time)</label><input type="number" id="co-hc" min="1" value="${co.headcount}" data-co="headcount" data-num></div>
    <label class="check"><input type="checkbox" id="co-75" ${co.within75 ? "checked" : ""} data-co="within75">50 or more employees work within 75 miles of each other (needed for FMLA)</label>
    <div class="field"><label for="co-hol">Company holidays</label><input type="text" id="co-hol" value="${esc(co.holidays.join(", "))}" data-co="holidays"><span class="hint">yyyy-mm-dd, separated by commas. Skipped when counting business days.</span></div>
  </section><section class="panel">
    <h3>Benefit estimate inputs</h3>
    <div class="row"><div class="field"><label for="co-max">Max weekly benefit</label><input type="number" id="co-max" value="${co.wbaMax}" data-co="wbaMax" data-num><span class="hint">$1,765 for 2026 claims</span></div>
    <div class="field"><label for="co-band">90% rate applies up to</label><input type="number" id="co-band" value="${co.band90}" data-co="band90" data-num><span class="hint">Highest quarter wages. 2025 EDD figure; update when EDD publishes 2026.</span></div></div>
    <div class="infobox">Estimates use 90% of weekly wages for lower earners and 70% for others, within the weekly minimum and maximum. EDD makes the final calculation.</div>
    <h3>Test data</h3>
    <p class="small muted">Puts the sample company, employees, and cases back for all test accounts. Cases you added are removed.</p>
    <div class="btns"><button class="btn" data-reset>Reset to sample data</button></div>
  </section></div>`;
}

/* ---------- Employee ---------- */
function empView() {
  const e = emp(S.me.empId), co = D().company, el = eligibility(e, co, TODAY), f = UI.req, R = REASONS[f.reason];
  const mine = D().cases.filter((c) => c.empId === e.id && c.reason !== "unknown");
  const avail = Math.min(e.sick, Math.max(0, 40 - e.sickUsedYr));
  const wba = weeklyBenefit(e, co);
  return `<div class="head"><div><h2>Hi ${esc(e.name.split(" ")[0])}</h2><p>Your balances, your requests, and what to do next.</p></div></div>
  <section class="panel"><h3>Your balances</h3><div class="balance">
    <div><span class="label">Paid sick leave</span><span class="v">${e.sick} hrs</span><div class="meter"><span style="width:${Math.min(100, (e.sick / 80) * 100)}%"></span></div><span class="small muted">${avail} usable this year</span></div>
    <div><span class="label">CFRA family and medical</span><span class="v">${el.cfra.ok ? plural(el.cfra.remaining, "wk") : "Not yet"}</span><div class="meter"><span style="width:${el.cfra.ok ? (el.cfra.remaining / 12) * 100 : 0}%"></span></div><span class="small muted">${el.cfra.ok ? "Job protected, unpaid by us" : el.cfra.checks.filter((c) => !c.ok).map((c) => c.t.replace(/ \(.*\)/, "")).join(" · ") + " needed"}</span></div>
    <div><span class="label">Pregnancy disability</span><span class="v">Up to 4 mo</span><span class="small muted">Available from day one</span></div>
    <div><span class="label">Bereavement</span><span class="v">${el.short.ok ? "5 days" : "After 30 days"}</span><span class="small muted">Per family death</span></div>
    <div><span class="label">State wage replacement</span><span class="v">${wba ? money(wba.amount) + "/wk" : "EDD"}</span><span class="small muted">Estimate from EDD (SDI or PFL)</span></div>
  </div></section>
  <div class="grid2">
    <div class="stack">${mine.length ? mine.map((c) => empCase(c)).join("") : `<section class="panel"><h3>No leave requests</h3><p class="muted">When you need time off, use the form. HR replies within 5 business days.</p></section>`}</div>
    <section class="panel" data-form="req"><h3>Request time off</h3>
      <div class="field"><label for="rq-reason">What is it for?</label><select id="rq-reason" data-bind="reason">${Object.entries(REASONS).filter(([k]) => k !== "unknown").map(([k, r]) => `<option value="${k}" ${k === f.reason ? "selected" : ""}>${r.emp}</option>`).join("")}</select></div>
      ${R.rel ? relSelect("rq-rel", R.rel, f.relation) : ""}
      <div class="field"><label for="rq-start">First day off</label><input type="date" id="rq-start" value="${f.start}" data-bind="start"></div>
      ${lengthFields("rq-", f)}
      <p class="small muted">HR keeps the reason private. Your manager sees only the dates you are out.${f.reason === "repro" ? " You will not be asked for documentation." : ""}</p>
      <div class="btns"><button class="btn primary" data-submitreq>Send to HR</button></div>
    </section>
  </div>`;
}
function empCase(c) {
  const p = planFor(c), steps = [];
  const cert = c.tasks.find((t) => t.key === "cert"), notice = c.tasks.find((t) => t.key === "notice");
  const prot = p.segs.filter((s) => s.lane === "protect" && s.cls !== "none");
  if (notice && !notice.done) steps.push(`HR sends your eligibility and rights notice by <b>${fmtS(notice.due)}</b>.`);
  if (cert && !cert.done) steps.push(`Ask your health care provider to complete the certification. Send it to HR by <b>${fmtS(cert.due)}</b>.`);
  if (p.pays.sdi) steps.push(`File a Disability Insurance claim with EDD through SDI Online within ${RULES.sdi.fileWithin} days of your first day out. The first 7 days are unpaid by EDD; you can use sick leave.`);
  if (p.pays.pfl) steps.push(`File a Paid Family Leave claim with EDD within ${RULES.pfl.fileWithin} days of your first day of leave.`);
  if (prot.length) steps.push(`Your job is protected from <b>${fmtS(prot[0].start)}</b> to <b>${fmtS(addDays(prot[prot.length - 1].end, -1))}</b>. Health coverage continues.`);
  if (c.reason === "bereavement") steps.push("HR may ask for documentation within 30 days of your first day off.");
  if (c.reason === "sick") steps.push("Your pay stub will show the new balance.");
  const s = caseStatus(c);
  return `<section class="panel"><div class="panel-h"><h3>${esc(REASONS[c.reason].emp)}</h3>${pill(s.t, s.cls)}</div>${timelineHTML(p)}
  <div><div class="label" style="margin-bottom:8px">What happens next</div><ol class="steps">${steps.map((x) => `<li><span>${x}</span></li>`).join("")}</ol></div>
  ${p.warnings.length ? `<div class="infobox">HR will talk with you about one or more parts of this request before confirming dates.</div>` : ""}</section>`;
}

/* ---------- Manager ---------- */
function mgrView() {
  const m = emp(S.me.empId), team = D().team, cases = D().teamCases;
  const s0 = addDays(TODAY, -7), span = 7 * 13, e0 = addDays(s0, span);
  const pos = (d) => Math.max(0, Math.min(100, (diffDays(s0, d) / span) * 100));
  const weeks = []; for (let i = 0; i <= 13; i++) weeks.push(addDays(s0, i * 7));
  const f = UI.flag, leaves = cases.filter((c) => !c.flagged), flags = cases.filter((c) => c.flagged);
  return `<div class="head"><div><h2>${esc(m.name.split(" ")[0])}'s team</h2><p>Who is out and when, so you can plan coverage. Reasons and medical details stay with HR.</p></div></div>
  <section class="panel"><div class="panel-h"><h3>Next 12 weeks</h3><span class="small muted">Line marks today</span></div><div class="calw"><div class="cal">
    <div class="tl-axis">${weeks.filter((_, i) => i % 2 === 1).map((d) => `<span style="left:${pos(d)}%;${pos(d) > 92 ? "transform:translateX(-100%)" : ""}">${fmtS(d)}</span>`).join("")}</div>
    ${team.map((t) => { const cs = leaves.filter((c) => c.empId === t.id); return `<div class="lane"><div class="ln">${esc(t.name)}<div class="small muted">${esc(t.role)}</div></div><div class="track">${weeks.map((d) => `<span class="wk" style="left:${pos(d)}%"></span>`).join("")}
      ${cs.map((c) => { if (!c.end || c.end <= s0 || c.start >= e0) return ""; return `<div class="sg cfra" style="left:${pos(c.start)}%;width:${Math.max(1.2, pos(c.end) - pos(c.start))}%" title="Out ${fmtS(c.start)} to ${fmtS(addDays(c.end, -1))}">Out</div>`; }).join("")}
      <div class="today-line" style="left:${pos(TODAY)}%"></div></div></div>`; }).join("")}
  </div></div></section>
  <div class="grid2">
    <section class="panel"><h3>Absences</h3>${leaves.length ? leaves.map((c) => `<div class="field" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="panel-h"><b>${esc(emp(c.empId).name)}</b>${pill(c.status.t, c.status.cls)}</div>
      <div class="small">Out <span class="mono">${fmtS(c.start)}</span> · back <span class="mono">${fmtS(c.end)}</span> (HR confirms the return date)</div>
      <label for="cov-${c.id}" class="small" style="font-weight:600">Coverage plan</label><textarea id="cov-${c.id}" data-cov="${c.id}" placeholder="Who covers which work. Saves when you leave the box.">${esc(c.coverage)}</textarea></div>`).join("") : '<p class="muted">No one on your team has leave scheduled.</p>'}
      ${flags.length ? `<div class="small muted">Sent to HR and waiting for intake: ${flags.map((c) => esc(emp(c.empId).name)).join(", ")}</div>` : ""}
      <div class="infobox">Do not ask why someone is out or contact them about work during protected leave. Send questions to ${esc(D().company.hrContact)} in HR.</div></section>
    <section class="panel" data-form="flag"><h3>Tell HR about a possible leave</h3><p class="small muted">If someone on your team mentions needing time off for their health, a family member, a new child, or a death, tell HR right away. The legal clock starts when you hear about it, even if they never use the word leave.</p>
      <div class="field"><label for="fl-emp">Team member</label><select id="fl-emp" data-bind="empId"><option value="">Choose</option>${team.map((t) => `<option value="${t.id}" ${t.id === f.empId ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="fl-date">When did you hear?</label><input type="date" id="fl-date" value="${f.heard}" max="${TODAY}" data-bind="heard"></div>
      <div class="field"><label for="fl-note">What they said (keep it short, no medical details)</label><textarea id="fl-note" data-bind="note" placeholder="Asked for a few weeks off starting next month">${esc(f.note)}</textarea></div>
      <div class="btns"><button class="btn primary" data-flag>Send to HR</button></div></section>
  </div>`;
}

/* ---------- Sign in ---------- */
let ACCOUNTS = null;
async function renderLogin() {
  setChrome(false);
  const root = document.getElementById("root");
  if (!ACCOUNTS) {
    try { ACCOUNTS = await (await fetch("/api/accounts")).json(); } catch (e) { ACCOUNTS = { accounts: [], configured: false }; }
  }
  const L = UI.login;
  const groups = [["HR", ACCOUNTS.accounts.filter((a) => a.label.startsWith("HR"))], ["Managers", ACCOUNTS.accounts.filter((a) => a.label.startsWith("Manager"))], ["Employees", ACCOUNTS.accounts.filter((a) => a.label.startsWith("Employee"))]];
  root.innerHTML = `<section class="login">
    <form class="panel" id="loginForm" style="gap:16px">
      <div><h1>Sign in</h1><p class="lede" style="margin-top:6px">Test accounts for Mesa Verde Coffee Roasters, a sample company. Pick one, enter the shared test password, and you see the app as that user.</p></div>
      <div class="field"><label for="lg-email">Email</label><input type="text" id="lg-email" autocomplete="username" value="${esc(L.email)}" placeholder="Pick an account or type its email"></div>
      <div class="field"><label for="lg-pw">Test password</label><input type="password" id="lg-pw" autocomplete="current-password" value="${esc(L.password)}"></div>
      ${L.error ? `<p class="err">${esc(L.error)}</p>` : ""}
      ${ACCOUNTS.configured ? "" : `<p class="err">This site has no test password yet. The site owner sets LL_TEST_PASSWORD in Netlify.</p>`}
      <div class="btns"><button class="btn primary" type="submit">Sign in</button></div>
      <p class="small muted">All accounts share one password and one set of sample data. Anything one user changes, the others see.</p>
    </form>
    <div class="stack">${groups.map(([g, list]) => `<div class="grp"><span class="label">${g}</span><div class="accts">${list.map((a) => `<button type="button" class="acct" data-pick="${esc(a.email)}" aria-pressed="${a.email === L.email}"><b>${esc(a.email.split("@")[0].replace(/^./, (x) => x.toUpperCase()))}</b><span>${esc(a.label)}</span><span class="em">${esc(a.email)}</span></button>`).join("")}</div></div>`).join("")}</div>
  </section>`;
  document.getElementById("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    L.email = document.getElementById("lg-email").value; L.password = document.getElementById("lg-pw").value;
    try { const j = await api("login", { email: L.email, password: L.password }); L.error = ""; L.password = ""; UI.view = null; UI.caseId = null; accept(j); render(); window.scrollTo(0, 0); }
    catch (e) { L.error = e.message; renderLogin(); }
  });
}

/* ---------- Shell ---------- */
const TABS = [["overview", "Overview"], ["cases", "Cases"], ["plan", "Plan a leave"], ["employees", "Employees"], ["settings", "Settings"]];
const VIEW_NAMES = { hr: "HR admin", mgr: "Manager", emp: "My leave" };
function setChrome(on) {
  document.getElementById("views").hidden = !on;
  document.getElementById("who").hidden = !on;
  document.getElementById("tabs").hidden = true;
  document.getElementById("coName").textContent = on ? `${D().company.name} · ${D().company.city}` : "California leave management";
}
function render() {
  if (!S) return renderLogin();
  setChrome(true);
  const vs = document.getElementById("views");
  vs.hidden = S.me.views.length < 2;
  vs.innerHTML = S.me.views.map((v) => `<button data-view="${v}" aria-pressed="${UI.view === v}">${VIEW_NAMES[v]}</button>`).join("");
  document.getElementById("who").innerHTML = `<span><span class="nm">${esc(S.me.name)}</span> <span class="muted">· ${esc(S.me.label)}</span></span><button class="btn" data-logout>Switch account</button>`;
  const tabs = document.getElementById("tabs");
  if (UI.view === "hr") {
    const od = overdueCount();
    tabs.hidden = false;
    tabs.innerHTML = TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-selected="${UI.tab === k}">${n}${k === "overview" && od ? `<span class="count">${od}</span>` : ""}</button>`).join("");
  }
  const focusId = document.activeElement && document.activeElement.id;
  let html;
  if (UI.view === "emp") html = empView();
  else if (UI.view === "mgr") html = mgrView();
  else html = { overview: hrOverview, cases: hrCases, plan: hrPlan, employees: hrEmployees, settings: hrSettings }[UI.tab]();
  document.getElementById("root").innerHTML = `<main>${html}<div class="foot"><span>Test environment with a sample company. Rules checked October 2026 for California private employers. Not legal advice.</span><span>CFRA · PDL · FMLA · SDI · PFL · Paid sick leave · Bereavement · Reproductive loss</span></div></main>`;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
  saveUI();
}
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800); }

/* ---------- Events ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button, tr[data-open]"); if (!b) return;
  if (b.dataset.pick) { UI.login.email = b.dataset.pick; UI.login.password = document.getElementById("lg-pw")?.value || ""; UI.login.error = ""; await renderLogin(); document.getElementById("lg-pw").focus(); return; }
  if (!S) return;
  if (b.hasAttribute("data-logout")) { await api("logout", {}).catch(() => {}); S = null; UI.login.password = ""; renderLogin(); return; }
  if (b.dataset.view) { UI.view = b.dataset.view; UI.caseId = null; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.tab) { UI.tab = b.dataset.tab; UI.caseId = null; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.open) { UI.view = "hr"; UI.tab = "cases"; UI.caseId = b.dataset.open; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-back")) { UI.caseId = null; render(); return; }
  if (b.hasAttribute("data-createcase")) {
    const f = UI.planner; const j = await act({ type: "createCase", empId: f.empId, reason: f.reason, opts: optsFrom(f) });
    if (j) { UI.tab = "cases"; UI.caseId = j.createdId; render(); window.scrollTo(0, 0); toast("Case opened. Deadlines started."); } return;
  }
  if (b.hasAttribute("data-submitreq")) { const f = UI.req; await act({ type: "createCase", empId: S.me.empId, reason: f.reason, opts: optsFrom(f) }, "Sent to HR"); return; }
  if (b.hasAttribute("data-flag")) {
    const f = UI.flag; if (!f.empId) { toast("Choose a team member first"); return; }
    const j = await act({ type: "flag", empId: f.empId, heard: f.heard, note: f.note }, "Sent to HR. Notice due in 5 business days.");
    if (j) { UI.flag = { empId: "", heard: TODAY, note: "" }; render(); } return;
  }
  if (b.dataset.convert) {
    await act({ type: "convert", caseId: b.dataset.convert, reason: document.getElementById("cv-reason").value, opts: { ...optsFrom(UI.planner), start: document.getElementById("cv-start").value } }, "Leave type set"); return;
  }
  if (b.dataset.delete) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to delete"; b.classList.add("primary"); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Delete case"; b.classList.remove("primary"); } }, 4000); return; }
    const id = b.dataset.delete; const j = await act({ type: "deleteCase", caseId: id }, "Case deleted"); if (j) { UI.caseId = null; render(); } return;
  }
  if (b.hasAttribute("data-reset")) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to reset for all accounts"; b.classList.add("primary"); return; }
    await act({ type: "reset" }, "Sample data restored"); return;
  }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.matches("tr[data-open]")) ev.target.click(); });
document.addEventListener("change", (ev) => {
  const el = ev.target; if (!S) return;
  if (el.dataset.task) { const [caseId, key] = el.dataset.task.split("|"); act({ type: "toggleTask", caseId, key, done: el.checked }); return; }
  if (el.dataset.emp) { const [id, field] = el.dataset.emp.split("|"); act({ type: "updateEmployee", id, field, value: el.value }, "Saved"); return; }
  if (el.dataset.co) {
    const field = el.dataset.co; let value = el.type === "checkbox" ? el.checked : el.value;
    if (field === "holidays") value = String(value).split(",").map((s) => s.trim()).filter(Boolean);
    act({ type: "updateCompany", field, value }, "Saved"); return;
  }
  if (el.dataset.cov) { act({ type: "setCoverage", caseId: el.dataset.cov, text: el.value }, "Coverage plan saved"); return; }
  if (el.dataset.casenote) { act({ type: "setHrNote", caseId: el.dataset.casenote, text: el.value }, "Note saved"); return; }
  bind(el);
});
document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.closest('[data-form="flag"]') && el.dataset.bind) UI.flag[el.dataset.bind] = el.value;
});
function bind(el) {
  const form = el.closest("[data-form]"); if (!form || !el.dataset.bind) return;
  const target = { planner: UI.planner, req: UI.req, flag: UI.flag }[form.dataset.form];
  let v = el.value; if (el.hasAttribute("data-num")) v = Math.max(0, +v || 0);
  if (el.type === "date" && !v) return;
  target[el.dataset.bind] = v;
  if (el.dataset.bind === "reason" && REASONS[v].rel === "bereave" && !REL.bereave.some((r) => r[0] === target.relation)) target.relation = "parent";
  if (form.dataset.form !== "flag") render();
}

// Refresh when the tab regains focus, so changes from other test accounts show up.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S) return;
  const a = document.activeElement; if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
  try { accept(await api("state")); render(); } catch (e) {}
});

(async () => {
  try { accept(await api("state")); render(); }
  catch (e) { if (e.message !== "signed out") renderLogin(); }
})();
