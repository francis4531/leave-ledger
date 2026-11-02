import {
  addDays, diffDays, fmt, fmtS, money, esc, plural, RULES, REASONS, REL, relName, sickUseCap, sickBalanceCap, sickUsable, shiftOf, weeklyOf, pdlHours,
  weeklyBenefit, eligibility, buildPlan, makeTasks,
  planFor as planForD, caseDates as caseDatesD, caseStatus as caseStatusD,
} from "./engine.mjs";
import { LETTERS, hasLetter, draftLetter, managerNotice, sensitiveNote } from "./notices.mjs";
import { COLUMNS, templateCSV, parseTable, checkRows, HR_SYSTEMS } from "./roster.mjs";
import { LEAVES, RIGHTS, EDD, eddSteps } from "./guide.mjs";

/* ---------- State ---------- */
let S = null;          // {me, today, data}
let TODAY = "";
let MODE = "test";     // "feedback" on the prospect site: invite links, Google sign-in, workspaces, feedback and survey
const FB = () => MODE === "feedback";
let ME = null;         // preview site: who is signed in with Google and which spaces they can open
const ORG = () => !!(S && S.space && S.space.kind === "org");
const UI = {
  tab: null, caseId: null,
  planner: { empId: "e1", reason: "pregnancy_bonding", relation: "parent", start: "", weeks: 6, disWeeks: 10, bondWeeks: 12, days: 5, hours: 8 },
  req: { reason: "own_health", relation: "parent", start: "", weeks: 4, disWeeks: 10, bondWeeks: 12, days: 3, hours: 8 },
  flag: { empId: "", heard: "", note: "" },
  login: { error: "" },
  reqAI: { text: "", sent: "", draft: null, busy: false, error: "" },
  conv: { caseId: null, draft: null, busy: false, error: "" },
  fb: { open: false, rating: 0, kind: "", note: "", busy: false, error: "" },
  survey: { open: false, q: null, a: {}, busy: false, error: "", done: null, later: false },
  home: { busy: false, error: "", form: { name: "", city: "", headcount: 20, jobTitle: "", start: "sample", lockDomain: false, agree: false } },
  users: { list: null, domain: null, canLock: false, myDomain: null, email: "", role: "emp", empId: "", busy: false, error: "" },
  letter: null,          // {caseId, key, subject, body, sentOn, method, view: index of a sent letter}
  imp: { open: false, rows: null, raw: null, missing: [], error: "", file: "", busy: false },
  appr: { caseId: null, notify: true, note: "" },
  addEmp: { open: false, name: "", email: "", role: "", hire: "", hours12: 1000, sick: 24, hiQuarter: 12000, shiftHours: 8, weeklyHours: 40, mgr: "", error: "" },
};
const store = {
  get(k, s = localStorage) { try { return s.getItem(k); } catch (e) { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, v); } catch (e) {} },
};
try { const r = JSON.parse(store.get("ll-ui") || "{}"); if (r.tab) UI.tab = r.tab; } catch (e) {}
const saveUI = () => store.set("ll-ui", JSON.stringify({ tab: UI.tab }));

const D = () => S.data;
const emp = (id) => D().employees.find((e) => e.id === id) || (D().team || []).find((e) => e.id === id);
const planFor = (c) => planForD(c, D());
const caseDates = (c) => caseDatesD(c, D());
const caseStatus = (c) => caseStatusD(c, D(), TODAY);

/* Tabs per role. The view follows from the tab. */
const TABS = {
  hr: [["overview", "Today"], ["cases", "Leaves"], ["plan", "Plan a leave"], ["employees", "Employees"], ["access", "Users"], ["settings", "Settings"], ["guide", "Guide"], ["myleave", "My leave"]],
  mgr: [["team", "My team"], ["myleave", "My leave"], ["guide", "Guide"]],
  emp: [["myleave", "My leave"], ["guide", "Guide"]],
};
// The server says what this user can do (S.caps); tabs and buttons follow it.
const CAP = (k) => !!(S && S.caps && S.caps[k]);
const SAMPLE = () => !!(S && S.space && S.space.kind === "preview");
const tabsFor = (role) => TABS[role].filter(([k]) => (k !== "access" || CAP("users")) && (k !== "settings" || CAP("settings")));
const viewOf = () => (UI.tab === "myleave" ? "emp" : S.me.role === "mgr" ? "mgr" : S.me.role === "hr" ? "hr" : "emp");

/* ---------- API ---------- */
async function api(path, body) {
  const r = await fetch("/api/" + path, body === undefined ? { credentials: "same-origin" } : {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: "The server did not answer. Try again in a moment." }));
  if (r.status === 401 && path !== "login") { S = null; if (FB()) ACCOUNTS = null; renderLogin(); throw new Error("signed out"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}
function accept(j) {
  S = { me: j.me, today: j.today, data: j.data, ai: j.ai || { on: false }, space: j.space || { kind: "test" }, caps: j.caps || {}, mail: j.mail || { on: false } }; TODAY = j.today;
  if (j.mode) MODE = j.mode;
  if (!UI.tab || !tabsFor(S.me.role).some(([k]) => k === UI.tab)) UI.tab = tabsFor(S.me.role)[0][0];
  if (!UI.planner.start) UI.planner.start = addDays(TODAY, 14);
  if (!UI.req.start) UI.req.start = addDays(TODAY, 14);
  if (!UI.flag.heard) UI.flag.heard = TODAY;
  if (S.me.role === "hr" && !D().employees.some((e) => e.id === UI.planner.empId)) UI.planner.empId = D().employees[0].id;
}
async function act(a, okMsg) {
  try { const j = await api("action", a); accept(j); render(); if (okMsg) toast(okMsg); return j; }
  catch (e) { if (e.message !== "signed out") toast(e.message); return null; }
}

/* ---------- Small helpers ---------- */
const pill = (t, cls = "") => `<span class="pill ${cls}">${esc(t)}</span>`;
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const hue = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; };
const avatar = (e, size = "") => `<span class="av c${hue(e.id || e.name)} ${size}" aria-hidden="true">${esc(initials(e.name))}</span>`;
const first = (n) => n.split(" ")[0];
const range = (a, bExcl) => `${fmtS(a)} to ${fmtS(addDays(bExcl, -1))}`;
function greeting() {
  const h = +new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Los_Angeles" }).format(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
/* Task wording comes from the current engine, so older saved cases pick up clearer labels. */
function taskText(c, t) {
  try {
    const plan = c.reason === "unknown" ? { start: c.requested, end: c.requested } : planFor(c);
    const f = makeTasks(c.reason, c.requested, plan, D().company).find((x) => x.key === t.key);
    return f ? { label: f.label, hint: f.hint } : t;
  } catch (e) { return t; }
}
function dueState(t) {
  if (t.done) return { t: `Done ${fmtS(t.doneOn)}`, cls: "ok", g: "done" };
  if (!t.due) return { t: "Waiting on paperwork", cls: "", g: "later" };
  const d = diffDays(TODAY, t.due);
  if (d < 0) return { t: `${-d} day${d === -1 ? "" : "s"} late`, cls: "bad", g: "now" };
  if (d === 0) return { t: "Due today", cls: "bad", g: "now" };
  if (d === 1) return { t: "Due tomorrow", cls: "warn", g: "week" };
  if (d <= 7) return { t: `Due ${new Date(Date.parse(t.due + "T12:00:00Z")).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${fmtS(t.due)}`, cls: d <= 3 ? "warn" : "", g: "week" };
  return { t: `Due ${fmtS(t.due)}`, cls: "", g: "later" };
}
function openTasks() {
  const out = [];
  D().cases.forEach((c) => c.tasks.forEach((t) => { if (!t.done && !t.optional) out.push({ c, t }); }));
  return out.sort((a, b) => ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : 1));
}
const lateCount = () => openTasks().filter((x) => x.t.due && x.t.due <= TODAY).length;
function checksHTML(list) { return `<div class="checks">${list.map((c) => `<div class="chk ${c.ok ? "y" : "n"}"><i aria-hidden="true">${c.ok ? "✓" : "✕"}</i><span>${esc(c.t)}</span></div>`).join("")}</div>`; }
const COLORS = { pdl: "var(--pdl)", cfra: "var(--cfra)", fmla: "var(--fmla)", short: "var(--short)", sdi: "var(--sdi)", pfl: "var(--pfl)", sick: "var(--sdi)", unpaid: "var(--unpaid)", wait: "var(--unpaid)", none: "var(--bad)" };
const fmlaCovered = () => D().company.headcount >= 50;

