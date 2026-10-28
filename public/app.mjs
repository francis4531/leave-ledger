import {
  addDays, diffDays, fmt, fmtS, money, esc, plural, RULES, REASONS, REL, relName,
  weeklyBenefit, eligibility, buildPlan, makeTasks,
  planFor as planForD, caseDates as caseDatesD, caseStatus as caseStatusD,
} from "./engine.mjs";

/* ---------- State ---------- */
let S = null;          // {me, today, data}
let TODAY = "";
const UI = {
  tab: null, caseId: null,
  planner: { empId: "e1", reason: "pregnancy_bonding", relation: "parent", start: "", weeks: 6, disWeeks: 10, bondWeeks: 12, days: 5, hours: 8 },
  req: { reason: "own_health", relation: "parent", start: "", weeks: 4, disWeeks: 10, bondWeeks: 12, days: 3, hours: 8 },
  flag: { empId: "", heard: "", note: "" },
  login: { error: "" },
  reqAI: { text: "", sent: "", draft: null, busy: false, error: "" },
  conv: { caseId: null, draft: null, busy: false, error: "" },
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
  hr: [["overview", "Today"], ["cases", "Leaves"], ["plan", "Plan a leave"], ["employees", "Employees"], ["settings", "Settings"], ["myleave", "My leave"]],
  mgr: [["team", "My team"], ["myleave", "My leave"]],
  emp: [["myleave", "My leave"]],
};
const viewOf = () => (UI.tab === "myleave" ? "emp" : S.me.role === "mgr" ? "mgr" : S.me.role === "hr" ? "hr" : "emp");

/* ---------- API ---------- */
async function api(path, body) {
  const r = await fetch("/api/" + path, body === undefined ? { credentials: "same-origin" } : {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: "The server did not answer. Try again in a moment." }));
  if (r.status === 401 && path !== "login") { S = null; renderLogin(); throw new Error("signed out"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}
function accept(j) {
  S = { me: j.me, today: j.today, data: j.data, ai: j.ai || { on: false } }; TODAY = j.today;
  if (!UI.tab || !TABS[S.me.role].some(([k]) => k === UI.tab)) UI.tab = TABS[S.me.role][0][0];
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
const fmlaCovered = () => D().company.headcount >= 50 && D().company.within75;

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
  if (!fmlaCovered()) facts.push({ t: `Federal FMLA does not apply here: it starts at 50 employees within 75 miles.`, c: RULES.fmla.cite });
  return `${p.warnings.map((w) => `<div class="warnbox ${w.bad ? "bad" : ""}">${esc(w.t)}</div>`).join("")}
  ${facts.length ? `<div class="notes">${facts.map((f) => `<div class="note"><span>${esc(f.t)}</span><span class="cite">${esc(f.c)}</span></div>`).join("")}</div>` : ""}`;
}
function payHTML(p) {
  if (!(p.pays.sdi || p.pays.pfl)) return "";
  const w = p.wba;
  return `<div class="infobox">${w ? `State pay estimate: about <b>${money(w.amount)} a week</b>, which is ${Math.round(w.rate * 100)}% of ${money(w.weekly)} average weekly wages${w.capped ? " (capped at the 2026 maximum)" : ""}. The state (EDD) pays this, not the employer, and makes the final calculation.` : "The state (EDD) works out the amount from past wages."} ${p.pays.sdi ? `Disability pay claims are due within ${RULES.sdi.fileWithin} days of the first day out. ` : ""}${p.pays.pfl ? `Family leave pay claims are due within ${RULES.pfl.fileWithin} days of the first day of leave.` : ""}</div>`;
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
    ["Federal FMLA", "FMLA", c50, "Runs at the same time as the state leaves.", "Starts at 50 employees within 75 miles"],
    ["State pay while out", "SDI and PFL", true, "The state pays 70 to 90% of wages. The employer does not pay this.", ""],
    ["Paid sick leave", "", true, "40 hours a year, for the employee or a sick family member.", ""],
    ["Bereavement leave", "", c5, "5 days for each family death, within 3 months.", "Applies at 5 or more employees"],
    ["Reproductive loss leave", "", c5, "5 days per loss, up to 20 a year. No documentation.", "Applies at 5 or more employees"],
  ];
}

/* ---------- Copilot helpers ---------- */
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
async function askCopilot(text) {
  const r = await fetch("/api/intake", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  const j = await r.json().catch(() => ({ error: "The Copilot did not answer. Fill in the form yourself." }));
  if (r.status === 401) { S = null; renderLogin(); throw new Error("signed out"); }
  if (!r.ok) throw new Error(j.error || "The Copilot did not answer.");
  return j.draft;
}
function copilotBox() {
  const A = UI.reqAI, d = A.draft;
  let note = "";
  if (d && d.reason === "unclear") note = `<div class="cp-note warn">I could not tell what kind of time off this is. Pick it below, or add a little more detail and try again.</div>`;
  else if (d) { const u = unsure(d); note = `<div class="cp-note"><b>Here is what I understood:</b> ${esc(d.summary || describeDraft(d))}<div class="small" style="margin-top:4px">I filled in the form below.${u.length ? ` Please check what is marked in orange (${u.map((k) => FIELD_NAMES[k]).join(", ")}).` : " Check it, then send."}</div></div>`; }
  return `<div class="copilot">
    <div class="cp-h"><span class="spark" aria-hidden="true">✦</span><b>Tell us in your own words</b><span class="pill acc">Copilot</span></div>
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
  return `<section class="panel"><div class="panel-h"><h3>${I.source === "manager" ? "From the manager's note" : `In ${esc(first(e.name))}'s words`}</h3><span class="pill acc">✦ Copilot intake</span></div>
    <blockquote class="quote">${esc(I.text)}</blockquote>
    <div class="small"><span class="muted">Copilot read it as</span> <b>${esc(describeDraft(ai))}</b></div>
    <div class="small">${I.changed && I.changed.length ? `<span class="pill warn">Changed before sending: ${esc(I.changed.map((k) => FIELD_NAMES[k]).join(", "))}</span>` : `<span class="pill ok">Sent as the Copilot read it</span>`}</div>
    ${ai && ai.flag ? `<div class="warnbox">${esc(ai.flag)} The Copilot ignored it.</div>` : ""}
    ${ai && ai.ask && ai.ask.length ? `<div class="small"><span class="muted">Worth asking:</span> ${ai.ask.map(esc).join(" · ")}</div>` : ""}
    <p class="small muted">The Copilot only drafts. Eligibility, pay and deadlines come from the rules engine.</p></section>`;
}

/* ---------- HR: Today ---------- */
function taskRow(c, t, showWho) {
  const s = dueState(t), tx = taskText(c, t), e = emp(c.empId);
  return `<div class="qrow ${t.done ? "done" : ""}">
    <input type="checkbox" id="t-${c.id}-${t.key}" data-task="${c.id}|${t.key}" ${t.done ? "checked" : ""} ${!t.due && !t.done ? "disabled" : ""} aria-label="Mark done: ${esc(tx.label)}">
    <div><div class="t">${esc(tx.label)}${t.legal ? '<span class="bylaw" title="A deadline set by law">BY LAW</span>' : ""}</div>
    <div class="s">${showWho ? `<button class="linkish" data-open="${c.id}">${esc(e.name)}</button> · ${esc(REASONS[c.reason].hr)}` : esc(tx.hint || "")}</div></div>
    ${pill(s.t, s.cls)}</div>`;
}
function hrOverview() {
  const open = openTasks();
  const now = open.filter((x) => dueState(x.t).g === "now"), week = open.filter((x) => dueState(x.t).g === "week"), later = open.filter((x) => dueState(x.t).g === "later");
  const out = D().cases.filter((c) => caseStatus(c).t === "On leave");
  const back30 = D().cases.filter((c) => { const d = caseDates(c); return d.end && d.end > TODAY && diffDays(TODAY, d.end) <= 30; });
  const active = D().cases.filter((c) => caseStatus(c).t !== "Returned");
  const log = (D().log || []).slice(0, 6);
  const sum = now.length
    ? `<span class="bad"><b>${now.length} ${now.length === 1 ? "thing needs" : "things need"} your attention now.</b></span> ${week.length ? `${week.length} more ${week.length === 1 ? "is" : "are"} due in the next 7 days.` : ""}`
    : week.length ? `Nothing is late. <b>${week.length}</b> ${week.length === 1 ? "thing is" : "things are"} due in the next 7 days.` : "You are all caught up.";
  const group = (title, color, items) => items.length ? `<div class="qgroup"><div class="qhead"><span class="dot" style="background:${color}"></span>${title} · ${items.length}</div><div class="queue">${items.map(({ c, t }) => taskRow(c, t, true)).join("")}</div></div>` : "";
  return `<div class="head"><div><h2 class="greet">${greeting()}, ${esc(first(S.me.name))}</h2><p class="sumline" style="margin-top:6px">${sum}</p></div><div class="btns"><button class="btn primary" data-tab="plan">Plan a leave</button></div></div>
  <div class="stats">
    <div class="stat ${now.length ? "alert" : ""}"><div class="label">Late or due today</div><div class="n">${now.length}</div></div>
    <div class="stat"><div class="label">Due this week</div><div class="n">${week.length}</div></div>
    <div class="stat"><div class="label">Out today</div><div class="n">${out.length}</div></div>
    <div class="stat"><div class="label">Back within 30 days</div><div class="n">${back30.length}</div></div>
  </div>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h3>Your to-do list</h3><span class="small muted">Weekends and company holidays are skipped</span></div>
      ${!open.length ? `<div class="allclear">✓ Nothing to do. New leave requests will add their steps here.</div>` : ""}
      ${group("Do now", "var(--bad)", now)}${group("Next 7 days", "var(--warn)", week)}
      ${later.length ? `<details class="more"><summary>Show ${later.length} later ${later.length === 1 ? "item" : "items"}</summary>${group("Later", "var(--line)", later)}</details>` : ""}
    </section>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h3>Who is out</h3><span class="small muted">${active.length} active</span></div>
        <div class="queue">${active.map((c) => { const d = caseDates(c), s = caseStatus(c), e = emp(c.empId); return `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="person">${avatar(e, "sm")}<div><button class="linkish" data-open="${c.id}">${esc(e.name)}</button><div class="s">${esc(REASONS[c.reason].hr)}${d.end ? ` · <span class="mono">${range(d.start, d.end)}</span>` : ""}</div></div></div>${pill(s.t, s.cls)}</div>`; }).join("") || '<p class="muted">Nobody is out or scheduled.</p>'}</div>
      </section>
      <section class="panel"><h3>Recent activity</h3><div class="queue">${log.map((l) => `<div class="qrow" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t" style="font-weight:500">${esc(l.text)}</div><div class="s">${esc(l.by)}</div></div><span class="small muted mono">${new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</span></div>`).join("") || '<p class="muted">Nothing yet.</p>'}</div></section>
    </div>
  </div>`;
}

/* ---------- HR: Leaves ---------- */
function hrCases() {
  if (UI.caseId) return hrCase(D().cases.find((c) => c.id === UI.caseId));
  return `<div class="head"><div><h2>Leaves</h2><p>Every request, where it came from, and what is left to do.</p></div><div class="btns"><button class="btn primary" data-tab="plan">Plan a leave</button></div></div>
  <section class="panel"><div class="tw"><table class="cards"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th><th>To do</th></tr></thead><tbody>
  ${D().cases.map((c) => { const d = caseDates(c), s = caseStatus(c), e = emp(c.empId); const late = c.tasks.filter((t) => !t.done && t.due && t.due <= TODAY).length; const left = c.tasks.filter((t) => !t.done && !t.optional).length;
    return `<tr class="click" data-open="${c.id}" tabindex="0"><td class="full"><div class="person">${avatar(e, "sm")}<div><b>${esc(e.name)}</b><div class="small muted">${esc(e.role)} · from ${{ hr: "HR", employee: "employee", manager: "manager" }[c.source]}</div></div></div></td><td data-l="Type">${esc(REASONS[c.reason].hr)}</td><td data-l="Dates" class="small">${d.end ? `<span class="mono">${range(d.start, d.end)}</span>` : '<span class="muted">Not set yet</span>'}</td><td data-l="Status">${pill(s.t, s.cls)}</td><td data-l="To do">${late ? pill(late + " late", "bad") : left ? pill(left + " open", "") : pill("All done", "ok")}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">No leaves yet.</td></tr>'}
  </tbody></table></div></section>`;
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
      ${CV.error ? `<p class="err">${esc(CV.error)}</p>` : ""}${CV.draft ? `<div class="cp-note">${CV.draft.reason === "unclear" ? "The note does not say enough to tell. Ask the employee." : `<b>Copilot suggests:</b> ${esc(describeDraft(CV.draft))}. Check it before saving.`}</div>` : ""}
      <div class="row"><div class="field"><label for="cv-reason">Leave type</label><select id="cv-reason">${reasonOptions(cd ? cd.reason : "own_health", "hr")}</select></div><div class="field"><label for="cv-start">Start date</label><input type="date" id="cv-start" value="${cd && cd.start ? cd.start : addDays(TODAY, 7)}"></div></div>
      <div class="btns"><button class="btn primary" data-convert="${c.id}">Set leave type</button></div></section>`;
  } else {
    const p = planFor(c);
    body = `${intakePanel(c, e)}<section class="panel"><div class="panel-h"><h3>The plan</h3><span class="small muted">${esc(REASONS[c.reason].hr)}${c.opts.relation && REASONS[c.reason].rel ? " · " + esc(relName(c.opts.relation)) : ""}</span></div>${timelineHTML(p)}${payHTML(p)}</section>
    <section class="panel"><h3>Does ${esc(first(e.name))} qualify?</h3>${eligHTML(p, c.reason)}${factsHTML(p)}</section>`;
  }
  return `<div class="head"><div><button class="linkish" data-back>← All leaves</button><div class="person" style="margin-top:10px">${avatar(e, "lg")}<div><h2>${esc(e.name)}</h2><p class="muted">${esc(e.role)} · hired ${fmt(e.hire)} · asked ${fmt(c.requested)}</p></div></div></div>${pill(s.t, s.cls)}</div>
  <div class="grid2"><div class="stack">${body}</div>
  <div class="stack"><section class="panel"><h3>Steps for HR</h3><div class="queue">${items}</div></section>
  <section class="panel"><h3>Manager's coverage plan</h3><p class="small ${c.coverage ? "" : "muted"}">${esc(c.coverage || "Nothing yet. The manager adds this from their own view.")}</p></section>
  <section class="panel"><div class="field"><label for="hrnote">Private HR notes</label><textarea id="hrnote" data-casenote="${c.id}" placeholder="Only HR sees this. Saves when you click away.">${esc(c.hrNote || "")}</textarea></div>
  <div class="btns"><button class="btn sm" data-delete="${c.id}">Delete this leave</button></div></section></div></div>`;
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
function hrEmployees() {
  const co = D().company;
  return `<div class="head"><div><h2>Employees</h2><p>Who qualifies for what, as of today. Hours and sick balances come from payroll; change them right here.</p></div></div>
  <section class="panel"><div class="tw"><table class="cards"><thead><tr><th>Employee</th><th>Hired</th><th class="num">Hours, last 12 months</th><th class="num">Family leave left</th><th class="num">Sick hours</th><th>Qualifies today for</th></tr></thead><tbody>
  ${D().employees.map((e) => { const el = eligibility(e, co, TODAY); const q = [["Family leave", el.cfra.ok], ...(el.fmla.covered ? [["FMLA", el.fmla.ok]] : []), ["Pregnancy leave", el.pdl.ok], ["Bereavement", el.short.ok], ["Sick leave", el.sick.ok]];
    return `<tr><td class="full"><div class="person">${avatar(e, "sm")}<div><b>${esc(e.name)}</b><div class="small muted">${esc(e.role)}</div></div></div></td><td data-l="Hired" class="small mono">${fmt(e.hire)}</td>
  <td data-l="Hours, 12 mo" class="num"><input type="number" aria-label="Hours worked in the last 12 months for ${esc(e.name)}" id="h-${e.id}" data-emp="${e.id}|hours12" value="${e.hours12}" style="width:90px;text-align:right"></td>
  <td data-l="Family leave left" class="num">${el.cfra.ok ? plural(el.cfra.remaining, "week") : '<span class="muted">Not yet</span>'}</td>
  <td data-l="Sick hours" class="num"><input type="number" aria-label="Sick hours for ${esc(e.name)}" id="s-${e.id}" data-emp="${e.id}|sick" value="${e.sick}" style="width:72px;text-align:right"></td>
  <td class="full"><div class="btns" style="gap:4px">${q.map(([n, ok]) => pill((ok ? "✓ " : "✕ ") + n, ok ? "ok" : "")).join("")}</div></td></tr>`; }).join("")}
  </tbody></table></div><p class="small muted">Sick leave builds up at 1 hour for every 30 worked. You can cap the balance at 80 hours and yearly use at 40.</p></section>`;
}

/* ---------- HR: Settings ---------- */
function copilotStats() {
  const L = (D().intakeLog || []).filter((x) => x.ai), u = D().aiUsage || {}, mk = TODAY.slice(0, 7), m = (u.month || {})[mk];
  const clean = L.filter((x) => !x.changed.length).length;
  const byField = ["reason", "relation", "start", "length"].map((k) => [k, L.filter((x) => x.changed.includes(k)).length]);
  const haiku = /haiku-5-5/.test(S.ai.model || "");
  const cost = m && haiku ? (m.input * 0.10 + m.output * 0.50) / 1e6 : null;
  return `<h3>✦ Copilot intake</h3>
    ${S.ai.on ? `<p class="small">On · model <code>${esc(S.ai.model)}</code>. Employees can describe their need in their own words and the Copilot fills in the request form. It never decides eligibility.</p>` : `<div class="infobox">Off. Add <code>ANTHROPIC_API_KEY</code> in Netlify, under Site configuration, Environment variables, then redeploy.</div>`}
    <div class="balance">
      <div><span class="label">Requests this month</span><span class="v">${m ? m.requests : 0}</span><span class="small muted">${m && m.requests ? `${Math.round(m.ms / m.requests / 100) / 10}s average` : "None yet"}</span></div>
      <div><span class="label">Sent without changes</span><span class="v">${L.length ? Math.round((clean / L.length) * 100) + "%" : "n/a"}</span><span class="small muted">${clean} of ${L.length} sent requests</span></div>
      <div><span class="label">AI cost this month</span><span class="v">${cost !== null ? "$" + cost.toFixed(cost < 1 ? 4 : 2) : "n/a"}</span><span class="small muted">${haiku ? "At Haiku 5.5 list price" : "Model price not tracked"}</span></div>
    </div>
    ${L.length ? `<p class="small muted">Fixes users made before sending: ${byField.map(([k, n]) => `${FIELD_NAMES[k]} ${n}`).join(" · ")}. Each fix is a test case for the golden dataset.</p>
    <details class="more"><summary>Show the last ${Math.min(10, L.length)} intakes</summary><div class="tw"><table><thead><tr><th>When</th><th>Their words</th><th>Copilot read</th><th>Sent as</th></tr></thead><tbody>${L.slice(0, 10).map((x) => `<tr><td class="small mono">${new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}</td><td class="small">${esc(x.text.length > 90 ? x.text.slice(0, 90) + "…" : x.text)}</td><td class="small">${esc(REASONS[x.ai.reason]?.hr || "Not sure")}${x.ai.flag ? " ⚑" : ""}</td><td class="small">${esc(REASONS[x.final.reason]?.hr || x.final.reason)}${x.changed.length ? `<div class="muted">fixed: ${esc(x.changed.map((k) => FIELD_NAMES[k]).join(", "))}</div>` : ""}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}
function hrSettings() {
  const co = D().company;
  return `<div class="head"><div><h2>Settings</h2><p>The number of employees decides which laws apply. Changes here apply to every test account.</p></div></div>
  <section class="panel"><h3>Laws that apply to ${esc(co.name)}</h3><div class="lawlist">${lawRows().map(([n, ab, on, what, when]) => `<div><div><b>${n}</b>${ab ? ` <span class="muted small">${ab}</span>` : ""}<div class="why">${what}${!on && when ? ` ${when}.` : ""}</div></div>${on ? pill("Applies", "ok") : pill("Not yet", "")}</div>`).join("")}</div></section>
  <div class="grid2 even"><section class="panel"><h3>Company</h3>
    <div class="field"><label for="co-name">Company name</label><input type="text" id="co-name" value="${esc(co.name)}" data-co="name"></div>
    <div class="field"><label for="co-hc">Number of employees</label><input type="number" id="co-hc" min="1" value="${co.headcount}" data-co="headcount" data-num><span class="hint">Count everyone, full and part time. Try 50 to see federal FMLA switch on.</span></div>
    <label class="check"><input type="checkbox" id="co-75" ${co.within75 ? "checked" : ""} data-co="within75">At least 50 employees work within 75 miles of each other</label>
    <div class="field"><label for="co-hol">Company holidays</label><input type="text" id="co-hol" value="${esc(co.holidays.join(", "))}" data-co="holidays"><span class="hint">Dates as yyyy-mm-dd, separated by commas. Deadlines skip these days.</span></div>
  </section><section class="panel">
    <h3>State pay estimates</h3>
    <div class="row"><div class="field"><label for="co-max">Weekly maximum</label><input type="number" id="co-max" value="${co.wbaMax}" data-co="wbaMax" data-num><span class="hint">$1,765 for 2026 claims</span></div>
    <div class="field"><label for="co-band">90% rate applies up to</label><input type="number" id="co-band" value="${co.band90}" data-co="band90" data-num><span class="hint">Highest quarter wages. 2025 figure until the state publishes 2026.</span></div></div>
    <div class="infobox">Lower earners get about 90% of weekly wages and others about 70%, up to the weekly maximum. The state makes the final calculation.</div>
    ${copilotStats()}
    <h3>Test data</h3>
    <p class="small muted">Puts the sample company, employees and leaves back for every test account. Anything added since is removed.</p>
    <div class="btns"><button class="btn" data-reset>Reset to sample data</button></div>
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
  const avail = Math.min(e.sick, Math.max(0, 40 - e.sickUsedYr));
  const wba = weeklyBenefit(e, co);
  const p = buildPlan(e, co, f.reason, optsFrom(f));
  return `<div class="head"><div class="person">${avatar(e, "lg")}<div><h2 class="greet">Hi ${esc(first(e.name))}</h2><p class="muted">Your time off, your requests, and what to do next.</p></div></div></div>
  <section class="panel"><h3>What you have</h3><div class="balance">
    <div><span class="label">Sick leave</span><span class="v">${e.sick} hours</span><div class="meter"><span style="width:${Math.min(100, (e.sick / 80) * 100)}%"></span></div><span class="small muted">${avail} you can use this year</span></div>
    <div><span class="label">Family and medical leave</span><span class="v">${el.cfra.ok ? plural(el.cfra.remaining, "week") : "Not yet"}</span><div class="meter"><span style="width:${el.cfra.ok ? (el.cfra.remaining / 12) * 100 : 0}%"></span></div><span class="small muted">${el.cfra.ok ? "Your job is held for you" : "After 12 months and 1,250 hours"}</span></div>
    <div><span class="label">Pregnancy leave</span><span class="v">Up to 4 months</span><span class="small muted">From your first day</span></div>
    <div><span class="label">Bereavement</span><span class="v">${el.short.ok ? "5 days" : "After 30 days"}</span><span class="small muted">For each family loss</span></div>
    <div><span class="label">State pay while out</span><span class="v">${wba ? "~" + money(wba.amount) + "/wk" : "Ask HR"}</span><span class="small muted">Paid by the state, not ${esc(co.name.split(" ")[0])}</span></div>
  </div></section>
  <div class="grid2">
    <div class="stack">${mine.length ? mine.map((c) => empCase(c)).join("") : `<section class="panel"><h3>No time off requested</h3><p class="muted">When you need time off, fill in the form. You will see what you qualify for before you send it, and HR replies within 5 business days.</p></section>`}</div>
    <section class="panel" data-form="req"><h3>Ask for time off</h3>
      ${S.ai.on ? copilotBox() : ""}
      <div class="field"><label for="rq-reason">What is it for?</label><select id="rq-reason" data-bind="reason">${reasonOptions(f.reason, "emp")}</select></div>
      ${R.rel ? relSelect("rq-rel", R.rel, f.relation) : ""}
      <div class="field"><label for="rq-start">First day off</label><input type="date" id="rq-start" value="${f.start}" data-bind="start"></div>
      ${lengthFields("rq-", f)}
      ${previewHTML(p, f.reason)}
      <p class="small muted">HR keeps the reason private. Your manager only sees the dates you are out.${f.reason === "repro" ? " Nobody will ask you for documentation." : ""}</p>
      <div class="btns"><button class="btn primary" data-submitreq>Send to HR</button></div>
    </section>
  </div>`;
}
function empCase(c) {
  const p = planFor(c), steps = [];
  const cert = c.tasks.find((t) => t.key === "cert"), notice = c.tasks.find((t) => t.key === "notice");
  const prot = p.segs.filter((s) => s.lane === "protect" && s.cls !== "none");
  if (notice && !notice.done) steps.push(`HR will confirm what you qualify for by <b>${fmtS(notice.due)}</b>.`);
  if (cert && !cert.done) steps.push(`Ask your doctor to fill in the medical certification, then send it to HR by <b>${fmtS(cert.due)}</b>.`);
  if (p.pays.sdi) steps.push(`Apply for state disability pay at SDI Online (edd.ca.gov) within ${RULES.sdi.fileWithin} days of your first day out. The first 7 days are not paid by the state, but you can use sick leave.`);
  if (p.pays.pfl) steps.push(`Apply for Paid Family Leave at SDI Online (edd.ca.gov) within ${RULES.pfl.fileWithin} days of your first day of leave.`);
  if (prot.length) steps.push(`Your job is held for you from <b>${fmtS(prot[0].start)}</b> to <b>${fmtS(addDays(prot[prot.length - 1].end, -1))}</b>, and your health coverage stays the same.`);
  if (c.reason === "bereavement") steps.push("HR may ask for proof of the death within 30 days of your first day off.");
  if (c.reason === "sick") steps.push("Your next pay stub will show your new balance.");
  const s = caseStatus(c);
  return `<section class="panel"><div class="panel-h"><h3>${esc(REASONS[c.reason].emp)}</h3>${pill(s.t, s.cls)}</div>${timelineHTML(p)}
  <div><div class="label" style="margin-bottom:8px">What happens next</div><ol class="steps">${steps.map((x) => `<li><span>${x}</span></li>`).join("")}</ol></div>
  ${p.warnings.length ? `<div class="infobox">HR will go over a few details of this request with you before confirming dates.</div>` : ""}</section>`;
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
      <div class="small">Out <span class="mono">${fmtS(c.start)}</span>, back <span class="mono">${fmtS(c.end)}</span>. HR confirms the return date.</div>
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
async function signIn(email) {
  const pwEl = document.getElementById("lg-pw"); const pw = pwEl ? pwEl.value : "";
  if (!pw) { UI.login.error = "Enter the test password first, then tap a user."; await renderLogin(); document.getElementById("lg-pw").focus(); return; }
  store.set("ll-pw", pw, sessionStorage);
  try { const j = await api("login", { email, password: pw }); UI.login.error = ""; UI.tab = null; UI.caseId = null; accept(j); render(); window.scrollTo(0, 0); }
  catch (e) { UI.login.error = e.message; store.set("ll-pw", "", sessionStorage); renderLogin(); }
}

/* ---------- Shell ---------- */
function setChrome(on) {
  document.getElementById("views").hidden = true;
  document.getElementById("who").hidden = !on;
  if (!on) document.getElementById("tabs").hidden = true;
  document.getElementById("coName").textContent = on ? `${D().company.name} · ${D().company.city}` : "California leave, made simple";
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
  document.getElementById("who").innerHTML = `${avatar(me)}<span class="meta"><span class="nm">${esc(S.me.name)}</span><span class="r">${esc(roleName)}</span></span><button class="btn sm" data-logout>Switch user</button>`;
  const tabs = document.getElementById("tabs"), list = TABS[S.me.role];
  tabs.hidden = list.length < 2;
  const late = S.me.role === "hr" ? lateCount() : 0;
  tabs.innerHTML = list.map(([k, n]) => `<button role="tab" class="${k === "myleave" && list.length > 2 ? "push" : ""}" data-tab="${k}" aria-selected="${UI.tab === k}">${n}${k === "overview" && late ? `<span class="count" title="${late} late or due today">${late}</span>` : ""}</button>`).join("");
  const focusId = document.activeElement && document.activeElement.id;
  const v = viewOf();
  const html = v === "emp" ? empView() : v === "mgr" ? mgrView() : { overview: hrOverview, cases: hrCases, plan: hrPlan, employees: hrEmployees, settings: hrSettings }[UI.tab]();
  document.getElementById("root").innerHTML = `<main>${html}<div class="foot"><span>Test site with a made-up company. Rules checked October 2026 for California employers. Not legal advice.</span><a href="/strategy">Product strategy progress</a></div></main>`;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
  if (v === "emp" && UI.reqAI.draft) {
    const map = { reason: ["rq-reason"], relation: ["rq-rel"], start: ["rq-start"], length: ["rq-wk", "rq-dy", "rq-hr", "rq-dis", "rq-bond"] };
    unsure(UI.reqAI.draft).forEach((k) => (map[k] || []).forEach((id) => document.getElementById(id)?.closest(".field")?.classList.add("needs-check")));
  }
  saveUI();
}
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3000); }

/* ---------- Events ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button, tr[data-open]"); if (!b) return;
  if (b.dataset.pick) { signIn(b.dataset.pick); return; }
  if (!S) return;
  if (b.hasAttribute("data-logout")) { await api("logout", {}).catch(() => {}); S = null; UI.login.error = ""; renderLogin(); window.scrollTo(0, 0); return; }
  if (b.dataset.tab) { UI.tab = b.dataset.tab; UI.caseId = null; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.open) { UI.tab = "cases"; UI.caseId = b.dataset.open; render(); window.scrollTo(0, 0); return; }
  if (b.hasAttribute("data-back")) { UI.caseId = null; render(); return; }
  if (b.hasAttribute("data-createcase")) {
    const f = UI.planner; const j = await act({ type: "createCase", empId: f.empId, reason: f.reason, opts: optsFrom(f) });
    if (j) { UI.tab = "cases"; UI.caseId = j.createdId; render(); window.scrollTo(0, 0); toast("Saved. The first notice is due in 5 business days."); } return;
  }
  if (b.hasAttribute("data-submitreq")) {
    const f = UI.req, A = UI.reqAI;
    const j = await act({ type: "createCase", empId: S.me.empId, reason: f.reason, opts: optsFrom(f), intake: A.draft ? { text: A.sent, ai: A.draft } : undefined });
    if (j) UI.reqAI = { text: "", sent: "", draft: null, busy: false, error: "" };
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
    try { const d = await askCopilot(t); A.draft = d; A.sent = t; applyDraft(UI.req, d); }
    catch (e) { if (e.message === "signed out") return; A.error = e.message; }
    A.busy = false; render(); return;
  }
  if (b.dataset.suggest) {
    const c = D().cases.find((x) => x.id === b.dataset.suggest); if (!c) return;
    UI.conv = { caseId: c.id, draft: null, busy: true, error: "" }; render();
    try { UI.conv.draft = await askCopilot(c.notes); } catch (e) { if (e.message === "signed out") return; UI.conv.error = e.message; }
    UI.conv.busy = false; render(); return;
  }
  if (b.dataset.delete) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; b.classList.add("primary"); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Delete this leave"; b.classList.remove("primary"); } }, 4000); return; }
    const j = await act({ type: "deleteCase", caseId: b.dataset.delete }, "Deleted"); if (j) { UI.caseId = null; render(); } return;
  }
  if (b.hasAttribute("data-reset")) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to reset for everyone"; b.classList.add("primary"); return; }
    await act({ type: "reset" }, "Sample data is back"); return;
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.matches("tr[data-open]")) ev.target.click();
  if (ev.key === "Enter" && ev.target.id === "lg-pw") { ev.preventDefault(); store.set("ll-pw", ev.target.value, sessionStorage); toast("Now tap a user to sign in"); }
});
document.addEventListener("change", (ev) => {
  const el = ev.target; if (!S) return;
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
  if (el.hasAttribute && el.hasAttribute("data-ai-text")) { UI.reqAI.text = el.value; return; }
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

// Pick up changes from other test users when the tab comes back into view.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S) return;
  const a = document.activeElement; if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
  try { accept(await api("state")); render(); } catch (e) {}
});

(async () => {
  try { accept(await api("state")); render(); }
  catch (e) { if (e.message !== "signed out") renderLogin(); }
})();