/* ---------- Shared building blocks ---------- */
function timelineHTML(p) {
  if (!p.segs.length) return "";
  const s0 = p.segs.reduce((m, x) => (x.start < m ? x.start : m), p.segs[0].start);
  const e0 = p.segs.reduce((m, x) => (x.end > m ? x.end : m), p.segs[0].end);
  const span = Math.max(7, diffDays(s0, e0));
  const pos = (d) => Math.max(0, Math.min(100, (diffDays(s0, d) / span) * 100));
  const lanes = [["protect", "Job protection"], ["concurrent", "Also counts as"], ["pay", "Pay"]].filter(([k]) => p.segs.some((s) => s.lane === k));
  const ticks = []; const n = span > 60 ? 4 : 2;
  for (let i = 0; i <= n; i++) ticks.push(addDays(s0, Math.round((span * i) / n)));
  const todayIn = TODAY >= s0 && TODAY <= e0;
  return `<div class="tl" role="img" aria-label="Leave timeline">
    <div class="tl-axis">${ticks.map((d, i) => `<span class="${i > 0 && i < n ? "mid" : ""}" style="${i === n ? "left:auto;right:0;transform:none" : "left:" + pos(d) + "%"}">${fmtS(d)}</span>`).join("")}</div>
    ${lanes.map(([k, name]) => `<div class="lane"><div class="ln">${name}</div><div class="track">
      ${p.segs.filter((s) => s.lane === k).map((s) => { const w = pos(s.end) - pos(s.start); return `<div class="sg ${s.cls} ${w < 12 ? "narrow" : ""}" style="left:${pos(s.start)}%;width:${w}%" title="${esc(s.label)} · ${range(s.start, s.end)}">${esc(s.label)}</div>`; }).join("")}
      ${todayIn ? `<div class="today-line" style="left:${pos(TODAY)}%" title="Today"></div>` : ""}
    </div></div>`).join("")}
  </div>
  <div class="seglist">${p.segs.map((s) => `<div><span class="sw" style="background:${COLORS[s.cls]}"></span><span><b>${esc(s.label)}</b> <span class="muted small">${esc(s.sub || "")}</span></span><span class="mono small">${range(s.start, s.end)}</span></div>`).join("")}</div>`;
}
function factsHTML(p) {
  const facts = [...p.facts];
  if (!fmlaCovered()) facts.push({ t: `Federal FMLA does not apply here: it starts at 50 employees.`, c: RULES.fmla.cite });
  return `${p.warnings.map((w) => `<div class="warnbox ${w.bad ? "bad" : ""}">${esc(w.t)}</div>`).join("")}
  ${facts.length ? `<div class="notes">${facts.map((f) => `<div class="note"><span>${esc(f.t)}</span><span class="cite">${esc(f.c)}</span></div>`).join("")}</div>` : ""}`;
}
function payHTML(p) {
  if (!(p.pays.sdi || p.pays.pfl)) return "";
  const w = p.wba;
  return `<div class="infobox">${w ? `State pay estimate: about <b>${money(w.amount)} a week</b>, ${w.flat ? `the flat amount for ${money(w.weekly)} average weekly wages` : `which is ${Math.round(w.rate * 100)}% of ${money(w.weekly)} average weekly wages`}${w.capped ? " (capped at the 2026 maximum)" : ""}. The state (EDD) pays this, not the employer, and makes the final calculation.` : "The state (EDD) works out the amount from past wages."} ${p.pays.sdi ? `Disability pay claims are due within ${RULES.sdi.fileWithin} days of the first day out. ` : ""}${p.pays.pfl ? `Family leave pay claims are due within ${RULES.pfl.fileWithin} days of the first day of leave.` : ""}</div>`;
}
function eligHTML(p, reason) {
  const el = p.el, blocks = [];
  if (reason === "pregnancy_bonding") blocks.push(["Pregnancy leave", "PDL", el.pdl]);
  if (["pregnancy_bonding", "own_health", "family_care", "bonding"].includes(reason)) {
    blocks.push(["Family and medical leave", "CFRA", el.cfra]);
    if (fmlaCovered()) blocks.push(["Federal FMLA", "FMLA", el.fmla]);
  }
  if (["bereavement", "repro"].includes(reason)) blocks.push([reason === "repro" ? "Reproductive loss leave" : "Bereavement leave", "", el.short]);
  if (reason === "sick") blocks.push(["Paid sick leave", "", el.sick]);
  return `<div class="elig">${blocks.map(([n, ab, b]) => `<div><div class="panel-h"><h3>${n}${ab ? ` <span class="muted small">${ab}</span>` : ""}</h3>${b.ok ? pill("Qualifies", "ok") : pill("Does not qualify", "bad")}</div>${checksHTML(b.checks)}${b.remaining !== undefined && b.ok ? `<div class="small muted">${plural(b.remaining, "week")} left in the 12-month period</div>` : ""}</div>`).join("")}</div>`;
}
function relSelect(id, kind, val) {
  return `<div class="field"><label for="${id}">Family member</label><select id="${id}" data-bind="relation">${REL[kind].map(([k, n]) => `<option value="${k}" ${k === val ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
}
function lengthFields(prefix, f) {
  const u = REASONS[f.reason].unit;
  if (u === "two") return `<div class="row"><div class="field"><label for="${prefix}dis">Weeks unable to work</label><input id="${prefix}dis" type="number" min="1" max="30" step="1" value="${f.disWeeks}" data-bind="disWeeks" data-num><span class="hint">Before and after the birth, as the doctor advises</span></div><div class="field"><label for="${prefix}bond">Bonding weeks after</label><input id="${prefix}bond" type="number" min="0" max="12" step="1" value="${f.bondWeeks}" data-bind="bondWeeks" data-num><span class="hint">Up to 12</span></div></div>`;
  if (u === "weeks") return `<div class="field"><label for="${prefix}wk">How many weeks?</label><input id="${prefix}wk" type="number" min="1" max="52" step="1" value="${f.weeks}" data-bind="weeks" data-num></div>`;
  if (u === "days") return `<div class="field"><label for="${prefix}dy">How many workdays?</label><input id="${prefix}dy" type="number" min="1" max="20" step="1" value="${f.days}" data-bind="days" data-num><span class="hint">They do not have to be in a row</span></div>`;
  if (u === "hours") return `<div class="field"><label for="${prefix}hr">How many hours?</label><input id="${prefix}hr" type="number" min="1" max="80" step="1" value="${f.hours}" data-bind="hours" data-num></div>`;
  return "";
}
const optsFrom = (f) => ({ start: f.start, weeks: +f.weeks, disWeeks: +f.disWeeks, bondWeeks: +f.bondWeeks, days: +f.days, hours: +f.hours, relation: f.relation });
const reasonOptions = (sel, key) => Object.entries(REASONS).filter(([k]) => k !== "unknown").map(([k, r]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${r[key]}</option>`).join("");

function lawRows() {
  const co = D().company, c5 = co.headcount >= 5, c50 = fmlaCovered();
  return [
    ["Family and medical leave", "CFRA", c5, "Up to 12 weeks, job protected, for an own or family health condition or a new child.", "Applies at 5 or more employees"],
    ["Pregnancy leave", "PDL", c5, "Up to 4 months while unable to work due to pregnancy. No minimum time on the job.", "Applies at 5 or more employees"],
    ["Federal FMLA", "FMLA", c50, `Runs at the same time as the state leaves.${c50 && !co.within75 ? " Employees qualify only if 50 or more employees work within 75 miles of their worksite." : ""}`, "Starts at 50 employees"],
    ["State pay while out", "SDI and PFL", true, "The state pays about 70 to 90% of wages, up to $1,765 a week in 2026. The employer does not pay this.", ""],
    ["Paid sick leave", "", true, "40 hours or 5 days a year, whichever is more, for the employee or a sick family member.", ""],
    ["Bereavement leave", "", c5, "5 days for each family death, within 3 months.", "Applies at 5 or more employees"],
    ["Reproductive loss leave", "", c5, "5 days per loss, up to 20 a year. No documentation.", "Applies at 5 or more employees"],
  ];
}

/* ---------- Clerk helpers ---------- */
const LEN_KEYS = ["weeks", "days", "hours", "disWeeks", "bondWeeks"];
function describeDraft(d) {
  if (!d || d.reason === "unclear") return "Not sure what kind of leave this is";
  const len = d.disWeeks != null ? `${d.disWeeks} weeks unable to work, then ${d.bondWeeks} bonding` : d.weeks != null ? plural(d.weeks, "week") : d.days != null ? plural(d.days, "workday") : d.hours != null ? plural(d.hours, "hour") : "length not given";
  return [REASONS[d.reason].hr, d.relation ? relName(d.relation) : "", d.start ? `starts ${fmtS(d.start)}` : "start date not given", len].filter(Boolean).join(" · ");
}
const FIELD_NAMES = { reason: "type of leave", relation: "family member", start: "start date", length: "how long" };
function applyDraft(f, d) {
  if (!d || d.reason === "unclear") return;
  f.reason = d.reason;
  if (d.relation) f.relation = d.relation;
  if (d.start) f.start = d.start;
  LEN_KEYS.forEach((k) => { if (d[k] != null) f[k] = d[k]; });
}
function unsure(d) { if (!d) return []; return Object.entries(d.confidence || {}).filter(([k, v]) => v !== "high" && !(k === "relation" && !REASONS[d.reason]?.rel)).map(([k]) => k); }
async function askClerk(text) {
  const r = await fetch("/api/intake", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const j = await r.json().catch(() => ({ error: "Clerk did not answer. Fill in the form yourself." }));
  if (r.status === 401) { S = null; renderLogin(); throw new Error("signed out"); }
  if (!r.ok) throw new Error(j.error || "Clerk did not answer.");
  return j.draft;
}
function copilotBox() {
  const A = UI.reqAI, d = A.draft;
  let note = "";
  if (d && d.reason === "unclear") note = `<div class="cp-note warn">I could not tell what kind of time off this is. Pick it below, or add a little more detail and try again.</div>`;
  else if (d) { const u = unsure(d); note = `<div class="cp-note"><b>Here is what I understood:</b> ${esc(d.summary || describeDraft(d))}<div class="small" style="margin-top:4px">I filled in the form below.${u.length ? ` Please check what is marked in orange (${u.map((k) => FIELD_NAMES[k]).join(", ")}).` : " Check it, then send."}</div></div>`; }
  return `<div class="copilot">
    <div class="cp-h"><span class="spark" aria-hidden="true">✦</span><b>Tell us in your own words</b><span class="pill acc">Clerk</span></div>
    <textarea id="rq-text" data-ai-text rows="3" placeholder="For example: My dad is having knee surgery on Nov 12 and I need to help him for about 3 weeks.">${esc(A.text)}</textarea>
    <span class="hint">English or Spanish is fine. You do not need to name a diagnosis. AI reads this to fill in the form, and HR sees it too.</span>
    <div class="btns"><button class="btn" data-intake ${A.busy ? "disabled" : ""}>${A.busy ? "Reading it now" : d ? "Read it again" : "Fill in the form for me"}</button></div>
    ${A.error ? `<p class="err" role="alert">${esc(A.error)}</p>` : ""}${note}
  </div>
  <div class="or"><span>${d ? "Check the details" : "Or fill in the details yourself"}</span></div>`;
}
function intakePanel(c, e) {
  const I = c.intake; if (!I) return "";
  const ai = I.ai;
  return `<section class="panel"><div class="panel-h"><h3>${I.source === "manager" ? "From the manager's note" : `In ${esc(first(e.name))}'s words`}</h3><span class="pill acc">✦ Clerk intake</span></div>
    <blockquote class="quote">${esc(I.text)}</blockquote>
    <div class="small"><span class="muted">Clerk read it as</span> <b>${esc(describeDraft(ai))}</b></div>
    <div class="small">${I.changed && I.changed.length ? `<span class="pill warn">Changed before sending: ${esc(I.changed.map((k) => FIELD_NAMES[k]).join(", "))}</span>` : `<span class="pill ok">Sent as Clerk read it</span>`}</div>
    ${ai && ai.flag ? `<div class="warnbox">${esc(ai.flag)} Clerk ignored it.</div>` : ""}
    ${ai && ai.ask && ai.ask.length ? `<div class="small"><span class="muted">Worth asking:</span> ${ai.ask.map(esc).join(" · ")}</div>` : ""}
    <p class="small muted">Clerk only drafts. Eligibility, pay and deadlines come from the rules engine.</p></section>`;
}

/* ---------- HR: Today ---------- */
function letterBtn(c, t) {
  if (S.me.role !== "hr" || !hasLetter(c, t.key)) return "";
  const sent = (c.notices || []).map((n, i) => [n, i]).filter(([n]) => n.key === t.key).pop();
  if (sent) return `<button class="btn sm linkbtn" data-letter-view="${c.id}|${sent[1]}">View letter</button>`;
  if (t.done) return "";
  return `<button class="btn sm linkbtn" data-letter="${c.id}|${t.key}">${c.drafts && c.drafts[t.key] ? "Finish letter" : "Write letter"}</button>`;
}
function taskRow(c, t, showWho, compact) {
  const s = dueState(t), tx = taskText(c, t), e = emp(c.empId);
  return `<div class="qrow ${t.done ? "done" : ""}">
    <input type="checkbox" id="t-${c.id}-${t.key}" data-task="${c.id}|${t.key}" ${t.done ? "checked" : ""} ${!t.due && !t.done ? "disabled" : ""} aria-label="Mark done: ${esc(tx.label)}">
    <div><div class="t">${esc(tx.label)}${t.legal ? '<span class="bylaw" title="A deadline set by law">BY LAW</span>' : ""}</div>
    ${compact ? "" : `<div class="s">${showWho ? `<button class="linkish" data-open="${c.id}">${esc(e.name)}</button> · ${esc(REASONS[c.reason].hr)}` : esc(tx.hint || "")}</div>`}${letterBtn(c, t)}</div>
    ${compact ? (s.cls === "bad" && compact !== "first" ? pill(s.t, s.cls) : "<span></span>") : pill(s.t, s.cls)}</div>`;
}
function hrOverview() {
  const open = openTasks();
  const now = open.filter((x) => dueState(x.t).g === "now"), week = open.filter((x) => dueState(x.t).g === "week"), later = open.filter((x) => dueState(x.t).g === "later");
  const out = D().cases.filter((c) => caseStatus(c).t === "On leave");
  const back30 = D().cases.filter((c) => { const d = caseDates(c); return d.end && d.end > TODAY && diffDays(TODAY, d.end) <= 30; });
  const active = D().cases.filter((c) => caseStatus(c).t !== "Returned");
  const log = (D().log || []).filter((l) => l.by !== "System").slice(0, 6);
  const sum = now.length
    ? `<span class="bad"><b>${now.length} ${now.length === 1 ? "thing needs" : "things need"} your attention now.</b></span> ${week.length ? `${week.length} more ${week.length === 1 ? "is" : "are"} due in the next 7 days.` : ""}`
    : week.length ? `Nothing is late. <b>${week.length}</b> ${week.length === 1 ? "thing is" : "things are"} due in the next 7 days.` : "You are all caught up.";
  // One block per leave, so an employee with four steps due shows up once.
  const byCase = (items) => { const m = new Map(); items.forEach((x) => { if (!m.has(x.c.id)) m.set(x.c.id, { c: x.c, ts: [] }); m.get(x.c.id).ts.push(x.t); }); return [...m.values()]; };
  const caseBlock = ({ c, ts }) => { const e = emp(c.empId), s = dueState(ts[0]);
    return `<div class="cgroup"><div class="cg-h"><div class="person">${avatar(e, "sm")}<div><button class="linkish" data-open="${c.id}">${esc(e.name)}</button><div class="s">${esc(REASONS[c.reason].hr)}</div></div></div>${pill(s.t, s.cls)}</div>
      <div class="queue">${ts.map((t, i) => taskRow(c, t, false, i === 0 ? "first" : true)).join("")}</div></div>`; };
  const group = (title, color, items) => items.length ? `<div class="qgroup"><div class="qhead"><span class="dot" style="background:${color}"></span>${title} · ${items.length} ${items.length === 1 ? "step" : "steps"}</div>${byCase(items).map(caseBlock).join("")}</div>` : "";
  return `<div class="head"><div><h2 class="greet">${greeting()}, ${esc(first(S.me.name))}</h2><p class="sumline" style="margin-top:6px">${sum}</p></div></div>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h3>Your to-do list</h3><span class="small muted">Weekends and company holidays are skipped</span></div>
      ${!open.length ? `<div class="allclear">✓ Nothing to do. New leave requests will add their steps here.</div>` : ""}
      ${group("Do now", "var(--bad)", now)}${group("Next 7 days", "var(--warn)", week)}
      ${later.length ? `<details class="more"><summary>Show ${later.length} later ${later.length === 1 ? "item" : "items"}</summary>${group("Later", "var(--line)", later)}</details>` : ""}
    </section>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h3>Who is out</h3><span class="small muted">${out.length} out today · ${back30.length} back within 30 days</span></div>
        <div class="queue">${active.map((c) => { const d = caseDates(c), s = caseStatus(c), e = emp(c.empId); return `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="person">${avatar(e, "sm")}<div><button class="linkish" data-open="${c.id}">${esc(e.name)}</button><div class="s">${esc(REASONS[c.reason].hr)}${d.end ? ` · <span class="mono">${range(d.start, d.end)}</span>` : ""}</div></div></div>${pill(s.t, s.cls)}</div>`; }).join("") || '<p class="muted">Nobody is out or scheduled.</p>'}</div>
      </section>
      ${log.length ? `<section class="panel"><h3>Recent activity</h3><div class="queue">${log.map((l) => `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t" style="font-weight:500">${esc(l.text)}</div><div class="s">${esc(l.by)}</div></div><span class="small muted mono">${new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</span></div>`).join("")}</div></section>` : ""}
    </div>
  </div>`;
}

/* ---------- HR: Leaves ---------- */
function hrCases() {
  if (UI.caseId) return hrCase(D().cases.find((c) => c.id === UI.caseId));
  const F = UI.leavesFilter || "open", q = (UI.leavesQ || "").toLowerCase();
  const groups = { open: (s) => s.t !== "Returned", past: (s) => s.t === "Returned", all: () => true };
  const shown = D().cases.filter((c) => groups[F](caseStatus(c)) && (!q || emp(c.empId).name.toLowerCase().includes(q)));
  const count = (k) => D().cases.filter((c) => groups[k](caseStatus(c))).length;
  return `<div class="head"><div><h2>Leaves</h2><p>Every request, where it came from, and what is left to do.</p></div><div class="btns"><button class="btn primary" data-tab="plan">Plan a leave</button></div></div>
  <div class="filters"><div class="seg" role="group" aria-label="Show">${[["open", "Current and upcoming"], ["past", "Returned"], ["all", "All"]].map(([k, n]) => `<button data-lfilter="${k}" aria-pressed="${F === k}">${n} <span class="muted">${count(k)}</span></button>`).join("")}</div>
    ${D().cases.length > 8 ? `<input type="search" id="lv-q" placeholder="Find an employee" value="${esc(UI.leavesQ || "")}" aria-label="Find an employee">` : ""}</div>
  <section class="panel"><div class="tw"><table class="cards"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th><th>To do</th></tr></thead><tbody>
  ${shown.map((c) => { const d = caseDates(c), s = caseStatus(c), e = emp(c.empId); const late = c.tasks.filter((t) => !t.done && t.due && t.due <= TODAY).length; const left = c.tasks.filter((t) => !t.done && !t.optional).length;
    return `<tr class="click" data-open="${c.id}" tabindex="0"><td class="full"><div class="person">${avatar(e, "sm")}<div><b>${esc(e.name)}</b><div class="small muted">${esc(e.role)} · from ${{ hr: "HR", employee: "employee", manager: "manager" }[c.source]}</div></div></div></td><td data-l="Type">${esc(REASONS[c.reason].hr)}</td><td data-l="Dates" class="small">${d.end ? `<span class="mono">${range(d.start, d.end)}</span>` : '<span class="muted">Not set yet</span>'}</td><td data-l="Status">${pill(s.t, s.cls)}</td><td data-l="To do">${late ? pill(late + " late", "bad") : left ? pill(left + " open", "") : pill("All done", "ok")}</td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">${D().cases.length ? "Nothing here." : "No leaves yet."}</td></tr>`}
  </tbody></table></div></section>`;
}
/* ---------- EDD filing help ---------- */
const ext = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)} <span aria-hidden="true">↗</span></a>`;
function eddPanel(c, p, mine) {
  const E2 = eddSteps(c, p); if (!E2) return "";
  const done = c.edd || {};
  return `<div class="edd"><div class="label" style="margin-bottom:8px">${mine ? "Getting paid by the state" : `State pay claims · ${esc(first(emp(c.empId).name))}'s checklist`}</div>
    ${!mine ? `<p class="small muted" style="margin:0 0 8px">The employee files these with EDD and ticks them off on their leave page. You can see where they are.</p>` : ""}
    ${E2.claims.map((cl) => { const n = cl.steps.filter((x) => done[x.id]).length;
      return `<div class="claim"><div class="claim-h"><b>${esc(cl.title)}</b><span class="small muted">${n} of ${cl.steps.length} done · file ${fmtS(cl.window.from)} to ${fmtS(cl.window.to)}</span></div>
      <ol class="eddsteps">${cl.steps.map((x) => `<li class="${done[x.id] ? "done" : ""}"><label class="check"><input type="checkbox" data-edd="${c.id}|${x.id}" ${done[x.id] ? "checked" : ""}><span><b>${esc(x.t)}</b><span class="small muted d">${esc(x.d)}${x.link ? ` ${ext(x.link, "EDD page")}` : ""}</span></span></label></li>`).join("")}</ol>
      ${cl.note ? `<p class="small muted">${esc(cl.note)} ${cl.notes ? ext(cl.notes, "EDD pregnancy FAQ") : ""}</p>` : ""}
      <p class="small">${ext(cl.link, "How to file online")} · ${ext(cl.mail, "File by mail instead")}</p></div>`; }).join("")}
  </div>`;
}

/* ---------- Guide: walkthroughs, California leave explainer, which-leave wizard ---------- */
const NEEDS = [
  ["own_health", "My own health", "An illness, injury, surgery or mental health care"],
  ["pregnancy_bonding", "I'm pregnant", "Prenatal care, birth and recovery, then time with the baby"],
  ["bonding", "A new child", "Birth, adoption or foster placement"],
  ["family_care", "Caring for family", "Someone close to me is seriously ill or injured"],
  ["bereavement", "A death in the family", ""],
  ["repro", "A pregnancy loss", "Miscarriage, stillbirth, or a failed adoption, surrogacy or IVF"],
  ["sick", "A sick day or appointment", "For me or a family member"],
  ["other", "Something else", "Vacation, jury duty, moving, a personal day"],
];
function guideView() {
  const hr = S.me.role === "hr", W = UI.wiz;
  if (W && W.step) return wizardView();
  const gifs = [...(hr ? [["hr-setup", "Setting up and running leave as HR"]] : []), ["employee", "Asking for leave as an employee"]];
  return `<div class="head"><div><h2>Guide</h2><p>How Leave Ledger works, and California leave in a few minutes.</p></div></div>
  <section class="panel wiz-start"><h3>Which leave fits me?</h3><p class="muted">Answer two or three questions. You will see what you qualify for, what the state pays, and what to do next, before anything is sent.</p><button class="btn primary" data-wiz-start>Start</button></section>
  <section class="panel"><h3>See it in action</h3><div class="gifs">${gifs.map(([f, t]) => `<figure><img src="/guides/${f}.gif" alt="${esc(t)}" loading="lazy" onerror="this.closest('figure').remove()"><figcaption class="small muted">${esc(t)}</figcaption></figure>`).join("")}</div></section>
  <section class="panel"><h3>California leave in a few minutes</h3>
    <p class="muted">Most California employers with 5 or more employees owe these leaves. The state, not your employer, pays for the longer ones through EDD.</p>
    <div class="leavecards">${LEAVES.map((l) => `<article class="lcard"><h4>${esc(l.title)}</h4><div class="small muted">${esc(l.law)}</div>
      <dl><dt>How long</dt><dd>${esc(l.time)}</dd><dt>Pay</dt><dd>${esc(l.pay)}</dd><dt>Who qualifies</dt><dd>${esc(l.who)}</dd></dl><p class="small">${esc(l.more)}</p></article>`).join("")}</div>
  </section>
  <div class="grid2 even"><section class="panel"><h3>Your rights</h3><ul class="plain">${RIGHTS.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>
  <section class="panel"><h3>Getting paid by the state</h3><p class="small">State Disability Insurance (SDI) pays while you cannot work because of your own health or pregnancy. Paid Family Leave (PFL) pays while you bond with a new child or care for family. Both come from EDD, usually about 70 to 90% of your wages, up to $1,765 a week in 2026.</p>
    <ul class="plain small guide-links"><li>${ext(EDD.diOnline, "How to file for disability pay")}</li><li>${ext(EDD.pflOnline, "How to file for Paid Family Leave")}</li><li>${ext(EDD.pregnancy, "Pregnancy and EDD")}</li><li>${ext(EDD.pay, "What EDD pays")}</li></ul></section></div>`;
}
function wizardView() {
  const W = UI.wiz, me = emp(S.me.empId), co = D().company;
  if (!me) return `<div class="head"><div><button class="linkish" data-wiz-close>← Guide</button><h2 style="margin-top:8px">Which leave fits me?</h2></div></div><section class="panel"><p>Your sign-in is not linked to an employee record yet, so there is nothing to check against. Ask HR to link it on the Users tab.</p></section>`;
  const back = `<button class="btn sm" data-wiz-back>Back</button>`;
  const head = (n, t) => `<div class="head"><div><button class="linkish" data-wiz-close>← Guide</button><h2 style="margin-top:8px">${esc(t)}</h2><p>Step ${n} of 3</p></div></div>`;
  if (W.step === 1) return `${head(1, "What is going on?")}<section class="panel"><div class="choices">${NEEDS.map(([k, t, d]) => `<button class="choice" data-wiz-need="${k}"><b>${esc(t)}</b>${d ? `<span class="small muted">${esc(d)}</span>` : ""}</button>`).join("")}</div></section>`;
  if (W.need === "other") return `${head(2, "That is usually not a protected leave")}<section class="panel"><p>Vacation, jury duty, voting and personal days are not covered by these California leave laws. Jury duty and voting time have their own rules, and vacation follows your company's policy.</p><p class="muted">Ask HR about it directly, or use sick leave if you or a family member are ill.</p><div class="btns">${back}<button class="btn" data-wiz-close>Back to the guide</button></div></section>`;
  const R = REASONS[W.need];
  if (W.step === 2) return `${head(2, "A few details")}<section class="panel" data-form="wiz">
    ${R.rel ? relSelect("wz-rel", R.rel, W.relation) : ""}
    ${W.need === "pregnancy_bonding" ? `<div class="field"><label for="wz-due">Due date</label><input type="date" id="wz-due" data-bind="due" value="${esc(W.due)}"><span class="hint">Doctors usually take you off work up to 4 weeks before the due date, and for 6 weeks after (8 after a cesarean).</span></div>
      <label class="check"><input type="checkbox" data-bind="bond" ${W.bond ? "checked" : ""}>I also want time to bond with the baby after</label>`
      : `<div class="field"><label for="wz-start">First day off</label><input type="date" id="wz-start" data-bind="start" value="${esc(W.start)}"></div>${lengthFields("wz-", { ...W, reason: W.need })}`}
    <div class="btns">${back}<button class="btn primary" data-wiz-next>See what I get</button></div></section>`;
  // Step 3: the plan from the rules engine, for this employee.
  const o = wizOpts(W), p = buildPlan(me, co, W.need, o), prot = p.segs.filter((s) => s.lane === "protect" && s.cls !== "none");
  const fake = { reason: W.need, opts: o, edd: {} }, wba = weeklyBenefit(me, co);
  const E3 = eddSteps(fake, p);
  return `${head(3, "Here is what you would get")}<section class="panel"><div class="panel-h"><h3>${esc(R.emp)}</h3></div>${timelineHTML(p)}
    <ul class="plain">${prot.length ? `<li>Your job is protected from <b>${fmtS(prot[0].start)}</b> to <b>${fmtS(addDays(prot[prot.length - 1].end, -1))}</b>.</li>` : `<li>This time is not job protected by state law. Ask HR about company policy.</li>`}
      ${wba && (p.pays.sdi || p.pays.pfl) ? `<li>The state may pay you about <b>${money(wba.amount)} a week</b>${p.pays.sdi ? ", after a 7-day wait" : ""}. EDD decides the final amount.</li>` : ""}
      ${["own_health", "family_care", "bonding"].includes(W.need) && !p.el.cfra.ok ? `<li>You may not qualify for job-protected family leave yet. It needs 12 months here and 1,250 hours worked in the last year. HR will confirm, and state pay can still apply.</li>` : ""}
      ${W.need === "pregnancy_bonding" && W.bond && !p.el.cfra.ok ? `<li>Your pregnancy leave is protected from day one. Bonding time after it may not be job protected yet, because that needs 12 months and 1,250 hours. State pay can still apply.</li>` : ""}
      ${W.need === "sick" ? `<li>You have about <b>${plural(Math.floor(sickUsable(me)), "hour")}</b> of sick leave you can use now.</li>` : ""}</ul>
    ${E3 ? `<p class="small muted">After you send it, your leave page will walk you through filing with EDD: ${E3.claims.map((x) => `${esc(x.title)}, between ${fmtS(x.window.from)} and ${fmtS(x.window.to)}`).join("; ")}.</p>` : ""}
    <p class="small muted">Nothing is sent yet. On the next screen you can check the request, then send it to HR. Your manager only ever sees the dates.</p>
    <div class="btns">${back}<button class="btn primary" data-wiz-use>Use this for my request</button></div></section>`;
}
function wizOpts(W) {
  if (W.need === "pregnancy_bonding") { const due = W.due || addDays(TODAY, 60); return { start: addDays(due, -28), disWeeks: 10, bondWeeks: W.bond ? 12 : 0, weeks: 4, days: 5, hours: 8, relation: "parent" }; }
  return { start: W.start, weeks: +W.weeks || 4, disWeeks: 10, bondWeeks: 12, days: +W.days || 3, hours: +W.hours || 8, relation: W.relation || "parent" };
}

/* ---------- HR: change dates, mark returned ---------- */
function changePanel(c) {
  const d = caseDates(c), started = c.opts.start <= TODAY;
  return `<section class="panel"><h3>Change this leave</h3>
    <p class="small muted">New dates or length? Steps already done stay done, and open deadlines move with the new plan.</p>
    <div class="field"><label for="ce-start">First day off</label><input type="date" id="ce-start" value="${c.opts.start}"></div>
    ${lengthFields("ce-", { ...c.opts, reason: c.reason })}
    <div class="btns"><button class="btn" data-change="${c.id}">Save new dates</button></div>
    <div class="sendrow">${c.returnedOn
      ? `<p class="small" style="margin:0">Came back on <b>${fmt(c.returnedOn)}</b>.</p><button class="btn sm" data-unreturn="${c.id}">Undo</button>`
      : started ? `<div class="field"><label for="ce-back">Came back to work on</label><input type="date" id="ce-back" value="${TODAY < d.end ? TODAY : d.end}" min="${c.opts.start}" max="${TODAY}"></div><button class="btn" data-returned="${c.id}">Mark returned</button>`
      : `<p class="small muted" style="margin:0">You can mark the return once the leave has started.</p>`}</div>
    <div class="btns" style="justify-content:flex-end"><button class="btn sm danger" data-delete="${c.id}">Delete this leave</button></div>
  </section>`;
}
function readChange() {
  const g = (id) => document.getElementById(id), n = (id) => (g(id) ? +g(id).value : undefined), o = { start: g("ce-start")?.value };
  for (const [id, k] of [["ce-dis", "disWeeks"], ["ce-bond", "bondWeeks"], ["ce-wk", "weeks"], ["ce-dy", "days"], ["ce-hr", "hours"]]) if (g(id)) o[k] = n(id);
  return o;
}

/* ---------- HR: letters ---------- */
function openLetter(caseId, key) {
  const c = D().cases.find((x) => x.id === caseId); if (!c) return;
  const e = emp(c.empId), draft = (c.drafts || {})[key] || draftLetter(key, c, e, D().company, c.reason === "unknown" ? { el: null } : planFor(c), TODAY, S.me.name);
  if (!draft) return;
  UI.letter = { caseId, key, subject: draft.subject, body: draft.body, sentOn: TODAY, method: "email", view: null, saved: !!(c.drafts || {})[key] };
  UI.tab = "cases"; UI.caseId = caseId;
}
const METHODS = { email: "Email", hand: "In person", mail: "Mail", other: "Other" };
function letterPanel(c) {
  const L = UI.letter; if (!L || L.caseId !== c.id) return "";
  const e = emp(c.empId);
  if (L.view != null) {
    const n = (c.notices || [])[L.view]; if (!n) return "";
    return `<section class="panel letter" aria-label="Sent letter"><div class="panel-h"><h3>${esc(n.subject)}</h3><button class="btn sm" data-letter-close>Close</button></div>
      <p class="small muted">Sent to ${esc(e.name)} on ${fmt(n.sentOn)} · ${esc(METHODS[n.method] || n.method)} · by ${esc(n.by)}. ${esc(first(e.name))} can read this copy on their own leave page.</p>
      <div class="letter-text">${esc(n.body)}</div>
      <div class="btns"><button class="btn sm" data-letter-copy>Copy</button><button class="btn sm" data-letter-print>Print</button></div></section>`;
  }
  return `<section class="panel letter" aria-label="Letter to ${esc(e.name)}"><div class="panel-h"><h3>${esc(LETTERS[L.key])} · to ${esc(e.name)}</h3><button class="btn sm" data-letter-close>Close</button></div>
    <p class="small muted">A first draft from the details of this leave. Read it, change anything that is not right, then send it by email or print it. Leave Ledger does not send it for you yet.</p>
    <div class="field"><label for="lt-subject">Subject</label><input type="text" id="lt-subject" value="${esc(L.subject)}" maxlength="200"></div>
    <div class="field"><label for="lt-body">Letter</label><textarea id="lt-body" class="letter-edit" rows="18">${esc(L.body)}</textarea></div>
    <div class="btns"><button class="btn sm" data-letter-save>${L.saved ? "Save changes" : "Save draft"}</button><button class="btn sm" data-letter-copy>Copy</button><button class="btn sm" data-letter-print>Print</button><button class="btn sm" data-letter-reset>Start over</button></div>
    <div class="sendrow"><div class="field"><label for="lt-on">Sent on</label><input type="date" id="lt-on" value="${esc(L.sentOn)}" max="${TODAY}"></div>
      <div class="field"><label for="lt-how">How</label><select id="lt-how">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${L.method === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <button class="btn primary" data-letter-send>Mark as sent</button></div>
    <p class="small muted">Marking it sent completes this step, keeps a copy on the leave, and shows it to ${esc(first(e.name))}.</p></section>`;
}
function lettersSent(c) {
  const list = c.notices || []; if (!list.length) return "";
  return `<section class="panel"><h3>Letters sent</h3><div class="queue">${list.map((n, i) => `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t" style="font-weight:500">${esc(n.subject)}</div><div class="s">${fmt(n.sentOn)} · ${esc(METHODS[n.method] || n.method)}</div></div><button class="btn sm" data-letter-view="${c.id}|${i}">View</button></div>`).reverse().join("")}</div></section>`;
}
function readLetterFields() {
  const L = UI.letter; if (!L) return;
  const g = (id) => document.getElementById(id);
  if (g("lt-subject")) L.subject = g("lt-subject").value;
  if (g("lt-body")) L.body = g("lt-body").value;
  if (g("lt-on")) L.sentOn = g("lt-on").value || TODAY;
  if (g("lt-how")) L.method = g("lt-how").value;
}
function letterText() {
  const L = UI.letter, c = D().cases.find((x) => x.id === L.caseId);
  if (L.view != null) { const n = c.notices[L.view]; return { subject: n.subject, body: n.body }; }
  return { subject: L.subject, body: L.body };
}
function printLetter() {
  const { subject, body } = letterText();
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title><style>body{font:12pt/1.5 Georgia,serif;margin:1in;color:#000}pre{white-space:pre-wrap;font:inherit}</style></head><body><pre>${esc(body)}</pre></body></html>`); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1000); }, 50);
}

function hrCase(c) {
  if (!c) { UI.caseId = null; return hrCases(); }
  const e = emp(c.empId), s = caseStatus(c);
  const items = c.tasks.map((t) => taskRow(c, t, false)).join("");
  let body;
  if (c.reason === "unknown") {
    const CV = UI.conv.caseId === c.id ? UI.conv : { draft: null }, cd = CV.draft && CV.draft.reason !== "unclear" ? CV.draft : null;
    body = `<section class="panel"><h3>What kind of leave is this?</h3><p class="muted small">${esc(emp(e.mgr)?.name || "A manager")} flagged this on ${fmt(c.requested)}${c.notes ? `: “${esc(c.notes)}”` : ""}. Talk with ${esc(first(e.name))}, then pick the leave type to see the plan and the notices you owe.</p>
      ${S.ai.on && c.notes ? `<div class="btns"><button class="btn" data-suggest="${c.id}" ${CV.busy ? "disabled" : ""}>✦ ${CV.busy ? "Reading the note" : "Suggest from the manager's note"}</button></div>` : ""}
      ${CV.error ? `<p class="err">${esc(CV.error)}</p>` : ""}${CV.draft ? `<div class="cp-note">${CV.draft.reason === "unclear" ? "The note does not say enough to tell. Ask the employee." : `<b>Clerk suggests:</b> ${esc(describeDraft(CV.draft))}. Check it before saving.`}</div>` : ""}
      <div class="row"><div class="field"><label for="cv-reason">Leave type</label><select id="cv-reason">${reasonOptions(cd ? cd.reason : "own_health", "hr")}</select></div><div class="field"><label for="cv-start">Start date</label><input type="date" id="cv-start" value="${cd && cd.start ? cd.start : addDays(TODAY, 7)}"></div></div>
      <div class="btns"><button class="btn primary" data-convert="${c.id}">Set leave type</button></div></section>`;
  } else {
    const p = planFor(c);
    body = `${intakePanel(c, e)}<section class="panel"><div class="panel-h"><h3>The plan</h3><span class="small muted">${esc(REASONS[c.reason].hr)}${c.opts.relation && REASONS[c.reason].rel ? " · " + esc(relName(c.opts.relation)) : ""}</span></div>${timelineHTML(p)}${payHTML(p)}</section>
    ${eddSteps(c, p) ? `<section class="panel">${eddPanel(c, p, false)}</section>` : ""}
    <section class="panel"><h3>Does ${esc(first(e.name))} qualify?</h3>${eligHTML(p, c.reason)}${factsHTML(p)}</section>`;
  }
  return `<div class="head"><div><button class="linkish" data-back>← All leaves</button><div class="person" style="margin-top:10px">${avatar(e, "lg")}<div><h2>${esc(e.name)}</h2><p class="muted">${esc(e.role)} · hired ${fmt(e.hire)} · asked ${fmt(c.requested)}</p></div></div></div>${pill(s.t, s.cls)}</div>
  <div class="grid2"><div class="stack">${letterPanel(c)}${body}</div>
  <div class="stack">${approvalPanel(c)}<section class="panel"><h3>Steps for HR</h3><div class="queue">${items}</div></section>
  ${lettersSent(c)}
  <section class="panel"><h3>Manager's coverage plan</h3><p class="small ${c.coverage ? "" : "muted"}">${esc(c.coverage || "Nothing yet. The manager adds this from their own view.")}</p></section>
  <section class="panel"><div class="field"><label for="hrnote">Private HR notes</label><textarea id="hrnote" data-casenote="${c.id}" placeholder="Only HR sees this. Saves when you click away.">${esc(c.hrNote || "")}</textarea></div></section>
  ${c.reason === "unknown" ? `<section class="panel"><div class="btns"><button class="btn sm danger" data-delete="${c.id}">Delete this leave</button></div></section>` : changePanel(c)}</div></div>`;
}

/* ---------- HR: Plan a leave ---------- */
function hrPlan() {
  const f = UI.planner, e = emp(f.empId), R = REASONS[f.reason];
  const p = buildPlan(e, D().company, f.reason, optsFrom(f));
  return `<div class="head"><div><h2>Plan a leave</h2><p>Pick an employee and a reason. You will see every leave they qualify for, what the state pays, and the notices you owe, before anything is saved.</p></div></div>
  <div class="grid2 form">
    <section class="panel" data-form="planner">
      <div class="field"><label for="pl-emp">Employee</label><select id="pl-emp" data-bind="empId">${D().employees.map((x) => `<option value="${x.id}" ${x.id === f.empId ? "selected" : ""}>${esc(x.name)} · ${esc(x.role)}</option>`).join("")}</select></div>
      <div class="field"><label for="pl-reason">Reason</label><select id="pl-reason" data-bind="reason">${reasonOptions(f.reason, "hr")}</select></div>
      ${R.rel ? relSelect("pl-rel", R.rel, f.relation) : ""}
      <div class="field"><label for="pl-start">${f.reason === "bereavement" ? "First day off" : "Start date"}</label><input type="date" id="pl-start" value="${f.start}" data-bind="start"></div>
      ${lengthFields("pl-", f)}
      <div class="btns"><button class="btn primary" data-createcase>Save and start the clock</button></div>
      <p class="small muted">Saving records today as the request date. The 5 business day deadline for the first notice starts now.</p>
    </section>
    <div class="stack">
      <section class="panel"><div class="panel-h"><div class="person">${avatar(e)}<h3>${esc(e.name)}</h3></div><span class="small muted">Back to work ${fmt(p.end)}</span></div>${timelineHTML(p)}${payHTML(p)}</section>
      <section class="panel"><h3>Does ${esc(first(e.name))} qualify?</h3>${eligHTML(p, f.reason)}${factsHTML(p)}</section>
    </div>
  </div>`;
}

/* ---------- HR: Employees ---------- */
/* ---------- HR: import employees from a file ---------- */
function importPanel() {
  const I = UI.imp, co = D().company, emps = D().employees;
  const mgrName = (r) => { const m = r.data.mgr; if (m === undefined) return r.data.mgrName || r.data.mgrEmail ? "Unchanged" : ""; if (m === null) return "None"; if (String(m).startsWith("row:")) { const x = I.rows.find((y) => "row:" + y.line === m); return x ? x.data.name : ""; } return emp(m)?.name || ""; };
  const n = (k) => (I.rows || []).filter((r) => r.action === k).length;
  const pillFor = { add: pill("New", "ok"), update: pill("Update", "acc"), skip: pill("Not imported", "bad") };
  return `<section class="panel" data-form="imp"><div class="panel-h"><h3>Import employees</h3><button class="btn sm" data-imp-close>Close</button></div>
    <div class="imp-hris"><div><b>Connect your HR or payroll system</b><p class="small muted" style="margin:2px 0 0">Automatic sync is on the way, so new hires, managers and hours stay current without uploads. Which one do you use?</p></div>
      <select aria-label="Your HR or payroll system" data-co="hris"><option value="">Choose one</option>${HR_SYSTEMS.map((h) => `<option ${co.hris === h ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></div>
    ${co.hris ? `<p class="small muted">Thanks. We will let you know when ${esc(co.hris)} sync is ready. Until then, upload a file.</p>` : ""}
    <div class="note-box">Made-up details only for now, as agreed when this workspace was set up. Real employee information comes after our security review.</div>
    <ol class="imp-steps">
      <li><b>Download the template</b> and fill in one row per employee. Most HR and payroll systems can export these columns.
        <div class="btns" style="margin-top:8px"><button class="btn" data-imp-template>Download template (CSV)</button></div>
        <details class="more"><summary class="small">What each column means</summary><table class="cols small"><tbody>${COLUMNS.map((c) => `<tr><td><code>${c.label}</code>${c.req ? " <b>required</b>" : ""}</td><td>${esc(c.help)}</td></tr>`).join("")}</tbody></table></details></li>
      <li><b>Upload it.</b> Save from Excel or Google Sheets as CSV. Employees already here are matched by email and updated; nobody is removed.
        <div class="field" style="margin-top:8px"><input type="file" id="imp-file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-imp-file aria-label="Employee file"></div>
        <details class="more"><summary class="small">Or paste rows copied from a spreadsheet</summary><textarea id="imp-paste" rows="5" placeholder="Copy the header row and the employee rows, then paste here"></textarea><div class="btns"><button class="btn sm" data-imp-paste>Check these rows</button></div></details></li>
    </ol>
    ${I.error ? `<p class="err" role="alert">${esc(I.error)}</p>` : ""}
    ${I.rows ? `<div class="imp-sum"><b>${esc(I.file || "Pasted rows")}</b>: ${plural(n("add"), "new employee")}, ${plural(n("update"), "update")}${n("skip") ? `, <span class="bad-t">${plural(n("skip"), "row")} with problems</span>` : ""}.</div>
      <div class="tw"><table class="cards"><thead><tr><th>Row</th><th>Employee</th><th>Hired</th><th>Manager</th><th>Result</th></tr></thead><tbody>
      ${I.rows.map((r) => `<tr><td data-l="Row" class="small mono">${r.line}</td><td class="full"><b>${esc(r.data.name || "(no name)")}</b><div class="small muted">${esc(r.data.email || "")}${r.data.role ? " · " + esc(r.data.role) : ""}</div></td><td data-l="Hired" class="small">${r.data.hire ? fmt(r.data.hire) : ""}</td><td data-l="Manager" class="small">${esc(mgrName(r))}</td>
        <td class="full">${pillFor[r.action]}${[...r.errors.map((x) => `<div class="small bad-t">${esc(x)}</div>`), ...r.warnings.map((x) => `<div class="small muted">${esc(x)}</div>`)].join("")}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="btns"><button class="btn primary" data-imp-go ${n("add") + n("update") && !I.busy ? "" : "disabled"}>Import ${plural(n("add") + n("update"), "employee")}</button><span class="small muted">Rows with problems are left out. Fix them and upload again.</span></div>` : ""}
  </section>`;
}
function readRoster(text, name) {
  const t = parseTable(text);
  if (!t.header.length) { UI.imp = { ...UI.imp, rows: null, error: "That file is empty." }; return; }
  if (t.missing.length) { UI.imp = { ...UI.imp, rows: null, error: `The file needs these columns: ${t.missing.join(", ")}. Start from the template.` }; return; }
  if (!t.rows.length) { UI.imp = { ...UI.imp, rows: null, error: "The file has a header row but no employees." }; return; }
  if (t.rows.length > 1000) { UI.imp = { ...UI.imp, rows: null, error: "That is more than 1,000 rows. Split it into smaller files." }; return; }
  UI.imp = { ...UI.imp, raw: t.rows, rows: checkRows(t.rows, D().employees, TODAY), file: name, error: "" };
}

/* ---------- HR: approve a leave and tell the manager ---------- */
function approvalPanel(c) {
  if (c.reason === "unknown") return "";
  const e = emp(c.empId), m = e.mgr ? emp(e.mgr) : null, d = caseDates(c), sent = c.mgrNotices || [], last = sent[sent.length - 1];
  const how = (n) => n.delivery === "email" ? `by email${n.toEmail ? " to " + esc(n.toEmail) : ""}` : n.delivery === "failed" ? "in Leave Ledger (the email did not go through)" : "on their My team page";
  const viewList = sent.length ? `<details class="more"><summary class="small">Messages to ${esc(m ? first(m.name) : "the manager")} (${sent.length})</summary>${sent.slice().reverse().map((n) => `<div class="small muted" style="margin-top:8px">${fmt(n.sentOn)} · ${how(n)}</div><div class="letter-text">${esc(n.subject)}\n\n${esc(n.body)}</div>`).join("")}</details>` : "";
  if (c.approvedOn) {
    const moved = last && (last.start !== d.start || last.end !== d.end);
    return `<section class="panel"><div class="panel-h"><h3>Approved</h3>${pill("Approved " + fmtS(c.approvedOn), "ok")}</div>
      <p class="small" style="margin:0">${esc(c.approvedBy || "HR")} approved this on ${fmt(c.approvedOn)}.${last ? ` ${esc(first(m ? m.name : "The manager"))} was told the dates ${fmt(last.sentOn)}, ${how(last)}.` : m ? ` ${esc(m.name)} has not been told the dates.` : ""}</p>
      ${m && (moved || !last) ? `<div class="infobox" style="margin-top:8px">${moved ? `The dates changed after ${esc(first(m.name))} was told.` : ""} <button class="btn sm" data-appr-open="${c.id}" data-appr-kind="update">${last ? "Send the new dates" : "Tell the manager the dates"}</button></div>` : ""}
      ${UI.appr.caseId === c.id ? approveForm(c, e, m, "update") : ""}${viewList}</section>`;
  }
  return `<section class="panel appr"><h3>Approve this leave</h3>
    ${UI.appr.caseId === c.id ? approveForm(c, e, m, "approved") : `<p class="small muted" style="margin:0 0 8px">When you approve, ${m ? `${esc(m.name)} gets the dates and nothing else: not the reason, the type of leave, pay or anything medical.` : "you can tell the manager the dates. No manager is on file yet; pick one on the Employees tab."}</p><button class="btn primary" data-appr-open="${c.id}" data-appr-kind="approved">Approve</button>`}</section>`;
}
function approveForm(c, e, m, kind) {
  const A = UI.appr, d = caseDates(c), P = planFor(c);
  const msg = m ? managerNotice(kind, { emp: e, mgr: m, co: D().company, start: d.start, end: d.end, protectedLeave: P.segs.some((x) => x.lane === "protect" && x.cls !== "none"), hr: S.me.name, note: A.note.trim() }) : null;
  const bad = sensitiveNote(A.note);
  const delivery = !m ? "" : S.space.kind !== "org" ? `Sample data: ${esc(first(m.name))} reads this on their My team page. No real email is sent.`
    : S.mail && S.mail.on ? (m.email ? `Emailed to ${esc(m.email)} and shown on ${esc(first(m.name))}'s My team page.` : `${esc(m.name)} has no email on file, so this shows on their My team page only.`)
    : `Email sending is not set up yet, so ${esc(first(m.name))} reads this on their My team page.`;
  return `<div class="appr-form">
    ${m ? `${kind === "approved" ? `<label class="check"><input type="checkbox" id="ap-notify" ${A.notify ? "checked" : ""}> Tell ${esc(m.name)} the dates</label>` : ""}
      ${kind === "update" || A.notify ? `<div class="mailprev"><div class="small muted">To: ${esc(m.name)}${m.email ? ` &lt;${esc(m.email)}&gt;` : ""}</div><div class="small"><b>${esc(msg.subject)}</b></div><div class="letter-text">${esc(msg.body)}</div></div>
      <div class="field"><label for="ap-note">Add a note (optional)</label><textarea id="ap-note" rows="2" maxlength="400" placeholder="For example: A temp starts Monday. I will send you the agency contact.">${esc(A.note)}</textarea><span class="hint ${bad ? "bad-t" : ""}">${bad ? `Take out "${esc(bad)}". The manager may know the dates, not the reason.` : "Keep it to logistics. No reason, health or family details."}</span></div>
      <p class="small muted">${delivery}</p>` : ""}` : `<p class="small muted">No manager on file, so nobody is told. You can pick a manager on the Employees tab and send the dates later.</p>`}
    <div class="btns"><button class="btn" data-appr-cancel>Cancel</button><button class="btn primary" data-appr-go="${c.id}" data-appr-kind="${kind}" ${bad ? "disabled" : ""}>${kind === "approved" ? (m && A.notify ? "Approve and tell the manager" : "Approve") : "Send the new dates"}</button></div></div>`;
}

// Updates the preview while HR types the note, without re-rendering (which would drop focus and the next click).
function refreshApproval() {
  const box = document.querySelector(".appr-form"), go = box && box.querySelector("[data-appr-go]"); if (!go) return;
  const c = D().cases.find((x) => x.id === go.dataset.apprGo), e = emp(c.empId), m = e.mgr ? emp(e.mgr) : null; if (!m) return;
  const d = caseDates(c), P = planFor(c), bad = sensitiveNote(UI.appr.note);
  const msg = managerNotice(go.dataset.apprKind, { emp: e, mgr: m, co: D().company, start: d.start, end: d.end, protectedLeave: P.segs.some((x) => x.lane === "protect" && x.cls !== "none"), hr: S.me.name, note: UI.appr.note.trim() });
  const lt = box.querySelector(".mailprev .letter-text"); if (lt) lt.textContent = msg.body;
  const h = box.querySelector("#ap-note + .hint"); if (h) { h.textContent = bad ? `Take out "${bad}". The manager may know the dates, not the reason.` : "Keep it to logistics. No reason, health or family details."; h.classList.toggle("bad-t", !!bad); }
  go.disabled = !!bad;
}

function addEmployeePanel() {
  const A = UI.addEmp, emps = D().employees;
  if (UI.imp.open) return importPanel();
  if (!A.open) return `<div class="btns"><button class="btn primary" data-addemp-open>Add an employee</button><button class="btn" data-imp-open>Import from a file</button></div>`;
  return `<section class="panel" data-form="addEmp"><h3>Add an employee</h3>
    <div class="note-box">Made-up details only for now. Do not enter real employee names or health information.</div>
    <div class="row"><div class="field"><label for="ae-name">Name</label><input type="text" id="ae-name" data-bind="name" value="${esc(A.name)}" maxlength="80"></div>
      <div class="field"><label for="ae-email">Work email</label><input type="email" id="ae-email" data-bind="email" value="${esc(A.email)}" maxlength="120"></div>
      <div class="field"><label for="ae-role">Job title</label><input type="text" id="ae-role" data-bind="role" value="${esc(A.role)}" maxlength="80"></div>
      <div class="field"><label for="ae-hire">Hire date</label><input type="date" id="ae-hire" data-bind="hire" value="${esc(A.hire || addDays(TODAY, -365))}" max="${TODAY}"></div></div>
    <div class="row"><div class="field"><label for="ae-h">Hours worked, last 12 months</label><input type="number" id="ae-h" data-bind="hours12" data-num value="${A.hours12}"><span class="hint">1,250 or more is needed for family leave.</span></div>
      <div class="field"><label for="ae-s">Sick hours available</label><input type="number" id="ae-s" data-bind="sick" data-num value="${A.sick}"></div>
      <div class="field"><label for="ae-q">Wages in highest quarter ($)</label><input type="number" id="ae-q" data-bind="hiQuarter" data-num value="${A.hiQuarter}"><span class="hint">Used for the state pay estimate.</span></div></div>
    <div class="row"><div class="field"><label for="ae-sh">Usual shift (hours)</label><input type="number" id="ae-sh" data-bind="shiftHours" data-num min="1" max="24" value="${A.shiftHours}"><span class="hint">Sets the yearly sick leave limit: 40 hours or 5 shifts, whichever is more.</span></div>
      <div class="field"><label for="ae-wh">Hours a week</label><input type="number" id="ae-wh" data-bind="weeklyHours" data-num min="1" max="80" value="${A.weeklyHours}"><span class="hint">Part-time employees get pregnancy leave in proportion to their hours.</span></div></div>
    <div class="field"><label for="ae-mgr">Manager</label><select id="ae-mgr" data-bind="mgr"><option value="">None</option>${emps.map((e) => `<option value="${e.id}" ${A.mgr === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
    ${A.error ? `<p class="err" role="alert">${esc(A.error)}</p>` : ""}
    <div class="btns"><button class="btn" data-addemp-cancel>Cancel</button><button class="btn primary" data-addemp>Add employee</button></div>
  </section>`;
}
function hrEmployees() {
  const co = D().company, org = CAP("editEmployees"), emps = D().employees;
  const mgrSel = (e) => `<select aria-label="Manager for ${esc(e.name)}" data-emp="${e.id}|mgr"><option value="">None</option>${emps.filter((x) => x.id !== e.id).map((x) => `<option value="${x.id}" ${e.mgr === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`;
  return `<div class="head"><div><h2>Employees</h2><p>Who qualifies for what, as of today. Hours and sick balances come from payroll; change them right here.</p></div></div>
  ${org ? addEmployeePanel() : ""}
  <section class="panel"><div class="tw"><table class="cards"><thead><tr><th>Employee</th><th>Hired</th><th class="num">Hours, last 12 months</th><th class="num">Family leave left</th><th class="num">Sick hours</th><th class="num">Schedule</th><th>Qualifies today for</th>${org ? "<th>Manager</th><th></th>" : ""}</tr></thead><tbody>
  ${D().employees.map((e) => { const el = eligibility(e, co, TODAY); const q = [["Family leave", el.cfra.ok], ...(el.fmla.covered ? [["FMLA", el.fmla.ok]] : []), ...(D().cases.some((c) => c.empId === e.id && c.reason === "pregnancy_bonding") ? [["Pregnancy leave", el.pdl.ok]] : []), ["Bereavement", el.short.ok], ["Sick leave", el.sick.ok]];
    return `<tr><td class="full"><div class="person">${avatar(e, "sm")}<div><b>${esc(e.name)}</b><div class="small muted">${esc(e.role)}${e.email ? ` · ${esc(e.email)}` : ""}</div></div></div></td><td data-l="Hired" class="small mono">${org ? `<input type="date" aria-label="Hire date for ${esc(e.name)}" data-emp="${e.id}|hire" value="${e.hire}" max="${TODAY}">` : fmt(e.hire)}</td>
  <td data-l="Hours, 12 mo" class="num"><input type="number" aria-label="Hours worked in the last 12 months for ${esc(e.name)}" id="h-${e.id}" data-emp="${e.id}|hours12" value="${e.hours12}" style="width:90px;text-align:right">${e.hoursEst ? `<div class="small muted">Estimated. Check payroll</div>` : ""}</td>
  <td data-l="Family leave left" class="num">${el.cfra.ok ? plural(el.cfra.remaining, "week") : '<span class="muted">Not yet</span>'}</td>
  <td data-l="Sick hours" class="num"><input type="number" aria-label="Sick hours for ${esc(e.name)}" id="s-${e.id}" data-emp="${e.id}|sick" value="${e.sick}" style="width:72px;text-align:right"></td>
  <td data-l="Schedule" class="num small"><div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;white-space:nowrap"><input type="number" aria-label="Usual shift hours for ${esc(e.name)}" data-emp="${e.id}|shiftHours" value="${shiftOf(e)}" min="1" max="24" style="width:52px;text-align:right"> h/day <input type="number" aria-label="Hours a week for ${esc(e.name)}" data-emp="${e.id}|weeklyHours" value="${weeklyOf(e)}" min="1" max="80" style="width:56px;text-align:right"> h/wk</div></td>
  <td class="full"><div class="btns" style="gap:4px">${q.map(([n, ok]) => pill((ok ? "✓ " : "✕ ") + n, ok ? "ok" : "")).join("")}</div></td>${org ? `<td data-l="Manager">${mgrSel(e)}</td><td>${e.id === S.me.empId ? "" : `<button class="btn sm" data-emp-remove="${e.id}">Remove</button>`}</td>` : ""}</tr>`; }).join("")}
  </tbody></table></div><p class="small muted">Sick leave builds up at 1 hour for every 30 worked. You can cap the balance at 80 hours or 10 days, and yearly use at 40 hours or 5 days, whichever is more for each employee's usual shift. Pregnancy leave is available to any employee from their first day; it shows here once someone takes it.</p></section>`;
}

/* ---------- HR: Settings ---------- */
function copilotStats() {
  const L = (D().intakeLog || []).filter((x) => x.ai), u = D().aiUsage || {}, mk = TODAY.slice(0, 7), m = (u.month || {})[mk];
  const clean = L.filter((x) => !x.changed.length).length;
  const byField = ["reason", "relation", "start", "length"].map((k) => [k, L.filter((x) => x.changed.includes(k)).length]);
  const haiku = /haiku-5-5/.test(S.ai.model || "");
  const cost = m && haiku ? (m.input * 0.10 + m.output * 0.50) / 1e6 : null;
  return `<h3>✦ Clerk intake</h3>
    ${S.ai.on ? `<p class="small">On · model <code>${esc(S.ai.model)}</code>. Employees can describe their need in their own words and Clerk fills in the request form. It never decides eligibility.</p>` : `<div class="infobox">Off. Add <code>ANTHROPIC_API_KEY</code> in Netlify, under Site configuration, Environment variables, then redeploy.</div>`}
    <div class="balance">
      <div><span class="label">Requests this month</span><span class="v">${m ? m.requests : 0}</span><span class="small muted">${m && m.requests ? `${Math.round(m.ms / m.requests / 100) / 10}s average` : "None yet"}</span></div>
      <div><span class="label">Sent without changes</span><span class="v">${L.length ? Math.round((clean / L.length) * 100) + "%" : "n/a"}</span><span class="small muted">${clean} of ${L.length} sent requests</span></div>
      <div><span class="label">AI cost this month</span><span class="v">${cost !== null ? "$" + cost.toFixed(cost < 1 ? 4 : 2) : "n/a"}</span><span class="small muted">${haiku ? "At Haiku 5.5 list price" : "Model price not tracked"}</span></div>
    </div>
    ${L.length ? `<p class="small muted">Fixes users made before sending: ${byField.map(([k, n]) => `${FIELD_NAMES[k]} ${n}`).join(" · ")}. Each fix is a test case for the golden dataset.</p>
    <details class="more"><summary>Show the last ${Math.min(10, L.length)} intakes</summary><div class="tw"><table><thead><tr><th>When</th><th>Their words</th><th>Clerk read</th><th>Sent as</th></tr></thead><tbody>${L.slice(0, 10).map((x) => `<tr><td class="small mono">${new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}</td><td class="small">${esc(x.text.length > 90 ? x.text.slice(0, 90) + "…" : x.text)}</td><td class="small">${esc(REASONS[x.ai.reason]?.hr || "Not sure")}${x.ai.flag ? " ⚑" : ""}</td><td class="small">${esc(REASONS[x.final.reason]?.hr || x.final.reason)}${x.changed.length ? `<div class="muted">fixed: ${esc(x.changed.map((k) => FIELD_NAMES[k]).join(", "))}</div>` : ""}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}
function hrSettings() {
  const co = D().company;
  return `<div class="head"><div><h2>Settings</h2><p>The number of employees decides which laws apply. ${ORG() ? "Changes here apply to everyone in this workspace." : SAMPLE() ? "Changes here apply only to your copy of the sample company. Try 50 employees to see federal FMLA switch on." : "Changes here apply to every test account."}</p></div></div>
  <section class="panel"><h3>Laws that apply to ${esc(co.name)}</h3><div class="lawlist">${lawRows().map(([n, ab, on, what, when]) => `<div><div><b>${n}</b>${ab ? ` <span class="muted small">${ab}</span>` : ""}<div class="why">${what}${!on && when ? ` ${when}.` : ""}</div></div>${on ? pill("Applies", "ok") : pill("Not yet", "")}</div>`).join("")}</div></section>
  <div class="grid2 even"><section class="panel"><h3>Company</h3>
    <div class="field"><label for="co-name">Company name</label><input type="text" id="co-name" value="${esc(co.name)}" data-co="name"></div>
    <div class="field"><label for="co-hc">Number of employees</label><input type="number" id="co-hc" min="1" value="${co.headcount}" data-co="headcount" data-num><span class="hint">Count everyone, full and part time. Try 50 to see federal FMLA switch on.</span></div>
    <label class="check"><input type="checkbox" id="co-75" ${co.within75 ? "checked" : ""} data-co="within75">At least 50 employees work within 75 miles of each other</label>
    <div class="field"><label for="co-hol">Company holidays</label><input type="text" id="co-hol" value="${esc(co.holidays.join(", "))}" data-co="holidays"><span class="hint">Dates as yyyy-mm-dd, separated by commas. Deadlines skip these days.</span></div>
  </section><section class="panel">
    <h3>State pay estimates</h3>
    <div class="row"><div class="field"><label for="co-max">Weekly maximum</label><input type="number" id="co-max" value="${co.wbaMax}" data-co="wbaMax" data-num><span class="hint">$1,765 for 2026 claims</span></div>
    <div class="field"><label for="co-band">90% rate applies up to</label><input type="number" id="co-band" value="${co.band90}" data-co="band90" data-num><span class="hint">Highest quarter wages. $16,279.90 for 2026 claims. Above it the state pays a flat amount, then 70%.</span></div></div>
    <div class="infobox">Lower earners get about 90% of weekly wages, a middle band gets a flat amount, and higher earners get about 70%, up to the weekly maximum. The state makes the final calculation.</div>
    ${CAP("clerkStats") ? copilotStats() : ""}
    ${CAP("clearLeaves") ? `<h3>Start over</h3>
    <p class="small muted">Deletes every leave in this workspace. Employees and users stay.</p>
    <div class="btns"><button class="btn" data-clear>Clear all leaves</button></div>` : ""}
    ${CAP("reset") ? `<h3>${SAMPLE() ? "Start over" : "Test data"}</h3>
    <p class="small muted">${SAMPLE() ? "Puts the sample company back in your copy. Anything you added or changed is removed." : "Puts the sample company, employees and leaves back for every test account. Anything added since is removed."}</p>
    <div class="btns"><button class="btn" data-reset>Reset to sample data</button></div>` : ""}
  </section></div>`;
}

/* ---------- Employee ---------- */
function previewHTML(p, reason) {
  const prot = p.segs.filter((s) => s.lane === "protect" && s.cls !== "none");
  const unprot = p.segs.filter((s) => s.lane === "protect" && s.cls === "none");
  const paid = p.segs.filter((s) => ["sdi", "pfl", "sick"].includes(s.cls));
  const unpaid = p.segs.filter((s) => s.cls === "unpaid");
  const rows = [];
  if (prot.length) rows.push(["Your job is protected", range(prot[0].start, prot[prot.length - 1].end)]);
  if (unprot.length) rows.push(["Not job protected", range(unprot[0].start, unprot[unprot.length - 1].end)]);
  paid.forEach((s) => rows.push([s.cls === "sick" ? "Paid from sick leave" : s.label, s.cls === "sick" ? s.sub : (p.wba ? `about ${money(p.wba.amount)}/week` : "from the state")]));
  if (unpaid.length && !paid.length) rows.push(["Pay", "Unpaid unless you use sick leave or vacation"]);
  else if (unpaid.length) rows.push(["Unpaid", range(unpaid[0].start, unpaid[unpaid.length - 1].end)]);
  return `<div class="preview" aria-live="polite"><b>What you would get</b>${rows.map(([k, v]) => `<div class="row2"><span class="k">${esc(k)}</span><span class="mono">${esc(v)}</span></div>`).join("")}${p.warnings.length ? `<span class="small muted">HR will go over a few details with you.</span>` : ""}</div>`;
}
function empView() {
  const e = emp(S.me.empId), co = D().company, el = eligibility(e, co, TODAY), f = UI.req, R = REASONS[f.reason];
  const mine = D().cases.filter((c) => c.empId === e.id && c.reason !== "unknown");
  const avail = sickUsable(e);
  const wba = weeklyBenefit(e, co);
  const p = buildPlan(e, co, f.reason, optsFrom(f));
  return `<div class="head"><div class="person">${avatar(e, "lg")}<div><h2 class="greet">Hi ${esc(first(e.name))}</h2><p class="muted">Your time off, your requests, and what to do next.</p></div></div></div>
  <section class="panel"><h3>What you have</h3><div class="balance">
    <div><span class="label">Sick leave</span><span class="v">${e.sick} hours</span><div class="meter"><span style="width:${Math.min(100, (e.sick / sickBalanceCap(e)) * 100)}%"></span></div><span class="small muted">${avail} you can use this year</span></div>
    <div><span class="label">Family and medical leave</span><span class="v">${el.cfra.ok ? plural(el.cfra.remaining, "week") : "Not yet"}</span><div class="meter"><span style="width:${el.cfra.ok ? (el.cfra.remaining / 12) * 100 : 0}%"></span></div><span class="small muted">${el.cfra.ok ? "Your job is held for you" : "After 12 months and 1,250 hours"}</span></div>
    ${mine.some((c) => c.reason === "pregnancy_bonding") ? `<div><span class="label">Pregnancy leave</span><span class="v">Up to 4 months</span><span class="small muted">From your first day</span></div>` : ""}
    <div><span class="label">Bereavement</span><span class="v">${el.short.ok ? "5 days" : "After 30 days"}</span><span class="small muted">For each family loss</span></div>
    <div><span class="label">State pay while out</span><span class="v">${wba ? "~" + money(wba.amount) + "/wk" : "Ask HR"}</span><span class="small muted">Paid by the state, not your employer</span></div>
  </div></section>
  ${(() => {
    // Someone with a current leave sees it first; the request form waits behind a button.
    const current = mine.filter((c) => caseStatus(c).t !== "Returned"), past = mine.filter((c) => caseStatus(c).t === "Returned");
    const form = reqForm(f, R, p);
    if (!current.length) return `<div class="grid2"><div class="stack">${past.length ? past.map((c) => empCase(c)).join("") : `<section class="panel"><h3>No time off requested</h3><p class="muted">When you need time off, fill in the form. You will see what you qualify for before you send it, and HR replies within 5 business days.</p></section>`}</div>${form}</div>`;
    return `<div class="stack">${current.map((c) => empCase(c)).join("")}
      ${UI.reqOpen ? form : `<section class="panel"><div class="panel-h"><h3>Need more time off?</h3><button class="btn" data-req-open>Ask for time off</button></div></section>`}
      ${past.length ? `<details class="more"><summary>Past leaves (${past.length})</summary><div class="stack" style="margin-top:10px">${past.map((c) => empCase(c)).join("")}</div></details>` : ""}</div>`;
  })()}`;
}
function reqForm(f, R, p) {
  return `<section class="panel" data-form="req"><div class="panel-h"><h3>Ask for time off</h3>${UI.reqOpen ? `<button class="btn sm" data-req-close>Close</button>` : ""}</div>
      ${S.ai.on ? copilotBox() : ""}
      <div class="field"><label for="rq-reason">What is it for?</label><select id="rq-reason" data-bind="reason">${reasonOptions(f.reason, "emp")}</select></div>
      ${R.rel ? relSelect("rq-rel", R.rel, f.relation) : ""}
      <div class="field"><label for="rq-start">First day off</label><input type="date" id="rq-start" value="${f.start}" data-bind="start"></div>
      ${lengthFields("rq-", f)}
      ${previewHTML(p, f.reason)}
      <p class="small muted">HR keeps the reason private. Your manager only sees the dates you are out.${f.reason === "repro" ? " Nobody will ask you for documentation." : ""}</p>
      <div class="btns"><button class="btn primary" data-submitreq>Send to HR</button></div>
    </section>`;
}
function empCase(c) {
  const p = planFor(c), steps = [];
  const cert = c.tasks.find((t) => t.key === "cert"), notice = c.tasks.find((t) => t.key === "notice");
  const prot = p.segs.filter((s) => s.lane === "protect" && s.cls !== "none");
  if (notice && !notice.done) steps.push(`HR will confirm what you qualify for by <b>${fmtS(notice.due)}</b>.`);
  if (cert && !cert.done) steps.push(`Ask your doctor to fill in the medical certification, then send it to HR by <b>${fmtS(cert.due)}</b>.`);
  if (p.pays.sdi || p.pays.pfl) steps.push(`Apply to the state (EDD) for pay while you are out. The steps and dates are below.`);
  if (prot.length) steps.push(`Your job is held for you from <b>${fmtS(prot[0].start)}</b> to <b>${fmtS(addDays(prot[prot.length - 1].end, -1))}</b>, and your health coverage stays the same.`);
  if (c.reason === "bereavement") steps.push("HR may ask for proof of the death within 30 days of your first day off.");
  if (c.reason === "sick") steps.push("Your next pay stub will show your new balance.");
  const s = caseStatus(c);
  // Where the request stands: Sent, then HR reviewing, then Confirmed (the designation or confirmation letter).
  const confirmKey = ["notice", "designate", "confirm", "record"].filter((k) => c.tasks.some((t) => t.key === k)).pop();
  const reviewed = c.tasks.find((t) => t.key === "notice" || t.key === "confirm" || t.key === "record");
  const confirmed = confirmKey && c.tasks.find((t) => t.key === confirmKey).done;
  const stage = confirmed || c.approvedOn ? 3 : reviewed && reviewed.done ? 2 : 1;
  const due = reviewed && !reviewed.done && reviewed.due ? ` · HR replies by ${fmtS(reviewed.due)}` : "";
  const track = s.t === "Returned" ? "" : `<ol class="track" aria-label="Request status">${["Sent to HR", "HR reviewing", "Confirmed"].map((x, i) => `<li class="${i + 1 < stage ? "done" : i + 1 === stage ? "now" : ""}" ${i + 1 === stage ? 'aria-current="step"' : ""}><span>${x}</span></li>`).join("")}</ol><p class="small muted" style="margin:-4px 0 0">Asked ${fmt(c.requested)}${stage === 1 ? due : ""}${stage === 3 ? ` · your dates are confirmed${c.approvedOn ? `. Your manager is told the dates only, never the reason` : ""}` : ""}</p>`;
  return `<section class="panel"><div class="panel-h"><h3>${esc(REASONS[c.reason].emp)}</h3>${pill(s.t, s.cls)}</div>${track}${timelineHTML(p)}
  <div><div class="label" style="margin-bottom:8px">What happens next</div><ol class="steps">${steps.map((x) => `<li><span>${x}</span></li>`).join("")}</ol></div>
  ${p.warnings.length ? `<div class="infobox">HR will go over a few details of this request with you before confirming dates.</div>` : ""}
  ${eddPanel(c, p, true)}
  ${(c.notices || []).length ? `<div><div class="label" style="margin-bottom:8px">Letters from HR</div><div class="stack" style="gap:8px">${c.notices.slice().reverse().map((n) => `<details class="more letter-item"><summary>${esc(n.subject)} <span class="muted small">· ${fmt(n.sentOn)}</span></summary><div class="letter-text">${esc(n.body)}</div></details>`).join("")}</div></div>` : ""}</section>`;
}

/* ---------- Manager ---------- */
function mgrView() {
  const m = emp(S.me.empId), team = D().team, cases = D().teamCases;
  const s0 = addDays(TODAY, -7), span = 7 * 13, e0 = addDays(s0, span);
  const pos = (d) => Math.max(0, Math.min(100, (diffDays(s0, d) / span) * 100));
  const weeks = []; for (let i = 0; i <= 13; i++) weeks.push(addDays(s0, i * 7));
  const marks = [1, 5, 9, 13];
  const f = UI.flag, leaves = cases.filter((c) => !c.flagged), flags = cases.filter((c) => c.flagged);
  const outNow = leaves.filter((c) => c.start <= TODAY && c.end > TODAY).length;
  return `<div class="head"><div><h2 class="greet">${greeting()}, ${esc(first(m.name))}</h2><p class="sumline" style="margin-top:6px">${outNow ? `<b>${outNow}</b> of your ${team.length} team members ${outNow === 1 ? "is" : "are"} out today.` : `Everyone on your team of ${team.length} is in today.`} ${leaves.length - outNow > 0 ? `${leaves.length - outNow} upcoming.` : ""}</p><p class="small muted">You see dates only. Reasons and medical details stay with HR.</p></div></div>
  <section class="panel"><div class="panel-h"><h3>Next 12 weeks</h3><span class="small muted">The dark line is today</span></div><div class="calw"><div class="cal">
    <div class="tl-axis">${marks.map((i, k) => `<span class="${k === 1 || k === 2 ? "mid" : ""}" style="${i === 13 ? "left:auto;right:0;transform:none" : "left:" + pos(weeks[i]) + "%"}">${fmtS(weeks[i])}</span>`).join("")}</div>
    ${team.map((t) => { const cs = leaves.filter((c) => c.empId === t.id); return `<div class="lane"><div class="ln"><div class="person">${avatar(t, "sm")}<div>${esc(t.name)}<div class="small muted">${esc(t.role)}</div></div></div></div><div class="track">${weeks.map((d) => `<span class="wk" style="left:${pos(d)}%"></span>`).join("")}
      ${cs.map((c) => { if (!c.end || c.end <= s0 || c.start >= e0) return ""; const w = Math.max(1.2, pos(c.end) - pos(c.start)); return `<div class="sg cfra ${w < 8 ? "narrow" : ""}" style="left:${pos(c.start)}%;width:${w}%" title="Out ${range(c.start, c.end)}">Out</div>`; }).join("")}
      <div class="today-line" style="left:${pos(TODAY)}%"></div></div></div>`; }).join("")}
  </div></div></section>
  <div class="grid2">
    <section class="panel"><h3>Plan coverage</h3>${leaves.length ? leaves.map((c) => { const e = emp(c.empId); return `<div class="field" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="panel-h"><div class="person">${avatar(e, "sm")}<b>${esc(e.name)}</b></div>${pill(c.status.t, c.status.cls)}</div>
      <div class="small">Out <span class="mono">${fmtS(c.start)}</span>, back <span class="mono">${fmtS(c.end)}</span>. ${c.approved ? "Approved by HR." : "HR confirms the return date."}</div>
      ${(c.notices || []).length ? `<details class="more"><summary class="small">Message from HR · ${fmtS(c.notices[c.notices.length - 1].sentOn)}</summary><div class="letter-text">${esc(c.notices[c.notices.length - 1].body)}</div></details>` : ""}
      <label for="cov-${c.id}" class="small" style="font-weight:600">Who covers what</label><textarea id="cov-${c.id}" data-cov="${c.id}" placeholder="For example: Ben takes the Tuesday roasts. Saves when you click away.">${esc(c.coverage)}</textarea></div>`; }).join("") : '<p class="muted">Nobody on your team has time off coming up.</p>'}
      ${flags.length ? `<div class="small muted">Sent to HR, waiting on them: ${flags.map((c) => esc(emp(c.empId).name)).join(", ")}</div>` : ""}
      <div class="infobox">Please do not ask why someone is out, and do not contact them about work while they are on leave. Questions go to ${esc(D().company.hrContact)} in HR.</div></section>
    <section class="panel" data-form="flag"><h3>Did someone mention needing time off?</h3><p class="small muted">If a team member mentions time off for their health, a family member, a new child or a death, let HR know today. The legal clock starts when you hear about it, even if they never say the word leave.</p>
      <div class="field"><label for="fl-emp">Who?</label><select id="fl-emp" data-bind="empId"><option value="">Choose a team member</option>${team.map((t) => `<option value="${t.id}" ${t.id === f.empId ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="fl-date">When did they tell you?</label><input type="date" id="fl-date" value="${f.heard}" max="${TODAY}" data-bind="heard"></div>
      <div class="field"><label for="fl-note">What did they say? (short, no medical details)</label><textarea id="fl-note" data-bind="note" placeholder="Asked for a few weeks off starting next month">${esc(f.note)}</textarea></div>
      <div class="btns"><button class="btn primary" data-flag>Let HR know</button></div></section>
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
  if (ACCOUNTS.mode) { MODE = ACCOUNTS.mode; setChrome(false); }
  if (FB()) {
    if (ACCOUNTS.surveyDone != null) UI.survey.done = ACCOUNTS.surveyDone;
    if (!ME) await loadMe();
    return ACCOUNTS.invited ? renderPreviewLogin(root) : renderHome(root);
  }
  const L = UI.login, pw = store.get("ll-pw", sessionStorage) || "";
  const scen = (a) => a.label.split(" · ")[1] || (a.role === "hr" ? "Runs leave for the company" : "");
  const groups = [["HR", "hr"], ["Managers", "mgr"], ["Employees", "emp"]].map(([g, r]) => [g, ACCOUNTS.accounts.filter((a) => (a.role || (a.label.startsWith("HR") ? "hr" : a.label.startsWith("Manager") ? "mgr" : "emp")) === r)]);
  root.innerHTML = `<section class="login">
    <div class="panel welcome" style="gap:16px">
      <div><h1>Welcome</h1><p class="lede" style="margin-top:6px">This is a test site for Mesa Verde Coffee Roasters, a made-up coffee company in Oakland. Choose who you want to be and you will see the app the way they would.</p></div>
      <div class="field"><label for="lg-pw">Test password</label><input type="password" id="lg-pw" autocomplete="current-password" value="${esc(pw)}" placeholder="Enter it once, then tap a user"><span class="hint">Stays filled in for this tab, so switching users is one tap.</span></div>
      ${L.error ? `<p class="err" role="alert">${esc(L.error)}</p>` : ""}
      ${ACCOUNTS.configured ? "" : `<p class="err">This site has no test password yet. The site owner sets LL_TEST_PASSWORD in Netlify.</p>`}
      <p class="small muted">Everyone shares one set of sample data. A request sent as an employee shows up when you switch to HR.</p>
      <p class="small"><a href="/strategy">See the product strategy progress</a> (after signing in)</p>
    </div>
    <div class="stack">${groups.map(([g, list]) => `<div class="grp"><span class="label">${g}</span><div class="accts">${list.map((a) => { const nm = a.name || a.email.split("@")[0]; return `<button type="button" class="acct" data-pick="${esc(a.email)}">${avatar({ id: a.empId, name: nm })}<div><b>${esc(nm)}</b><span class="scn">${esc(scen(a))}</span></div></button>`; }).join("")}</div></div>`).join("")}</div>
  </section>`;
}
function personaCards() {
  const scen = (a) => a.label.split(" · ")[1] || (a.role === "hr" ? "Runs leave for the company" : "");
  const groups = [["HR", "hr"], ["Managers", "mgr"], ["Employees", "emp"]].map(([g, r]) => [g, ACCOUNTS.accounts.filter((a) => a.role === r)]);
  return `<div class="stack">${groups.map(([g, list]) => `<div class="grp"><span class="label">${g}</span><div class="accts">${list.map((a) => `<button type="button" class="acct" data-pick="${esc(a.email)}">${avatar({ id: a.empId, name: a.name })}<div><b>${esc(a.name)}</b><span class="scn">${esc(scen(a))}</span></div></button>`).join("")}</div></div>`).join("")}</div>`;
}
function renderPreviewLogin(root) {
  const L = UI.login;
  if (!ACCOUNTS.invited) {
    root.innerHTML = `<section class="login" style="grid-template-columns:minmax(0,520px);justify-content:center">
      <div class="panel welcome" style="gap:14px"><h1>Leave Ledger</h1>
        <p class="lede">California leave of absence, worked out for you: which leaves apply, what the state pays, and the notices and deadlines you owe.</p>
        <p>This early preview is invite only. Open the link you were sent to get in. If it has stopped working, ask the sender for a new one.</p>
        ${L.error ? `<p class="err" role="alert">${esc(L.error)}</p>` : ""}
      </div></section>`;
    return;
  }
  root.innerHTML = `<section class="login">
    <div class="panel welcome" style="gap:16px">
      <div><h1>Welcome</h1><p class="lede" style="margin-top:6px">Thanks for trying Leave Ledger. You have your own copy of Mesa Verde Coffee Roasters, a made-up coffee company in Oakland, with a few leaves already in progress.</p></div>
      <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
        <li>Start as <b>Grace</b>, the HR admin, to see the leaves that need attention.</li>
        <li>Switch to an employee such as <b>Ben</b> and ask for time off in your own words.</li>
        <li>Switch to a manager such as <b>Dana</b> to see what managers can and cannot see.</li>
      </ol>
      <p class="small">Tap <b>Feedback</b> on any screen to tell us what works and what does not. When you are done, there is a 2-minute survey.</p>
      <div class="note-box">Please use made-up details only, no real names or health information. Text you type for Clerk, the built-in assistant, is processed by Anthropic to fill in the form. <a href="/privacy">Privacy</a></div>
      ${googleBar()}
      ${L.error ? `<p class="err" role="alert">${esc(L.error)}</p>` : ""}
    </div>
    ${personaCards()}
  </section>`;
}
async function signIn(email) {
  if (FB()) {
    try { const j = await api("login", { email }); UI.login.error = ""; UI.tab = null; UI.caseId = null; accept(j); seenPersona(email); render(); window.scrollTo(0, 0); }
    catch (e) { UI.login.error = e.message; renderLogin(); }
    return;
  }
  const pwEl = document.getElementById("lg-pw"); const pw = pwEl ? pwEl.value : "";
  if (!pw) { UI.login.error = "Enter the test password first, then tap a user."; await renderLogin(); document.getElementById("lg-pw").focus(); return; }
  store.set("ll-pw", pw, sessionStorage);
  try { const j = await api("login", { email, password: pw }); UI.login.error = ""; UI.tab = null; UI.caseId = null; accept(j); render(); window.scrollTo(0, 0); }
  catch (e) { UI.login.error = e.message; store.set("ll-pw", "", sessionStorage); renderLogin(); }
}

/* ---------- Shell ---------- */
function setChrome(on) {
  document.getElementById("views").hidden = true;
  const tag = document.querySelector(".envtag"); if (tag) { tag.textContent = FB() ? "Early preview" : "Test"; tag.hidden = false; }
  document.getElementById("fbBtn").hidden = !(on && FB());
  if (!(on && FB())) closeFeedback();
  document.getElementById("who").hidden = !on;
  if (!on) document.getElementById("tabs").hidden = true;
  document.getElementById("coName").innerHTML = on ? `${esc(D().company.name)}<span class="city"> · ${esc(D().company.city)}</span>` : "California leave, made simple";
}
let RENDERING = false;
function render() {
  // Replacing the page can blur a focused input, which fires change and asks for another render. Queue it instead.
  if (RENDERING) { queueMicrotask(render); return; }
  RENDERING = true;
  try { renderNow(); } finally { RENDERING = false; }
}
function renderNow() {
  if (!S) return renderLogin();
  setChrome(true);
  const me = emp(S.me.empId) || { id: S.me.empId, name: S.me.name };
  const roleName = { hr: "HR admin", mgr: S.me.label, emp: "Employee" }[S.me.role];
  const whoBtns = ORG() ? `<button class="btn sm" data-home>Spaces</button><button class="btn sm" data-signout>Sign out</button>`
    : FB() && ME && ME.user ? `<button class="btn sm" data-logout>Switch user</button><button class="btn sm" data-home>Spaces</button>` : `<button class="btn sm" data-logout>Switch user</button>`;
  document.getElementById("who").innerHTML = `${avatar(me)}<span class="meta"><span class="nm">${esc(S.me.name)}</span><span class="r">${esc(ORG() ? `${roleName} · ${S.space.name}` : roleName)}</span></span>${whoBtns}`;
  const tabs = document.getElementById("tabs"), list = tabsFor(S.me.role);
  tabs.hidden = list.length < 2;
  const late = S.me.role === "hr" ? lateCount() : 0;
  // Phones get a bottom bar: up to 4 tabs, the rest under More.
  const phone = window.matchMedia("(max-width:640px)").matches;
  const tabBtn = ([k, n]) => `<button role="tab" class="${k === "myleave" && list.length > 2 && !phone ? "push" : ""}" data-tab="${k}" aria-selected="${UI.tab === k}">${n}${k === "overview" && late ? `<span class="count" title="${late} late or due today">${late}</span>` : ""}</button>`;
  if (phone && list.length > 4) {
    const main = list.slice(0, 3), rest = list.slice(3), inRest = rest.some(([k]) => k === UI.tab);
    tabs.innerHTML = main.map(tabBtn).join("") + `<button class="more-tab" data-more aria-expanded="${!!UI.moreOpen}" aria-selected="${inRest}">More</button>`
      + (UI.moreOpen ? `<div class="more-menu" role="menu">${rest.map(([k, n]) => `<button role="menuitem" data-tab="${k}" aria-current="${UI.tab === k}">${n}</button>`).join("")}</div>` : "");
  } else tabs.innerHTML = list.map(tabBtn).join("");
  document.body.classList.toggle("has-bottom-tabs", phone && list.length > 1);
  const focusId = document.activeElement && document.activeElement.id;
  const v = viewOf();
  const html = FB() && UI.survey.open ? surveyView() : UI.tab === "guide" ? guideView() : v === "emp" ? empView() : v === "mgr" ? mgrView() : { overview: hrOverview, cases: hrCases, plan: hrPlan, employees: hrEmployees, access: hrUsers, settings: hrSettings }[UI.tab]();
  const foot = FB()
    ? `<span>${ORG() ? "Early preview workspace. Use made-up employee details only." : "Early preview with a made-up company."} Rules checked October 2026 for California employers. Not legal advice. <a href="/privacy">Privacy</a></span>${UI.survey.open ? "" : `<button class="btn sm" data-survey>${UI.survey.done ? "Edit your survey answers" : "Take the 2-minute survey"}</button>`}`
    : `<span>Test site with a made-up company. Rules checked October 2026 for California employers. Not legal advice.</span><a href="/strategy">Product strategy progress</a>`;
  document.getElementById("root").innerHTML = `<main>${surveyBanner()}${html}<div class="foot">${foot}</div></main>`;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
  if (v === "emp" && UI.reqAI.draft) {
    const map = { reason: ["rq-reason"], relation: ["rq-rel"], start: ["rq-start"], length: ["rq-wk", "rq-dy", "rq-hr", "rq-dis", "rq-bond"] };
    unsure(UI.reqAI.draft).forEach((k) => (map[k] || []).forEach((id) => document.getElementById(id)?.closest(".field")?.classList.add("needs-check")));
  }
  saveUI();
}
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3000); }

/* ---------- Google sign-in, spaces and workspaces (preview site only) ---------- */
async function loadMe() { try { ME = await api("me"); } catch (e) { ME = { google: false, user: null, spaces: [], create: { ok: false } }; } return ME; }
const G_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>`;
const gButton = (label = "Sign in with Google") => `<a class="btn gbtn" href="/api/auth/google/start?next=/">${G_ICON}<span>${label}</span></a>`;
function googleBar() {
  if (!ME || !ME.google) return "";
  if (!ME.user) return `<div class="gbar"><p class="small">Want to come back from another device, or set up your own workspace? Sign in with Google.</p>${gButton()}</div>`;
  return `<div class="gbar"><p class="small">Signed in as <b>${esc(ME.user.email)}</b>.</p><div class="btns"><button class="btn sm" data-home>Your spaces</button><button class="btn sm" data-signout>Sign out</button></div></div>`;
}
function renderHome(root) {
  setChrome(false);
  const L = UI.login, H = UI.home, f = H.form, u = ME && ME.user;
  const err = L.error || H.error;
  if (!u) {
    root.innerHTML = `<section class="login" style="grid-template-columns:minmax(0,520px);justify-content:center">
      <div class="panel welcome" style="gap:14px"><h1>Leave Ledger</h1>
        <p class="lede">California leave of absence, worked out for you: which leaves apply, what the state pays, and the notices and deadlines you owe.</p>
        <p>This early preview is invite only. Open the link you were sent, or sign in with the Google account your invite went to.</p>
        ${ME && ME.google ? gButton() : ""}
        ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
        <p class="small muted"><a href="/privacy">Privacy</a></p>
      </div></section>`;
    return;
  }
  const sp = ME.spaces || [];
  const card = (x) => `<button type="button" class="acct space" data-space="${x.kind}|${x.id}" ${x.disabled || x.domainBlocked ? "disabled" : ""}>
    <div><b>${esc(x.name)}</b><span class="scn">${x.kind === "preview" ? "Sample company, your own copy" : esc(x.roleName)}${x.disabled ? " · turned off" : ""}${x.domainBlocked ? " · needs your company Google account" : ""}</span></div></button>`;
  const C = ME.create || { ok: false };
  root.innerHTML = `<section class="login">
    <div class="panel welcome" style="gap:14px">
      <div><h1>Hi ${esc(u.name.split(" ")[0])}</h1><p class="lede" style="margin-top:6px">Signed in as ${esc(u.email)}.</p></div>
      <div class="btns">${ME.admin ? `<a class="btn sm" style="text-decoration:none;color:inherit" href="/inbox">Inbox</a><a class="btn sm" style="text-decoration:none;color:inherit" href="/strategy">Strategy</a>` : ""}<button class="btn sm" data-signout>Sign out</button></div>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <p class="small muted"><a href="/privacy">Privacy</a></p>
    </div>
    <div class="stack">
      ${(ME.pending || []).length ? `<div class="grp"><span class="label">Invitations</span>${ME.pending.map((x) => `<div class="banner"><span><b>${esc(x.name)}</b> invited you as ${esc(x.roleName)}<span class="small muted"> · from ${esc(x.invitedBy)}</span>${x.domainBlocked ? `<br><span class="small">Needs a Google Workspace account on @${esc(x.domain)}.</span>` : ""}</span><span class="btns" style="margin:0"><button class="btn sm" data-decline="${esc(x.id)}">Decline</button>${x.domainBlocked ? "" : `<button class="btn sm primary" data-accept="${esc(x.id)}">Accept</button>`}</span></div>`).join("")}<p class="small muted">Only accept invitations you expect.</p></div>` : ""}
      <div class="grp"><span class="label">Your spaces</span>
        ${sp.length ? `<div class="accts">${sp.map(card).join("")}</div>` : `<div class="infobox">Nothing here yet. If you were invited, ask the sender to use ${esc(u.email)}, or open the invite link you were sent.</div>`}
      </div>
      ${C.ok ? `<section class="panel" data-form="home"><h3>Set up a workspace for your company</h3>
        <p class="small muted">Your own workspace, where you invite your HR team, managers and employees with their Google accounts. Each user sees only what their role allows.</p>
        <div class="note-box"><b>Made-up details only for now.</b> Real employee names, dates and health information are not supported until the security review is done. Use made-up employees to try how it would work for your team.</div>
        <div class="row"><div class="field"><label for="ws-name">Company name</label><input type="text" id="ws-name" data-bind="name" value="${esc(f.name)}" maxlength="80" placeholder="Bayside Dental"></div>
          <div class="field"><label for="ws-city">City</label><input type="text" id="ws-city" data-bind="city" value="${esc(f.city)}" maxlength="60" placeholder="San Jose, CA"></div></div>
        <div class="row"><div class="field"><label for="ws-hc">Number of employees</label><input type="number" id="ws-hc" data-bind="headcount" data-num min="1" value="${esc(f.headcount)}"><span class="hint">This decides which laws apply.</span></div>
          <div class="field"><label for="ws-job">Your job title</label><input type="text" id="ws-job" data-bind="jobTitle" value="${esc(f.jobTitle)}" maxlength="60" placeholder="Office manager"></div></div>
        <div class="field"><span class="label" style="font-weight:600;font-size:.86rem;text-transform:none;letter-spacing:0;color:var(--ink)">Start with</span>
          <label class="check"><input type="radio" name="ws-start" data-bind="start" value="sample" ${f.start === "sample" ? "checked" : ""}>10 made-up employees and a few leaves, with you as the HR admin</label>
          <label class="check"><input type="radio" name="ws-start" data-bind="start" value="empty" ${f.start === "empty" ? "checked" : ""}>Just me. I will add made-up employees myself</label></div>
        ${u.hd ? `<label class="check"><input type="checkbox" data-bind="lockDomain" ${f.lockDomain ? "checked" : ""}>Only allow @${esc(u.hd)} Google accounts to join</label>` : ""}
        <label class="check"><input type="checkbox" id="ws-agree" data-bind="agree" ${f.agree ? "checked" : ""}>I will use made-up employee details only</label>
        <div class="btns"><button class="btn primary" data-create ${H.busy ? "disabled" : ""}>${H.busy ? "Setting up..." : "Create workspace"}</button></div>
      </section>` : C.why && !sp.length ? "" : C.why ? `<p class="small muted">${esc(C.why)}</p>` : ""}
    </div>
  </section>`;
}
async function openSpace(kind, id) {
  UI.login.error = ""; UI.home.error = "";
  try {
    await api("space", { kind, id });
    UI.tab = null; UI.caseId = null; UI.users.list = null; UI.survey = { ...UI.survey, open: false, q: null, done: null };
    ACCOUNTS = null; await loadMe();
    if (kind === "preview") { renderLogin(); return; }
    accept(await api("state")); render(); window.scrollTo(0, 0);
  } catch (e) { if (e.message === "signed out") return; UI.home.error = e.message; renderLogin(); }
}
async function goHome() {
  S = null; ACCOUNTS = null; UI.survey.open = false; closeFeedback();
  await loadMe(); renderHome(document.getElementById("root")); window.scrollTo(0, 0);
}
async function signOutGoogle() {
  await api("auth/signout", {}).catch(() => {});
  S = null; ACCOUNTS = null; ME = null; UI.login.error = ""; closeFeedback(); renderLogin(); window.scrollTo(0, 0);
}
async function createWorkspace() {
  const H = UI.home, f = H.form;
  H.busy = true; H.error = ""; renderHome(document.getElementById("root"));
  try {
    await api("org/create", { ...f, headcount: +f.headcount });
    H.busy = false; H.form = { name: "", city: "", headcount: 20, jobTitle: "", start: "sample", lockDomain: false, agree: false };
    UI.tab = null; UI.caseId = null; await loadMe();
    accept(await api("state")); render(); window.scrollTo(0, 0); toast("Your workspace is ready");
  } catch (e) { if (e.message === "signed out") return; H.busy = false; H.error = e.message; renderHome(document.getElementById("root")); }
}

/* ---------- Workspace: Users (HR admins) ---------- */
async function loadUsers() {
  try { const j = await api("org/members"); Object.assign(UI.users, { list: j.members, domain: j.domain, canLock: j.canLock, myDomain: j.myDomain }); }
  catch (e) { if (e.message !== "signed out") UI.users.error = e.message; UI.users.list = UI.users.list || []; }
  render();
}
const ROLE_NAMES = { hr: "HR admin", mgr: "Manager", emp: "Employee" };
function sampleUsers() {
  const U = UI.users;
  if (!U.sample) { queueMicrotask(loadSampleUsers); return `<div class="head"><div><h2>Users</h2></div></div><section class="panel"><p class="muted">Loading...</p></section>`; }
  const roleOf = { hr: "HR admin", mgr: "Manager", emp: "Employee" };
  return `<div class="head"><div><h2>Users</h2><p>Everyone who can use your copy of ${esc(D().company.name)}. Try the app as any of them, or invite a colleague to explore it with you.</p></div></div>
  <div class="grid2 form">
    <section class="panel" data-form="users"><h3>Invite a colleague</h3>
      <p class="small muted">They sign in at this site with Google using this email, and see this same copy, with your changes.</p>
      <div class="field"><label for="us-email">Google account email</label><input type="email" id="us-email" data-bind="email" value="${esc(U.email)}" placeholder="name@company.com" autocomplete="off"></div>
      ${U.error ? `<p class="err" role="alert">${esc(U.error)}</p>` : ""}
      <div class="btns"><button class="btn primary" data-invite-colleague ${U.busy ? "disabled" : ""}>Invite</button></div>
      ${U.colleagues.length ? `<div class="queue">${U.colleagues.map((c) => `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto auto"><div class="small">${esc(c.email)}</div>${c.joined ? pill("Signed in", "ok") : pill("Invited", "")}<button class="btn sm" data-uncolleague="${esc(c.email)}">Remove</button></div>`).join("")}</div>` : `<p class="small muted">No colleagues invited yet.</p>`}
    </section>
    <section class="panel"><h3>${U.sample.length} sample users</h3>
      <div class="tw"><table><thead><tr><th>User</th><th>Role</th><th></th></tr></thead><tbody>
      ${U.sample.map((a) => `<tr><td><div class="person">${avatar({ id: a.empId, name: a.name }, "sm")}<div><b>${esc(a.name)}</b><div class="small muted">${esc(a.label.split(" · ")[1] || "")}</div></div></div></td><td>${roleOf[a.role]}</td>
        <td>${a.email === S.me.email ? '<span class="small muted">You now</span>' : `<button class="btn sm" data-pick="${esc(a.email)}">Try as</button>`}</td></tr>`).join("")}
      </tbody></table></div>
    </section>
  </div>`;
}
async function loadSampleUsers() {
  try { const j = await api("preview/members"); Object.assign(UI.users, { sample: j.sample, colleagues: j.colleagues }); }
  catch (e) { if (e.message !== "signed out") UI.users.error = e.message; UI.users.sample = UI.users.sample || []; UI.users.colleagues = UI.users.colleagues || []; }
  render();
}
function hrUsers() {
  if (SAMPLE()) return sampleUsers();
  const U = UI.users;
  if (!U.list) { queueMicrotask(loadUsers); return `<div class="head"><div><h2>Users</h2></div></div><section class="panel"><p class="muted">Loading...</p></section>`; }
  const emps = D().employees, taken = new Set(U.list.map((m) => m.empId));
  const free = emps.filter((e) => !taken.has(e.id));
  const nameOf = (id) => (emps.find((e) => e.id === id) || {}).name || "Removed employee";
  return `<div class="head"><div><h2>Users</h2><p>Who can sign in to ${esc(S.space.name)} with Google, and what they see. HR admins see everything, managers see dates and coverage for their team, and employees see their own leave.</p></div></div>
  <div class="grid2 form">
    <section class="panel" data-form="users"><h3>Invite a user</h3>
      <div class="field"><label for="us-email">Google account email</label><input type="email" id="us-email" data-bind="email" value="${esc(U.email)}" placeholder="${U.domain ? "name@" + esc(U.domain) : "name@company.com"}" autocomplete="off"></div>
      <div class="field"><label for="us-emp">Which employee is this?</label><select id="us-emp" data-bind="empId"><option value="">Choose</option>${free.map((e) => `<option value="${e.id}" ${U.empId === e.id ? "selected" : ""}>${esc(e.name)} · ${esc(e.role)}</option>`).join("")}</select>${free.length ? "" : `<span class="hint">Everyone already has access. Add an employee first.</span>`}</div>
      <div class="field"><label for="us-role">Role</label><select id="us-role" data-bind="role">${Object.entries(ROLE_NAMES).map(([k, n]) => `<option value="${k}" ${U.role === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      ${U.error ? `<p class="err" role="alert">${esc(U.error)}</p>` : ""}
      <div class="btns"><button class="btn primary" data-invite-user ${U.busy ? "disabled" : ""}>Invite</button></div>
      <p class="small muted">They sign in at this site with Google using that email. There is no email sent yet, so tell them yourself.</p>
      <h3>Company Google accounts only</h3>
      ${U.canLock ? `<label class="check"><input type="checkbox" data-lock ${U.domain ? "checked" : ""}>Only allow @${esc(U.myDomain)} accounts</label><span class="hint small muted">Users must sign in with a Google Workspace account on your company domain.</span>` : `<p class="small muted">Available when you sign in with a Google Workspace account on your company domain.</p>`}
    </section>
    <section class="panel"><h3>${U.list.length} ${U.list.length === 1 ? "user" : "users"}</h3>
      <div class="tw"><table><thead><tr><th>User</th><th>Employee</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${U.list.map((m) => { const self = m.email === S.space.user; return `<tr><td class="small">${esc(m.email)}${self ? ' <span class="muted">(you)</span>' : ""}</td><td>${esc(nameOf(m.empId))}</td>
        <td><select aria-label="Role for ${esc(m.email)}" data-user-role="${esc(m.email)}">${Object.entries(ROLE_NAMES).map(([k, n]) => `<option value="${k}" ${m.role === k ? "selected" : ""}>${n}</option>`).join("")}</select></td>
        <td>${m.joined ? pill("Signed in", "ok") : pill("Invited", "")}</td>
        <td>${self ? "" : `<button class="btn sm" data-user-remove="${esc(m.email)}">Remove</button>`}</td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
  </div>`;
}
async function usersChange(body, okMsg) {
  const U = UI.users; U.busy = true; U.error = "";
  try { const j = await api("org/members", body); Object.assign(U, { list: j.members, domain: j.domain, busy: false }); accept(j); render(); if (okMsg) toast(okMsg); return true; }
  catch (e) { if (e.message === "signed out") return false; U.busy = false; U.error = e.message; render(); return false; }
}

/* ---------- Feedback and survey (prospect site only) ---------- */
const TAB_NAMES = { overview: "Today", cases: "Leaves", plan: "Plan a leave", employees: "Employees", team: "My team", myleave: "My leave" };
function screenName() {
  if (!S) return "Sign in";
  if (UI.survey.open) return "Survey";
  const who = { hr: "HR", mgr: "Manager", emp: "Employee" }[S.me.role];
  return `${who}: ${TAB_NAMES[UI.tab] || UI.tab}${UI.caseId ? " (leave detail)" : ""}`;
}
function seenPersona(email) {
  try { const s = new Set(JSON.parse(sessionStorage.getItem("ll-fb-seen") || "[]")); s.add(email); sessionStorage.setItem("ll-fb-seen", JSON.stringify([...s])); } catch (e) {}
}
const personasSeen = () => { try { return JSON.parse(sessionStorage.getItem("ll-fb-seen") || "[]").length; } catch (e) { return 0; } };
function surveyBanner() {
  if (!FB() || UI.survey.open || UI.survey.done !== false || UI.survey.later || personasSeen() < 2) return "";
  return `<div class="banner"><span><b>Done looking around?</b> Tell us what you think. It takes about 2 minutes.</span><span class="btns" style="margin:0"><button class="btn sm" data-survey-later>Later</button><button class="btn sm primary" data-survey>Take the survey</button></span></div>`;
}
const KINDS = [["like", "I like this"], ["confusing", "Confusing"], ["bug", "Something broke"], ["idea", "Idea"]];
function renderFeedback() {
  const pop = document.getElementById("fbPop"), F = UI.fb;
  pop.innerHTML = `<div class="cp-h"><h3 style="margin:0">Feedback</h3><button class="btn sm" style="margin-left:auto" data-fb-close aria-label="Close">Close</button></div>
    <p class="small muted" style="margin:0">About: ${esc(screenName())}</p>
    <div class="field"><span class="label" style="font-weight:600;font-size:.86rem">How is this screen?</span>
      <div class="scale" role="group" aria-label="Rating from 1 to 5">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="chip" data-fb-rate="${n}" aria-pressed="${F.rating === n}">${n}</button>`).join("")}</div>
      <div class="scale-ends"><span>1 Not useful</span><span>5 Very useful</span></div></div>
    <div class="chips" role="group" aria-label="Type">${KINDS.map(([k, n]) => `<button type="button" class="chip" data-fb-kind="${k}" aria-pressed="${F.kind === k}">${n}</button>`).join("")}</div>
    <div class="field"><label for="fb-note">What would you change? (optional)</label><textarea id="fb-note" placeholder="I expected to see...">${esc(F.note)}</textarea></div>
    ${F.error ? `<p class="err" role="alert">${esc(F.error)}</p>` : ""}
    <div class="btns"><button class="btn primary" data-fb-send ${F.busy ? "disabled" : ""}>${F.busy ? "Sending..." : "Send"}</button></div>`;
}
function openFeedback() {
  UI.fb.open = true; renderFeedback();
  const pop = document.getElementById("fbPop"), btn = document.getElementById("fbBtn");
  pop.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.textContent = "Close feedback";
  document.getElementById("fb-note")?.focus();
}
function closeFeedback() {
  UI.fb.open = false;
  const pop = document.getElementById("fbPop"), btn = document.getElementById("fbBtn");
  if (pop) pop.hidden = true; if (btn) { btn.setAttribute("aria-expanded", "false"); btn.textContent = "Feedback"; }
}
async function sendFeedback() {
  const F = UI.fb; F.note = document.getElementById("fb-note")?.value || F.note;
  if (!F.rating && !F.note.trim()) { F.error = "Pick a number or write a note."; renderFeedback(); return; }
  F.busy = true; F.error = ""; renderFeedback();
  try {
    await api("feedback", { screen: screenName(), rating: F.rating, kind: F.kind, note: F.note });
    UI.fb = { open: false, rating: 0, kind: "", note: "", busy: false, error: "" }; closeFeedback(); toast("Thank you. Feedback sent.");
  } catch (e) { if (e.message === "signed out") return; F.busy = false; F.error = e.message; renderFeedback(); }
}
async function openSurvey() {
  const V = UI.survey; V.open = true; V.error = ""; closeFeedback();
  if (!V.q) {
    try { const j = await api("survey"); V.q = j.questions; V.a = j.answers ? { ...j.answers } : {}; V.done = !!j.answers; }
    catch (e) { if (e.message === "signed out") return; V.open = false; toast(e.message); return; }
  }
  render(); window.scrollTo(0, 0);
}
function surveyView() {
  const V = UI.survey;
  if (V.sent) return `<section class="panel survey"><h2>Thank you</h2><p>Your answers are in. They go straight to the team building Leave Ledger.</p><p class="small muted">You can keep using the preview, and send more feedback from any screen.</p><div class="btns"><button class="btn primary" data-survey-close>Back to the app</button></div></section>`;
  const qs = (V.q || []).map((q, i) => {
    const v = V.a[q.id], id = `sv-${q.id}`;
    let input = "";
    if (q.type === "choice") input = `<div class="chips" role="radiogroup" aria-labelledby="${id}">${q.options.map((o) => `<button type="button" class="chip" role="radio" aria-checked="${v === o}" aria-pressed="${v === o}" data-sv="${q.id}" data-val="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    else if (q.type === "multi") input = `<div class="chips" role="group" aria-labelledby="${id}">${q.options.map((o) => `<button type="button" class="chip" aria-pressed="${(v || []).includes(o)}" data-sv-multi="${q.id}" data-val="${esc(o)}">${esc(o)}</button>`).join("")}</div><span class="hint small muted">Pick any that apply.</span>`;
    else if (q.type === "scale") input = `<div class="scale" role="radiogroup" aria-labelledby="${id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="chip" role="radio" aria-checked="${v === n}" aria-pressed="${v === n}" data-sv="${q.id}" data-val="${n}" data-num>${n}</button>`).join("")}</div><div class="scale-ends"><span>1 ${esc(q.low)}</span><span>5 ${esc(q.high)}</span></div>`;
    else input = q.id === "contact" ? `<input id="${id}-in" type="email" data-sv-text="${q.id}" value="${esc(v || "")}" placeholder="you@company.com" autocomplete="email">` : q.id === "price" ? `<input id="${id}-in" type="text" data-sv-text="${q.id}" value="${esc(v || "")}" placeholder="For example, $50 a month flat">` : `<textarea id="${id}-in" data-sv-text="${q.id}">${esc(v || "")}</textarea>`;
    return `<div class="q"><b id="${id}">${i + 1}. ${esc(q.q)}${q.optional ? ` <span class="muted" style="font-weight:400">(optional)</span>` : ""}</b>${input}</div>`;
  }).join("");
  return `<section class="panel survey">
    <div><h2>A few quick questions</h2><p class="muted" style="margin:4px 0 0">About 2 minutes. Your answers help decide what gets built next.</p></div>
    ${qs}
    ${V.error ? `<p class="err" role="alert">${esc(V.error)}</p>` : ""}
    <div class="btns"><button class="btn" data-survey-close>Not now</button><button class="btn primary" data-survey-send ${V.busy ? "disabled" : ""}>${V.busy ? "Sending..." : V.done ? "Update answers" : "Send answers"}</button></div>
  </section>`;
}
async function sendSurvey() {
  const V = UI.survey;
  document.querySelectorAll("[data-sv-text]").forEach((el) => { V.a[el.dataset.svText] = el.value; });
  V.busy = true; V.error = ""; render();
  try { await api("survey", { answers: V.a }); V.busy = false; V.done = true; V.sent = true; render(); window.scrollTo(0, 0); }
  catch (e) { if (e.message === "signed out") return; V.busy = false; V.error = e.message; render(); }
}
async function joinFromLink() {
  const u = new URL(location.href), code = u.searchParams.get("invite");
  if (!code) return;
  u.searchParams.delete("invite"); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
  try { await api("join", { code }); ACCOUNTS = null; }
  catch (e) { UI.login.error = e.message; }
}

/* ---------- Events ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button, tr[data-open]"); if (!b) return;
  if (b.dataset.pick) { signIn(b.dataset.pick); return; }
  if (b.dataset.space) { const [k, id] = b.dataset.space.split("|"); openSpace(k, id); return; }
  if (b.hasAttribute("data-home")) { goHome(); return; }
  if (b.hasAttribute("data-signout")) { signOutGoogle(); return; }
  if (b.hasAttribute("data-create")) { createWorkspace(); return; }
  if (b.dataset.accept) {
    try { await api("org/accept", { id: b.dataset.accept }); UI.tab = null; UI.caseId = null; await loadMe(); accept(await api("state")); render(); window.scrollTo(0, 0); toast("Welcome in"); }
    catch (e) { if (e.message !== "signed out") { UI.home.error = e.message; await loadMe(); renderHome(document.getElementById("root")); } }
    return;
  }
  if (b.dataset.decline) { await api("org/decline", { id: b.dataset.decline }).catch(() => {}); await loadMe(); renderHome(document.getElementById("root")); toast("Invitation declined"); return; }
  if (!S) return;
  if (b.dataset.letter) { const [cid, key] = b.dataset.letter.split("|"); openLetter(cid, key); render(); window.scrollTo(0, 0); setTimeout(() => document.getElementById("lt-body")?.focus(), 0); return; }
  if (b.dataset.letterView) { const [cid, i] = b.dataset.letterView.split("|"); UI.tab = "cases"; UI.caseId = cid; UI.letter = { caseId: cid, view: +i }; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-letter-close")) { readLetterFields(); UI.letter = null; render(); return; }
  if (b.hasAttribute("data-letter-copy")) { readLetterFields(); const { subject, body } = letterText(); try { await navigator.clipboard.writeText(`${subject}\n\n${body}`); toast("Copied. Paste it into your email."); } catch (e) { toast("Could not copy. Select the text and copy it."); } return; }
  if (b.hasAttribute("data-letter-print")) { readLetterFields(); printLetter(); return; }
  if (b.hasAttribute("data-letter-reset")) { const L = UI.letter, c = D().cases.find((x) => x.id === L.caseId); const d = draftLetter(L.key, c, emp(c.empId), D().company, c.reason === "unknown" ? { el: null } : planFor(c), TODAY, S.me.name); Object.assign(L, { subject: d.subject, body: d.body }); render(); toast("Back to the first draft"); return; }
  if (b.hasAttribute("data-letter-save")) { readLetterFields(); const L = UI.letter; const j = await act({ type: "saveLetter", caseId: L.caseId, key: L.key, subject: L.subject, body: L.body }, "Draft saved"); if (j) L.saved = true; return; }
  if (b.hasAttribute("data-letter-send")) {
    readLetterFields(); const L = UI.letter;
    const j = await act({ type: "sendLetter", caseId: L.caseId, key: L.key, subject: L.subject, body: L.body, sentOn: L.sentOn, method: L.method });
    if (j) { const c = j.data.cases.find((x) => x.id === L.caseId); UI.letter = { caseId: L.caseId, view: c.notices.length - 1 }; render(); toast("Marked as sent. A copy is on the leave."); }
    return;
  }
  if (b.hasAttribute("data-req-open")) { UI.reqOpen = true; render(); document.getElementById("rq-text")?.focus(); return; }
  if (b.hasAttribute("data-req-close")) { UI.reqOpen = false; render(); return; }
  if (b.hasAttribute("data-wiz-start")) { UI.wiz = { step: 1, need: null, relation: "parent", start: addDays(TODAY, 14), due: addDays(TODAY, 90), bond: true, weeks: 4, days: 3, hours: 8 }; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.wizNeed) { UI.wiz.need = b.dataset.wizNeed; UI.wiz.step = 2; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-wiz-back")) { UI.wiz.step = Math.max(1, UI.wiz.step - 1); render(); return; }
  if (b.hasAttribute("data-wiz-close")) { UI.wiz = null; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-wiz-next")) { document.querySelectorAll('[data-form="wiz"] [data-bind]').forEach((el) => { UI.wiz[el.dataset.bind] = el.type === "checkbox" ? el.checked : el.hasAttribute("data-num") ? +el.value : el.value; }); UI.wiz.step = 3; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-wiz-use")) {
    const W = UI.wiz, o = wizOpts(W);
    Object.assign(UI.req, { reason: W.need, relation: o.relation, start: o.start, weeks: o.weeks, disWeeks: o.disWeeks, bondWeeks: o.bondWeeks, days: o.days, hours: o.hours });
    UI.wiz = null; UI.tab = "myleave"; UI.reqOpen = true; render();
    setTimeout(() => { document.querySelector('[data-form="req"]')?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0);
    toast("Check the details, then send it to HR."); return;
  }
  if (b.dataset.change) { await act({ type: "updateCase", caseId: b.dataset.change, opts: readChange() }, "New dates saved. Deadlines updated."); return; }
  if (b.dataset.returned) { await act({ type: "markReturned", caseId: b.dataset.returned, on: document.getElementById("ce-back")?.value }, "Marked as returned"); return; }
  if (b.dataset.unreturn) { await act({ type: "markReturned", caseId: b.dataset.unreturn, on: null }, "Return undone"); return; }
  if (b.hasAttribute("data-imp-open")) { UI.imp = { open: true, rows: null, raw: null, missing: [], error: "", file: "", busy: false }; UI.addEmp.open = false; render(); return; }
  if (b.hasAttribute("data-imp-close")) { UI.imp.open = false; render(); return; }
  if (b.hasAttribute("data-imp-template")) {
    const url = URL.createObjectURL(new Blob([templateCSV()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "leave-ledger-employees.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  if (b.hasAttribute("data-imp-paste")) { readRoster(document.getElementById("imp-paste").value, "Pasted rows"); render(); return; }
  if (b.hasAttribute("data-imp-go")) {
    UI.imp.busy = true; render();
    const j = await act({ type: "importRoster", rows: UI.imp.raw });
    UI.imp.busy = false;
    if (j && j.imported) { const r = j.imported; UI.imp = { open: false, rows: null, raw: null, missing: [], error: "", file: "", busy: false }; render(); toast(`Imported: ${r.added} added, ${r.updated} updated${r.skipped ? `, ${r.skipped} left out` : ""}`); }
    else render();
    return;
  }
  if (b.dataset.apprOpen) { UI.appr = { caseId: b.dataset.apprOpen, notify: true, note: "" }; render(); return; }
  if (b.hasAttribute("data-appr-cancel")) { UI.appr.caseId = null; render(); return; }
  if (b.dataset.apprGo) {
    const kind = b.dataset.apprKind, A = UI.appr;
    const j = await act(kind === "approved" ? { type: "approveCase", caseId: b.dataset.apprGo, notify: A.notify, note: A.note } : { type: "notifyManager", caseId: b.dataset.apprGo, note: A.note });
    if (j) { UI.appr = { caseId: null, notify: true, note: "" }; render(); toast(kind === "approved" ? "Approved" : "New dates sent"); }
    return;
  }
  if (b.hasAttribute("data-addemp-open")) { UI.addEmp = { ...UI.addEmp, open: true, error: "", hire: UI.addEmp.hire || addDays(TODAY, -365) }; render(); document.getElementById("ae-name")?.focus(); return; }
  if (b.hasAttribute("data-addemp-cancel")) { UI.addEmp.open = false; render(); return; }
  if (b.hasAttribute("data-addemp")) {
    const A = UI.addEmp;
    try { const j = await api("action", { type: "addEmployee", employee: { name: A.name, email: A.email, role: A.role, hire: A.hire || addDays(TODAY, -365), hours12: A.hours12, sick: A.sick, hiQuarter: A.hiQuarter, shiftHours: A.shiftHours, weeklyHours: A.weeklyHours, mgr: A.mgr } }); accept(j); UI.addEmp = { open: false, name: "", email: "", role: "", hire: "", hours12: 1000, sick: 24, hiQuarter: 12000, shiftHours: 8, weeklyHours: 40, mgr: "", error: "" }; render(); toast("Employee added"); }
    catch (e) { if (e.message !== "signed out") { A.error = e.message; render(); } }
    return;
  }
  if (b.dataset.empRemove) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again"; b.classList.add("primary"); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Remove"; b.classList.remove("primary"); } }, 4000); return; }
    await act({ type: "removeEmployee", id: b.dataset.empRemove }, "Employee removed"); return;
  }
  if (b.hasAttribute("data-invite-user")) {
    const U = UI.users;
    if (await usersChange({ op: "invite", email: U.email.trim(), role: U.role, empId: U.empId }, "Invited. Ask them to sign in with Google.")) { U.email = ""; U.empId = ""; render(); }
    return;
  }
  if (b.hasAttribute("data-invite-colleague")) {
    const U = UI.users; U.busy = true; U.error = "";
    try { const j = await api("preview/members", { op: "invite", email: (document.getElementById("us-email")?.value || "").trim() }); Object.assign(U, { colleagues: j.colleagues, email: "", busy: false }); render(); toast("Invited. Ask them to sign in with Google."); }
    catch (e) { if (e.message !== "signed out") { U.busy = false; U.error = e.message; render(); } }
    return;
  }
  if (b.dataset.uncolleague) {
    try { const j = await api("preview/members", { op: "remove", email: b.dataset.uncolleague }); UI.users.colleagues = j.colleagues; render(); toast("Removed"); } catch (e) { if (e.message !== "signed out") toast(e.message); }
    return;
  }
  if (b.dataset.userRemove) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again"; b.classList.add("primary"); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Remove"; b.classList.remove("primary"); } }, 4000); return; }
    usersChange({ op: "remove", email: b.dataset.userRemove }, "Access removed"); return;
  }
  if (b.hasAttribute("data-clear")) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to clear every leave"; b.classList.add("primary"); return; }
    await act({ type: "clearCases" }, "All leaves cleared"); return;
  }
  if (b.id === "fbBtn") { UI.fb.open ? closeFeedback() : openFeedback(); return; }
  if (b.hasAttribute("data-fb-close")) { UI.fb.note = document.getElementById("fb-note")?.value || ""; closeFeedback(); document.getElementById("fbBtn").focus(); return; }
  if (b.dataset.fbRate) { UI.fb.note = document.getElementById("fb-note")?.value || ""; UI.fb.rating = UI.fb.rating === +b.dataset.fbRate ? 0 : +b.dataset.fbRate; renderFeedback(); return; }
  if (b.dataset.fbKind) { UI.fb.note = document.getElementById("fb-note")?.value || ""; UI.fb.kind = UI.fb.kind === b.dataset.fbKind ? "" : b.dataset.fbKind; renderFeedback(); return; }
  if (b.hasAttribute("data-fb-send")) { sendFeedback(); return; }
  if (b.hasAttribute("data-survey")) { UI.survey.sent = false; openSurvey(); return; }
  if (b.hasAttribute("data-survey-later")) { UI.survey.later = true; render(); return; }
  if (b.hasAttribute("data-survey-close")) { UI.survey.open = false; UI.survey.sent = false; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-survey-send")) { sendSurvey(); return; }
  if (b.dataset.sv) {
    document.querySelectorAll("[data-sv-text]").forEach((el) => { UI.survey.a[el.dataset.svText] = el.value; });
    const v = b.hasAttribute("data-num") ? +b.dataset.val : b.dataset.val;
    UI.survey.a[b.dataset.sv] = UI.survey.a[b.dataset.sv] === v ? undefined : v; render(); return;
  }
  if (b.dataset.svMulti) {
    document.querySelectorAll("[data-sv-text]").forEach((el) => { UI.survey.a[el.dataset.svText] = el.value; });
    const cur = new Set(UI.survey.a[b.dataset.svMulti] || []); cur.has(b.dataset.val) ? cur.delete(b.dataset.val) : cur.add(b.dataset.val);
    UI.survey.a[b.dataset.svMulti] = [...cur]; render(); return;
  }
  if (b.hasAttribute("data-logout")) { await api("logout", {}).catch(() => {}); S = null; UI.login.error = ""; UI.survey.open = false; ACCOUNTS = FB() ? null : ACCOUNTS; if (FB()) await loadMe(); renderLogin(); window.scrollTo(0, 0); return; }
  if (b.dataset.lfilter) { UI.leavesFilter = b.dataset.lfilter; render(); return; }
  if (b.hasAttribute("data-more")) { UI.moreOpen = !UI.moreOpen; render(); return; }
  if (b.dataset.tab) { UI.moreOpen = false; UI.tab = b.dataset.tab; UI.caseId = null; if (b.dataset.tab === "access") { UI.users.list = null; UI.users.sample = null; } render(); window.scrollTo(0, 0); return; }
  if (b.dataset.open) { UI.tab = "cases"; UI.caseId = b.dataset.open; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-back")) { UI.caseId = null; render(); return; }
  if (b.hasAttribute("data-createcase")) {
    const f = UI.planner; const j = await act({ type: "createCase", empId: f.empId, reason: f.reason, opts: optsFrom(f) });
    if (j) { UI.tab = "cases"; UI.caseId = j.createdId; render(); window.scrollTo(0, 0); toast("Saved. The first notice is due in 5 business days."); } return;
  }
  if (b.hasAttribute("data-submitreq")) {
    const f = UI.req, A = UI.reqAI;
    const j = await act({ type: "createCase", empId: S.me.empId, reason: f.reason, opts: optsFrom(f), intake: A.draft ? { text: A.sent, ai: A.draft } : undefined });
    if (j) { UI.reqAI = { text: "", sent: "", draft: null, busy: false, error: "" }; UI.reqOpen = false; render(); }
    if (j) { const c = j.data.cases.find((x) => x.id === j.createdId); const n = c && c.tasks.find((t) => t.key === "notice" || t.key === "confirm"); toast(n ? `Sent. HR will get back to you by ${fmtS(n.due)}.` : "Sent to HR."); window.scrollTo(0, 0); }
    return;
  }
  if (b.hasAttribute("data-flag")) {
    const f = UI.flag; if (!f.empId) { toast("Choose a team member first"); return; }
    const j = await act({ type: "flag", empId: f.empId, heard: f.heard, note: f.note }, "Thanks. HR has it and will follow up.");
    if (j) { UI.flag = { empId: "", heard: TODAY, note: "" }; render(); } return;
  }
  if (b.dataset.convert) {
    const CV = UI.conv.caseId === b.dataset.convert ? UI.conv : { draft: null }, d = CV.draft && CV.draft.reason !== "unclear" ? CV.draft : null;
    const lens = {}; if (d) LEN_KEYS.forEach((k) => { if (d[k] != null) lens[k] = d[k]; });
    const j = await act({ type: "convert", caseId: b.dataset.convert, reason: document.getElementById("cv-reason").value, opts: { ...optsFrom(UI.planner), ...lens, relation: (d && d.relation) || "parent", start: document.getElementById("cv-start").value }, intake: CV.draft ? { ai: CV.draft, text: "" } : undefined }, "Leave type set");
    if (j) UI.conv = { caseId: null, draft: null, busy: false, error: "" };
    return;
  }
  if (b.hasAttribute("data-intake")) {
    const A = UI.reqAI, t = (document.getElementById("rq-text")?.value || "").trim();
    A.text = t; if (t.length < 4) { A.error = "Write a sentence or two about what you need."; render(); return; }
    A.busy = true; A.error = ""; render();
    try { const d = await askClerk(t); A.draft = d; A.sent = t; applyDraft(UI.req, d); }
    catch (e) { if (e.message === "signed out") return; A.error = e.message; }
    A.busy = false; render(); return;
  }
  if (b.dataset.suggest) {
    const c = D().cases.find((x) => x.id === b.dataset.suggest); if (!c) return;
    UI.conv = { caseId: c.id, draft: null, busy: true, error: "" }; render();
    try { UI.conv.draft = await askClerk(c.notes); } catch (e) { if (e.message === "signed out") return; UI.conv.error = e.message; }
    UI.conv.busy = false; render(); return;
  }
  if (b.dataset.delete) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; b.classList.add("primary"); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Delete this leave"; b.classList.remove("primary"); } }, 4000); return; }
    const j = await act({ type: "deleteCase", caseId: b.dataset.delete }, "Deleted"); if (j) { UI.caseId = null; render(); } return;
  }
  if (b.hasAttribute("data-reset")) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = SAMPLE() ? "Tap again to reset your copy" : "Tap again to reset for everyone"; b.classList.add("primary"); return; }
    await act({ type: "reset" }, "Sample data is back"); return;
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && UI.fb.open) { UI.fb.note = document.getElementById("fb-note")?.value || ""; closeFeedback(); document.getElementById("fbBtn").focus(); return; }
  if (ev.key === "Enter" && ev.target.matches("tr[data-open]")) ev.target.click();
  if (ev.key === "Enter" && ev.target.id === "lg-pw") { ev.preventDefault(); store.set("ll-pw", ev.target.value, sessionStorage); toast("Now tap a user to sign in"); }
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  const formName = el.closest && el.closest("[data-form]")?.dataset.form;
  if (["home", "users", "addEmp"].includes(formName) && el.dataset.bind) {
    const t = { home: UI.home.form, users: UI.users, addEmp: UI.addEmp }[formName];
    t[el.dataset.bind] = el.type === "checkbox" ? el.checked : el.hasAttribute("data-num") ? Math.max(0, +el.value || 0) : el.value;
    return;
  }
  if (!S) return;
  if (el.dataset.userRole) { usersChange({ op: "role", email: el.dataset.userRole, role: el.value }, "Role changed"); return; }
  if (el.hasAttribute("data-lock")) { usersChange({ op: "lock", on: el.checked }, el.checked ? "Company accounts only" : "Any Google account can be invited"); return; }
  if (UI.letter && ["lt-on", "lt-how"].includes(el.id)) { readLetterFields(); return; }
  if (el.hasAttribute("data-imp-file")) {
    const f = el.files && el.files[0]; if (!f) return;
    if (/\.(xlsx|xls|numbers)$/i.test(f.name)) { UI.imp.error = "That is a spreadsheet file. Save it as CSV first (File, Save As or Download, CSV), then upload that."; UI.imp.rows = null; render(); return; }
    if (f.size > 2e6) { UI.imp.error = "That file is over 2 MB. Is it the right one?"; render(); return; }
    f.text().then((t) => { readRoster(t, f.name); render(); }); return;
  }
  if (el.id === "ap-notify") { UI.appr.notify = el.checked; render(); return; }
  if (el.dataset.edd) { const [caseId, step] = el.dataset.edd.split("|"); act({ type: "eddCheck", caseId, step, done: el.checked }, el.checked ? "Nice. Ticked off." : "Unticked"); return; }
  if (el.dataset.task) { const [caseId, key] = el.dataset.task.split("|"); act({ type: "toggleTask", caseId, key, done: el.checked }, el.checked ? "Marked done" : "Reopened"); return; }
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
  if (el.id === "lv-q") { UI.leavesQ = el.value; render(); const i = document.getElementById("lv-q"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } return; }
  if (UI.letter && ["lt-subject", "lt-body"].includes(el.id)) { UI.letter[el.id === "lt-body" ? "body" : "subject"] = el.value; return; }
  const formName = el.closest && el.closest("[data-form]")?.dataset.form;
  if (["home", "users", "addEmp"].includes(formName) && el.dataset.bind && el.type !== "checkbox" && el.type !== "radio") {
    const t = { home: UI.home.form, users: UI.users, addEmp: UI.addEmp }[formName];
    t[el.dataset.bind] = el.hasAttribute("data-num") ? Math.max(0, +el.value || 0) : el.value;
    return;
  }
  if (el.hasAttribute && el.hasAttribute("data-ai-text")) { UI.reqAI.text = el.value; return; }
  if (el.id === "ap-note") { UI.appr.note = el.value; refreshApproval(); return; }
  if (el.closest('[data-form="flag"]') && el.dataset.bind) UI.flag[el.dataset.bind] = el.value;
});
function bind(el) {
  const form = el.closest("[data-form]"); if (!form || !el.dataset.bind) return;
  const target = { planner: UI.planner, req: UI.req, flag: UI.flag, wiz: UI.wiz }[form.dataset.form];
  let v = el.type === "checkbox" ? el.checked : el.value; if (el.hasAttribute("data-num")) v = Math.max(0, +v || 0);
  if (el.type === "date" && !v) return;
  target[el.dataset.bind] = v;
  if (el.dataset.bind === "reason" && REASONS[v].rel === "bereave" && !REL.bereave.some((r) => r[0] === target.relation)) target.relation = "parent";
  if (!["flag", "wiz"].includes(form.dataset.form)) render(); // re-rendering on blur would swallow the next click
}

window.matchMedia("(max-width:640px)").addEventListener("change", () => { if (S) render(); });
// Pick up changes from other test users when the tab comes back into view.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S) return;
  const a = document.activeElement; if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
  try { accept(await api("state")); render(); } catch (e) {}
});

(async () => {
  await joinFromLink();
  const u0 = new URL(location.href), ae = u0.searchParams.get("auth_error");
  const AUTH_MSG = { cancelled: "Google sign-in was cancelled.", expired: "Sign-in took too long or started in another browser. Try again.", failed: "Sign-in could not be confirmed. Try again.", unreachable: "Could not reach Google. Try again.", unverified: "Your Google account email is not verified yet.", off: "Google sign-in is not set up yet." };
  if (ae) { UI.login.error = AUTH_MSG[ae] || "Sign-in did not work. Try again."; u0.searchParams.delete("auth_error"); history.replaceState(null, "", u0.pathname + (u0.search || "") + u0.hash); }
  try { const site = await (await fetch("/api/site")).json(); MODE = site.mode || MODE; } catch (e) {}
  if (FB()) await loadMe();
  try {
    accept(await api("state"));
    if (FB() && UI.survey.done === null) { try { UI.survey.done = !!(await api("survey")).answers; } catch (e) {} }
    seenPersona(S.me.email); render();
  }
  catch (e) { if (e.message !== "signed out") renderLogin(); }
})();
