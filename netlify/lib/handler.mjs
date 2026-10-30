// Leave Ledger API logic. Storage is injected so this runs under Netlify Blobs or a local Map.
// Two modes: the test site (shared sample data, one password) and the preview site (LL_MODE=feedback)
// with invite links, Google sign-in, company workspaces, feedback, a survey and an admin inbox.
import crypto from "node:crypto";
import * as E from "../../public/engine.mjs";
import STRATEGY from "./strategy-data.mjs";
import { runIntake, validate as validateDraft, changedFields, DEFAULT_MODEL } from "./intake.mjs";
import { DKEY, loadDecisions, cleanDecision, mirrorToGitHub } from "./decisions.mjs";
import { IKEY, FKEY, SKEY, SURVEY, loadInvites, validCode, newCode, addFeedback, cleanFeedback, cleanSurvey, summarize, aiGlobalOk, dict } from "./feedback.mjs";
import { json, err, redirect, withCookies, signObj, readObj, cookieOf, setCookie, safeEqual } from "./session.mjs";
import { googleOn, startGoogle, finishGoogle, upsertUser, userCookie, clearUserCookie, currentUser, saveUser, isAdminEmail, safeNext, baseUrl } from "./google.mjs";
import { ROLES, EMAIL_RE, loadOrg, saveOrg, loadOrgIndex, orgDataKey, memberFor, domainOk, listPending, acceptInvite, declineInvite, cleanCreate, createOrg, acctFor, changeMembers } from "./orgs.mjs";

export { signObj, readObj, cookieOf, setCookie };

export const ACCOUNTS = [
  { email: "grace@mesaverde.example", empId: "e7", name: "Grace Okafor", role: "hr", label: "HR admin" },
  { email: "dana@mesaverde.example", empId: "e9", name: "Dana Ortiz", role: "mgr", label: "Manager · Roastery" },
  { email: "mei@mesaverde.example", empId: "e10", name: "Mei Lin", role: "mgr", label: "Manager · Café" },
  { email: "priya@mesaverde.example", empId: "e1", name: "Priya Raman", role: "emp", label: "Employee · on pregnancy leave" },
  { email: "marcus@mesaverde.example", empId: "e2", name: "Marcus Bell", role: "emp", label: "Employee · family care coming up" },
  { email: "sofia@mesaverde.example", empId: "e3", name: "Sofia Delgado", role: "emp", label: "Employee · under 12 months" },
  { email: "jordan@mesaverde.example", empId: "e4", name: "Jordan Kim", role: "emp", label: "Employee · medical leave" },
  { email: "tomas@mesaverde.example", empId: "e6", name: "Tomás Herrera", role: "emp", label: "Employee · bereavement" },
  { email: "alana@mesaverde.example", empId: "e5", name: "Alana Fuentes", role: "emp", label: "Employee · new hire" },
  { email: "ben@mesaverde.example", empId: "e8", name: "Ben Whitaker", role: "emp", label: "Employee · no leave yet" },
];
const VIEWS = { hr: ["hr", "emp"], mgr: ["mgr", "emp"], emp: ["emp"] };
const KEY = "data-v1";
const WEEK = 7 * 24 * 3600;
const FB_TTL = 30 * 24 * 3600;
export const isFeedback = (env) => String(env.LL_MODE || "").toLowerCase() === "feedback";
export const tenantKey = (t) => `t/${t}/data`;

export const todayPT = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Session cookie: test site {e}; preview copy {t: invite code, e: persona}; workspace {o: workspace id}.
const readSession = (req, env) => { const o = readObj(cookieOf(req), env); return o && (!o.k || o.k === "s") ? o : null; };
const sessCookie = (o, env) => setCookie(signObj({ k: "s", ...o }, o.t || o.o ? FB_TTL : WEEK, env), o.t || o.o ? FB_TTL : WEEK);
const clearSess = () => setCookie("", 0);

export async function load(store, today, key = KEY, seed = true) {
  let D = await store.get(key, { type: "json" });
  if ((!D || !D.cases) && seed) {
    D = E.sampleData(today);
    D.log = [{ at: new Date().toISOString(), by: "System", text: "Sample data loaded" }];
    await store.setJSON(key, D);
  }
  return D && D.cases ? D : null;
}

// What each signed-in account may see. Managers get dates only; employees get their own record.
export function viewFor(D, acct, today, env = {}, space = { kind: "test" }) {
  const me = D.employees.find((e) => e.id === acct.empId);
  const out = { me: { email: acct.email, name: me.name, role: acct.role, label: acct.label, empId: me.id, views: VIEWS[acct.role] }, today, mode: isFeedback(env) ? "feedback" : "test", space, ai: { on: !!env.ANTHROPIC_API_KEY, model: env.LL_MODEL || DEFAULT_MODEL } };
  if (acct.role === "hr") return { ...out, data: D };
  // Employees get their own cases without HR notes, the manager's flag note, or intake text someone else wrote.
  const own = D.cases.filter((c) => c.empId === me.id && c.reason !== "unknown").map(({ hrNote, notes, intake, ...c }) => (intake && intake.source === "employee" ? { ...c, intake } : c));
  const data = { company: D.company, employees: [me], cases: own, team: [], teamCases: [] };
  if (acct.role === "mgr") {
    data.team = D.employees.filter((e) => e.mgr === me.id).map((e) => ({ id: e.id, name: e.name, role: e.role }));
    data.teamCases = D.cases.filter((c) => data.team.some((t) => t.id === c.empId)).map((c) => {
      const d = E.caseDates(c, D);
      const st = c.reason === "unknown" ? { t: "Sent to HR", cls: "warn" } : E.caseStatus(c, D, today);
      return { id: c.id, empId: c.empId, start: d.start, end: d.end, status: st, coverage: c.coverage, flagged: c.reason === "unknown" };
    });
  }
  return { ...out, data };
}

const newId = () => "c" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
const trim = (s, n = 1000) => String(s ?? "").slice(0, n);

function validOpts(reason, o) {
  if (!E.REASONS[reason] || reason === "unknown") return "Unknown leave type";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.start || "")) return "Pick a start date";
  const n = (v, lo, hi) => Number.isFinite(+v) && +v >= lo && +v <= hi;
  if (!n(o.weeks ?? 1, 1, 52) || !n(o.disWeeks ?? 1, 1, 30) || !n(o.bondWeeks ?? 0, 0, 12) || !n(o.days ?? 1, 1, 20) || !n(o.hours ?? 1, 1, 80)) return "Length is out of range";
  return null;
}
const cleanOpts = (o) => ({ start: o.start, weeks: +o.weeks || 1, disWeeks: +o.disWeeks || 1, bondWeeks: +o.bondWeeks || 0, days: +o.days || 1, hours: +o.hours || 1, relation: trim(o.relation, 20) || "parent" });

// Keeps what Clerk read next to what the user finally sent. This is the correction signal.
function attachIntake(D, c, a, today, source) {
  if (!a.intake || typeof a.intake !== "object" || !a.intake.text) return;
  const ai = validateDraft(a.intake.ai, today);
  const changed = ai ? changedFields(ai, c.reason, c.opts) : [];
  c.intake = { text: trim(a.intake.text, 1200), ai, changed, at: new Date().toISOString(), source };
  const lenOf = (o) => o ? (o.weeks ?? o.days ?? o.hours ?? (o.disWeeks != null ? `${o.disWeeks}+${o.bondWeeks}` : null)) : null;
  D.intakeLog = [{ at: c.intake.at, source, caseId: c.id, text: c.intake.text,
    ai: ai ? { reason: ai.reason, relation: ai.relation, start: ai.start, length: lenOf(ai), confidence: ai.confidence, flag: ai.flag } : null,
    final: { reason: c.reason, relation: c.opts.relation, start: c.opts.start, length: lenOf({ ...c.opts, weeks: ["own_health", "family_care", "bonding"].includes(c.reason) ? c.opts.weeks : null, days: ["bereavement", "repro"].includes(c.reason) ? c.opts.days : null, hours: c.reason === "sick" ? c.opts.hours : null, disWeeks: c.reason === "pregnancy_bonding" ? c.opts.disWeeks : null }) },
    changed }, ...(D.intakeLog || [])].slice(0, 300);
}

// Returns an error string, or null after mutating D.
function apply(D, acct, a, today, kind = "test") {
  if (kind === "preview" && (a.type === "reset" || a.type === "updateCompany")) return "Not available in this preview";
  if (kind === "org" && a.type === "reset") return "Not available in a workspace";
  if (kind === "test" && a.type === "clearCases") return "Unknown action";
  const hr = acct.role === "hr", me = acct.empId;
  const emp = (id) => D.employees.find((e) => e.id === id);
  const kase = (id) => D.cases.find((c) => c.id === id);
  const who = emp(me).name;
  const log = (text) => { D.log = [{ at: new Date().toISOString(), by: who, text }, ...(D.log || [])].slice(0, 200); };
  switch (a.type) {
    case "createCase": {
      if (D.cases.length >= 500) return "This copy has reached its limit of 500 leaves. Delete some first.";
      if (!hr && D.cases.filter((c) => c.empId === me).length >= 20) return "You have 20 requests on record. Ask HR to clear old ones first.";
      const target = emp(a.empId);
      if (!target) return "Unknown employee";
      if (!hr && a.empId !== me) return "You can only request leave for yourself";
      const bad = validOpts(a.reason, a.opts || {}); if (bad) return bad;
      const opts = cleanOpts(a.opts);
      const plan = E.buildPlan(target, D.company, a.reason, opts);
      const c = { id: newId(), empId: a.empId, reason: a.reason, requested: today, opts, source: hr ? "hr" : "employee", tasks: E.makeTasks(a.reason, today, plan, D.company), coverage: "", notes: "" };
      attachIntake(D, c, a, today, hr ? "hr" : "employee");
      D.cases.unshift(c); log(`${hr ? "Opened" : "Requested"} ${E.REASONS[a.reason].hr.toLowerCase()} for ${target.name}${c.intake ? " (Clerk intake)" : ""}`); a._id = c.id; return null;
    }
    case "flag": {
      if (D.cases.length >= 500) return "This copy has reached its limit of 500 leaves. Ask HR to delete some first.";
      if (D.cases.filter((c) => c.reason === "unknown" && c.empId === a.empId).length >= 5) return "HR already has 5 open flags for this employee.";
      const target = emp(a.empId);
      if (!target || (target.mgr !== me && !hr)) return "Pick someone on your team";
      const heard = /^\d{4}-\d{2}-\d{2}$/.test(a.heard || "") && a.heard <= today ? a.heard : today;
      const c = { id: newId(), empId: a.empId, reason: "unknown", requested: heard, opts: { start: "" }, source: "manager", tasks: E.makeTasks("unknown", heard, { start: heard, end: heard }, D.company), coverage: "", notes: trim(a.note, 500) };
      D.cases.unshift(c); log(`Flagged a possible leave for ${target.name}`); return null;
    }
    case "toggleTask": {
      if (!hr) return "HR only";
      const c = kase(a.caseId); if (!c || !E.markTask(c, a.key, a.done, today, D.company.holidays)) return "Task not found";
      log(`${a.done ? "Completed" : "Reopened"} "${c.tasks.find((t) => t.key === a.key).label}" for ${emp(c.empId).name}`); return null;
    }
    case "setCoverage": {
      const c = kase(a.caseId); if (!c) return "Case not found";
      if (!hr && emp(c.empId).mgr !== me) return "Not your team";
      c.coverage = trim(a.text); log(`Updated coverage plan for ${emp(c.empId).name}`); return null;
    }
    case "setHrNote": {
      if (!hr) return "HR only";
      const c = kase(a.caseId); if (!c) return "Case not found"; c.hrNote = trim(a.text, 4000); return null;
    }
    case "convert": {
      if (!hr) return "HR only";
      const c = kase(a.caseId); if (!c || c.reason !== "unknown") return "Case not found";
      const bad = validOpts(a.reason, a.opts || {}); if (bad) return bad;
      const done = c.tasks.filter((t) => t.done);
      c.reason = a.reason; c.opts = cleanOpts(a.opts);
      const plan = E.buildPlan(emp(c.empId), D.company, c.reason, c.opts);
      c.tasks = E.makeTasks(c.reason, c.requested, plan, D.company).map((t) => { const o = done.find((x) => x.key === t.key); return o ? { ...t, done: true, doneOn: o.doneOn } : t; });
      if (a.intake) attachIntake(D, c, { intake: { ...a.intake, text: c.notes || a.intake.text } }, today, "manager");
      log(`Set leave type for ${emp(c.empId).name}: ${E.REASONS[c.reason].hr}`); return null;
    }
    case "deleteCase": {
      if (!hr) return "HR only";
      const c = kase(a.caseId); if (!c) return "Case not found";
      D.cases = D.cases.filter((x) => x.id !== a.caseId); log(`Deleted a case for ${emp(c.empId).name}`); return null;
    }
    case "updateEmployee": {
      if (!hr) return "HR only";
      const e = emp(a.id); if (!e) return "Employee not found";
      if (["hours12", "sick", "sickUsedYr", "cfraUsed", "hiQuarter"].includes(a.field)) e[a.field] = Math.max(0, Math.min(1e6, +a.value || 0));
      else if (a.field === "name" || a.field === "role") { const v = trim(a.value, 80).trim(); if (!v) return "Enter a value"; e[a.field] = v; }
      else if (a.field === "hire") { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.value || "") || a.value > today) return "Pick a hire date on or before today"; e.hire = a.value; }
      else if (a.field === "mgr") { if (a.value && (!emp(a.value) || a.value === e.id)) return "Pick a manager"; e.mgr = a.value || null; if (a.value) emp(a.value).isMgr = true; }
      else return "Field not editable";
      log(`Updated ${e.name}: ${a.field}`); return null;
    }
    case "updateCompany": {
      if (!hr) return "HR only";
      const co = D.company, f = a.field;
      if (f === "name") co.name = trim(a.value, 80) || co.name;
      else if (f === "headcount") co.headcount = Math.max(1, Math.min(100000, Math.round(+a.value || 1)));
      else if (f === "within75") co.within75 = !!a.value;
      else if (f === "wbaMax" || f === "band90") co[f] = Math.max(0, +a.value || 0);
      else if (f === "holidays") co.holidays = (Array.isArray(a.value) ? a.value : []).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(0, 40);
      else return "Field not editable";
      log(`Changed company setting: ${f}`); return null;
    }
    case "addEmployee": {
      if (!hr) return "HR only";
      if (D.employees.length >= 250) return "This workspace has reached its employee limit";
      const e = a.employee || {};
      const name = trim(e.name, 80).trim(); if (!name) return "Enter the employee's name";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.hire || "") || e.hire > today) return "Pick a hire date on or before today";
      if (e.mgr && !emp(e.mgr)) return "Pick a manager";
      const n = (v, hi) => Math.max(0, Math.min(hi, Math.round(+v || 0)));
      const id = "e" + crypto.randomBytes(4).toString("hex");
      D.employees.push({ id, name, role: trim(e.role, 80).trim() || "Employee", hire: e.hire, hours12: n(e.hours12, 4000), cfraUsed: 0, fmlaUsed: 0, sick: n(e.sick, 400), sickUsedYr: 0, reproUsed: 0, hiQuarter: n(e.hiQuarter, 1e6), mgr: e.mgr || null });
      if (e.mgr) emp(e.mgr).isMgr = true;
      log(`Added ${name}`); a._id = id; return null;
    }
    case "removeEmployee": {
      if (!hr) return "HR only";
      const e = emp(a.id); if (!e) return "Employee not found";
      if (e.id === me) return "You cannot remove yourself";
      if (D.cases.some((c) => c.empId === e.id)) return `${e.name} has leaves on record. Delete those first.`;
      D.employees = D.employees.filter((x) => x.id !== e.id);
      D.employees.forEach((x) => { if (x.mgr === e.id) x.mgr = null; });
      log(`Removed ${e.name}`); return null;
    }
    case "clearCases": {
      if (!hr) return "HR only";
      D.cases = []; D.log = [{ at: new Date().toISOString(), by: who, text: "Cleared all leaves" }]; return null;
    }
    case "reset": {
      if (!hr) return "HR only";
      const fresh = E.sampleData(today);
      const keep = { intakeLog: D.intakeLog || [], aiUsage: D.aiUsage || {} };
      Object.keys(D).forEach((k) => delete D[k]); Object.assign(D, fresh, keep);
      D.log = [{ at: new Date().toISOString(), by: who, text: "Reset to sample data" }]; return null;
    }
  }
  return "Unknown action";
}
/* ---------- Failed-attempt throttle (admin password, invite codes) ---------- */
const clientIp = (req) => req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
const thKey = (name, req) => `throttle/${name}/${crypto.createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 32)}`;
async function throttled(store, req, name, max) {
  const o = await store.get(thKey(name, req), { type: "json" });
  return !!(o && Date.now() - o.start < 15 * 60 * 1000 && o.count >= max);
}
async function failed(store, req, name) {
  const k = thKey(name, req), o = await store.get(k, { type: "json" });
  const fresh = !o || Date.now() - o.start >= 15 * 60 * 1000;
  await store.setJSON(k, fresh ? { start: Date.now(), count: 1 } : { ...o, count: o.count + 1 });
}

/* ---------- Who is asking, and which copy of the data they are in ---------- */
// Returns { kind: "test" | "preview" | "org" | null, key, acct, user, invite, invites, meta, member, D }.
async function resolve(req, store, env, today) {
  const s = readSession(req, env);
  if (!isFeedback(env)) return { kind: "test", key: KEY, acct: s && s.e ? ACCOUNTS.find((a) => a.email === s.e) || null : null };
  const user = await currentUser(req, store, env);
  const R = { kind: null, user, s };
  if (s && s.t) {
    const invites = await loadInvites(store), inv = invites.items[s.t];
    if (inv && !inv.disabled) return { ...R, kind: "preview", id: s.t, key: tenantKey(s.t), invite: inv, invites, acct: s.e ? ACCOUNTS.find((a) => a.email === s.e) || null : null };
  }
  if (s && s.o && user) {
    const meta = await loadOrg(store, s.o), member = memberFor(meta, user);
    if (meta && !meta.disabled && member && domainOk(meta, user)) {
      const D = await load(store, today, orgDataKey(meta.id), false);
      if (D) return { ...R, kind: "org", id: meta.id, key: orgDataKey(meta.id), meta, member, D, acct: acctFor(member, D) };
    }
  }
  return R;
}
const spaceInfo = (R) => R.kind === "org" ? { kind: "org", id: R.id, name: R.meta.name, domain: R.meta.domain, user: R.user.email } : R.kind === "preview" ? { kind: "preview", id: R.id, user: R.user ? R.user.email : null } : { kind: "test" };
const surveyId = (R) => (R.kind === "org" ? "org:" + R.id : R.id);

// The spaces a signed-in user can open: preview copies from invites, and company workspaces.
async function spacesFor(store, user, linkCode) {
  const invites = await loadInvites(store), out = [];
  const codes = new Set([...(user ? user.invites || [] : []), ...(linkCode ? [linkCode] : [])]);
  for (const c of codes) { const inv = invites.items[c]; if (inv && !inv.disabled) out.push({ kind: "preview", id: c, name: "Mesa Verde Coffee Roasters", note: "Sample company, your own copy" }); }
  if (user) for (const id of user.orgs || []) {
    const meta = await loadOrg(store, id), m = memberFor(meta, user);
    if (meta && m) out.push({ kind: "org", id, name: meta.name, role: m.role, roleName: ROLES[m.role], disabled: !!meta.disabled, domainBlocked: !domainOk(meta, user), mine: meta.createdBy === user.sub });
  }
  return out;
}
function canCreate(env, user, spaces) {
  if (!user) return { ok: false, why: "Sign in with Google first." };
  if (isAdminEmail(env, user.email)) return { ok: true };
  const rule = String(env.LL_WORKSPACE_SIGNUP || "invited").toLowerCase();
  if (rule === "off") return { ok: false, why: "New workspaces are not open yet." };
  // Counts every workspace this user has ever created, so handing off HR does not reset the limit.
  const owned = Math.max(user.orgsCreated || 0, spaces.filter((x) => x.kind === "org" && x.mine).length);
  if (owned >= 2) return { ok: false, why: "You can create up to 2 workspaces in the preview." };
  if (rule === "open" || spaces.some((x) => x.kind === "preview")) return { ok: true };
  return { ok: false, why: "Creating a workspace needs an invite to the preview." };
}

// Links a preview invite to a Google account, so that user can come back from any device.
async function linkInvite(store, user, code) {
  const invites = await loadInvites(store), inv = invites.items[code];
  if (!user || !inv || inv.disabled) return;
  inv.users = inv.users || [];
  if (!inv.users.some((u) => u.sub === user.sub)) { inv.users.push({ sub: user.sub, email: user.email, name: user.name, at: new Date().toISOString() }); await store.setJSON(IKEY, invites); }
  user.invites = user.invites || [];
  if (!user.invites.includes(code)) { user.invites.push(code); await saveUser(store, user); }
}
// Preview invites sent to a specific email are picked up when that user signs in with Google.
async function claimInviteEmails(store, user) {
  const invites = await loadInvites(store);
  for (const [code, inv] of Object.entries(invites.items)) if (inv.email && inv.email === user.email && !inv.disabled) await linkInvite(store, user, code);
}

export async function handle(req, store, env) {
  try { return await route_(req, store, env); }
  catch (e) { if (String(e.message).startsWith("Set LL_SECRET")) return err(e.message, 503); throw e; }
}
async function route_(req, store, env) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const today = todayPT();
  const FB = isFeedback(env);
  if (FB && String(env.LL_SECRET || "").length < 24) return err("Set LL_SECRET in Netlify (at least 24 random characters), then redeploy.", 503);

  // Refuse cross-site form posts. Browsers send Origin on POST; same-site requests match our own address.
  if (req.method === "POST") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin && origin !== baseUrl(req, env)) return err("Request blocked", 403);
  }

  if (route === "site" && req.method === "GET") return json({ mode: FB ? "feedback" : "test", google: FB && googleOn(env), contact: FB ? env.LL_CONTACT_EMAIL || null : null });
  if (route.startsWith("admin")) return FB ? handleAdmin(req, route, store, env, today) : err("Not found", 404);
  if (route.startsWith("auth/") || route === "me" || route === "space" || route.startsWith("org")) {
    if (!FB) return err("Not found", 404);
  }

  /* ----- Google sign-in ----- */
  if (route === "auth/google/start" && req.method === "GET") {
    if (!googleOn(env)) return redirect("/?auth_error=off");
    return startGoogle(req, env);
  }
  if (route === "auth/google/callback" && req.method === "GET") {
    const r = await finishGoogle(req, env);
    const clear = setCookie("", 0, "ll_oauth");
    const sep = (p) => (p.includes("?") ? "&" : "?");
    if (r.error) return redirect(r.next + sep(r.next) + "auth_error=" + r.error, [clear]);
    const user = await upsertUser(store, r.claims);
    if (r.intent === "admin") {
      if (!isAdminEmail(env, user.email)) return redirect("/inbox?auth_error=notadmin", [clear]);
      return redirect("/inbox", [clear, setCookie(signObj({ k: "admin", em: user.email }, ADMIN_TTL, env), ADMIN_TTL, "ll_admin")]);
    }
    // Workspace invites are shown on the spaces screen to accept or decline; nothing is joined automatically.
    await claimInviteEmails(store, user);
    const s = readSession(req, env);
    if (s && s.t) await linkInvite(store, user, s.t);
    await saveUser(store, user);
    return redirect(safeNext(r.next), [clear, userCookie(user, env)]);
  }
  if (route === "auth/signout" && req.method === "POST") return withCookies(json({ ok: true }), [clearUserCookie(), clearSess()]);

  const R = await resolve(req, store, env, today);

  if (route === "me" && req.method === "GET") {
    const linkCode = R.kind === "preview" && R.s && R.s.t ? R.id : null;
    const spaces = await spacesFor(store, R.user, linkCode);
    const pending = R.user ? await listPending(store, R.user) : [];
    return json({ mode: "feedback", google: googleOn(env), user: R.user ? { email: R.user.email, name: R.user.name, hd: R.user.hd } : null, current: R.kind ? { ...spaceInfo(R), persona: !!R.acct } : null, spaces, pending, create: canCreate(env, R.user, spaces) });
  }
  if ((route === "org/accept" || route === "org/decline") && req.method === "POST") {
    if (!R.user) return err("Sign in with Google first.", 401);
    const body = await req.json().catch(() => ({}));
    if (route === "org/decline") { await declineInvite(store, R.user, String(body.id || "")); return json({ ok: true }); }
    const problem = await acceptInvite(store, R.user, String(body.id || ""));
    if (problem) return err(problem, 403);
    await saveUser(store, R.user);
    return json({ ok: true }, 200, { "set-cookie": sessCookie({ o: body.id }, env) });
  }
  if (route === "space" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (body.kind === "preview") {
      const ok = (R.kind === "preview" && R.id === body.id) || (R.user && (R.user.invites || []).includes(body.id));
      const all = await loadInvites(store), inv = all.items[body.id];
      if (!ok || !inv || inv.disabled) return err("That preview is not available.", 403);
      if (!inv.joined) { inv.joined = new Date().toISOString(); await store.setJSON(IKEY, all); }
      await load(store, today, tenantKey(body.id));
      return json({ ok: true }, 200, { "set-cookie": sessCookie({ t: body.id }, env) });
    }
    if (body.kind === "org") {
      if (!R.user) return err("Sign in with Google first.", 401);
      const meta = await loadOrg(store, body.id), m = memberFor(meta, R.user);
      if (!meta || !m) return err("You do not have access to that workspace.", 403);
      if (meta.disabled) return err("That workspace is turned off.", 403);
      if (!domainOk(meta, R.user)) return err(`This workspace only allows @${meta.domain} Google accounts.`, 403);
      if (!(R.user.orgs || []).includes(meta.id)) { R.user.orgs = [...(R.user.orgs || []), meta.id]; await saveUser(store, R.user); }
      return json({ ok: true }, 200, { "set-cookie": sessCookie({ o: meta.id }, env) });
    }
    if (body.kind === "none") return json({ ok: true }, 200, { "set-cookie": clearSess() });
    return err("Bad request");
  }
  if (route === "org/create" && req.method === "POST") {
    if (!R.user) return err("Sign in with Google first.", 401);
    const gate = canCreate(env, R.user, await spacesFor(store, R.user, null));
    if (!gate.ok) return err(gate.why, 403);
    const o = cleanCreate(await req.json().catch(() => ({})), R.user);
    if (o.error) return err(o.error);
    const { meta, D } = createOrg(o, R.user, today);
    await store.setJSON(orgDataKey(meta.id), D);
    await saveOrg(store, meta);
    R.user.orgs = [...(R.user.orgs || []), meta.id]; R.user.orgsCreated = (R.user.orgsCreated || 0) + 1; await saveUser(store, R.user);
    return json({ ok: true, id: meta.id }, 200, { "set-cookie": sessCookie({ o: meta.id }, env) });
  }

  if (route === "accounts" && req.method === "GET") {
    const list = ACCOUNTS.map(({ email, label, empId, name, role }) => ({ email, label, empId, name, role }));
    if (!FB) return json({ mode: "test", accounts: list, configured: !!env.LL_TEST_PASSWORD });
    const pv = R.kind === "preview";
    return json({ mode: "feedback", invited: pv, accounts: pv ? list : [], configured: !!(env.LL_SECRET || env.LL_ADMIN_PASSWORD), surveyDone: !!(pv && (await surveyOf(store, R.id))) });
  }

  if (FB && route === "join" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").toLowerCase().trim();
    if (await throttled(store, req, "join", 20)) return err("Too many tries. Wait 15 minutes, then open your invite link again.", 429);
    const all = await loadInvites(store);
    const inv = validCode(code) && all.items[code];
    if (!inv || inv.disabled) { await failed(store, req, "join"); return err("This invite link is not active. Ask the sender for a new one.", 403); }
    if (!inv.joined) { inv.joined = new Date().toISOString(); await store.setJSON(IKEY, all); }
    await load(store, today, tenantKey(code));
    if (R.user) await linkInvite(store, R.user, code);
    return json({ ok: true }, 200, { "set-cookie": sessCookie({ t: code }, env) });
  }

  if (route === "login" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const acct = ACCOUNTS.find((a) => a.email === String(body.email || "").toLowerCase().trim());
    if (FB) {
      // Preview copies: no password. The invite is the key; picking a user just switches the view.
      if (R.kind !== "preview") return err("Open the invite link you were sent to start.", 401);
      if (!acct) return err("Pick one of the users listed.");
      const D = await load(store, today, R.key);
      touch(D, acct.email, "persona"); await store.setJSON(R.key, D);
      return json(viewFor(D, acct, today, env, spaceInfo(R)), 200, { "set-cookie": sessCookie({ t: R.id, e: acct.email }, env) });
    }
    if (!env.LL_TEST_PASSWORD) return err("This site has no test password yet. Set LL_TEST_PASSWORD in Netlify, then redeploy.", 503);
    const pw = String(body.password || "");
    if (!acct || !safeEqual(pw, env.LL_TEST_PASSWORD)) return err("That email and password do not match a test account.", 401);
    const D = await load(store, today);
    return json(viewFor(D, acct, today, env), 200, { "set-cookie": sessCookie({ e: acct.email }, env) });
  }
  if (route === "logout" && req.method === "POST") {
    // Preview: keep the invite so "Switch user" goes back to the picker. Workspace: back to the spaces list.
    const keep = R.kind === "preview" ? sessCookie({ t: R.id }, env) : clearSess();
    return json({ ok: true }, 200, { "set-cookie": keep });
  }

  if (FB && (R.kind === "preview" || R.kind === "org") && route === "survey" && req.method === "GET") return json({ questions: SURVEY, answers: (await surveyOf(store, surveyId(R)))?.answers || null });
  if (FB && (R.kind === "preview" || R.kind === "org") && route === "survey" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const r = cleanSurvey(body.answers);
    if (r.error) return err(r.error);
    const o = (await store.get(SKEY, { type: "json" })) || {};
    o.byInvite = dict(o.byInvite);
    o.byInvite[surveyId(R)] = { at: new Date().toISOString(), persona: R.acct ? R.acct.email : null, user: R.user ? R.user.email : null, answers: r.answers };
    await store.setJSON(SKEY, o);
    return json({ ok: true });
  }

  /* ----- Strategy page: test-site users, or the site admin on the preview site ----- */
  if (route === "strategy" || route === "strategy/decision") {
    let who = null, canEdit = false;
    if (FB) {
      const adm = adminSession(req, env);
      if (!adm) return err("Not found", 404); // prospects never learn the page exists
      who = adm.em || "Admin"; canEdit = true;
    } else {
      if (!R.acct) return err("Signed out", 401);
      who = R.acct.email; canEdit = R.acct.role === "hr";
    }
    if (route === "strategy" && req.method === "GET") {
      const dec = await loadDecisions(store);
      return json({ ...STRATEGY, viewer: who, admin: FB, decisions: Object.values(dec.items), canEdit, github: { on: !!env.LL_GITHUB_TOKEN, last: dec.github || null } });
    }
    if (route === "strategy/decision" && req.method === "POST") {
      if (!canEdit) return err("Only the HR admin account can record decisions.", 403);
      const body = await req.json().catch(() => ({}));
      const d = cleanDecision(body);
      if (d.error) return err(d.error);
      const dec = await loadDecisions(store);
      const prev = dec.items[d.key];
      const me = ACCOUNTS.find((x) => x.email === who);
      const history = prev ? [{ at: prev.at, status: prev.status, answer: prev.answer }, ...(prev.history || [])].slice(0, 20) : [];
      dec.items[d.key] = { ...d, at: new Date().toISOString(), by: me ? me.name : FB ? "Site admin" : who, history };
      const ghErr = await mirrorToGitHub(dec, env);
      dec.github = { at: new Date().toISOString(), ok: !ghErr, error: ghErr === "not set up" ? null : ghErr, on: !!env.LL_GITHUB_TOKEN };
      await store.setJSON(DKEY, dec);
      return json({ decisions: Object.values(dec.items), github: dec.github });
    }
    return err("Not found", 404);
  }

  const acct = R.acct;
  if (!acct) return err("Signed out", 401);

  if (FB && route === "feedback" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const f = cleanFeedback(body);
    if (f.error) return err(f.error);
    const ok = await addFeedback(store, { ...f, at: new Date().toISOString(), invite: R.kind === "preview" ? R.id : null, org: R.kind === "org" ? R.id : null, persona: acct.email, user: R.user ? R.user.email : null, role: acct.role }, R.kind === "org" ? "org:" + R.id : R.id);
    if (!ok) return err("Thanks, that is a lot of feedback for one day. Please send more tomorrow.", 429);
    return json({ ok: true });
  }

  /* ----- Workspace users (HR admins only) ----- */
  if (R.kind === "org" && route === "org/members" && req.method === "GET") {
    if (acct.role !== "hr") return err("HR only", 403);
    return json({ members: R.meta.members.map(({ sub, ...m }) => ({ ...m, joined: !!sub })), domain: R.meta.domain, canLock: !!R.user.hd, myDomain: R.user.hd || null });
  }
  if (R.kind === "org" && route === "org/members" && req.method === "POST") {
    if (acct.role !== "hr") return err("HR only", 403);
    const body = await req.json().catch(() => ({}));
    if (body.op === "lock") {
      if (body.on) {
        if (!R.user.hd) return err("Only Google Workspace accounts can lock a workspace to their company domain.");
        const off = R.meta.members.filter((m) => !m.email.endsWith("@" + R.user.hd));
        if (off.length) return err(`Remove users outside @${R.user.hd} first: ${off.map((m) => m.email).join(", ")}`);
        R.meta.domain = R.user.hd;
      } else R.meta.domain = null;
    } else {
      const problem = await changeMembers(store, R.meta, R.D, acct, body);
      if (problem) return err(problem);
      await store.setJSON(R.key, R.D);
    }
    await saveOrg(store, R.meta);
    return json({ ok: true, members: R.meta.members.map(({ sub, ...m }) => ({ ...m, joined: !!sub })), domain: R.meta.domain, ...viewFor(R.D, acct, today, env, spaceInfo(R)) });
  }


  const getD = async () => R.D || (await load(store, today, R.key));

  if (route === "state" && req.method === "GET") {
    const D = await getD();
    if (FB && touch(D, acct.email, "view")) await store.setJSON(R.key, D);
    return json(viewFor(D, acct, today, env, spaceInfo(R)));
  }

  if (route === "intake" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const D = await getD();
    const u = D.aiUsage && D.aiUsage.day === today ? D.aiUsage : { day: today, count: 0, by: {}, input: 0, output: 0, month: (D.aiUsage && D.aiUsage.month) || {} };
    const perUser = +(env.LL_AI_PER_USER_DAY || (FB ? 15 : 40)), perDay = +(FB ? env.LL_AI_PER_SPACE_DAY || env.LL_AI_PER_INVITE_DAY || 30 : env.LL_AI_DAY || 400);
    const limitMsg = FB ? "Clerk has reached today's limit here. Fill in the form yourself, or try again tomorrow." : "Clerk has reached today's test limit. Fill in the form yourself, or try again tomorrow.";
    if ((u.by[acct.email] || 0) >= perUser || u.count >= perDay) return err(limitMsg, 429);
    const g = FB ? await aiGlobalOk(store, today, +(env.LL_AI_DAY || 400)) : null;
    if (g && !g.ok) return err(limitMsg, 429);
    const res = await runIntake(body.text, today, env);
    if (res.error) return err(res.error, res.status || 502);
    if (g) await g.bump();
    const mk = today.slice(0, 7);
    u.count++; u.by[acct.email] = (u.by[acct.email] || 0) + 1; u.input += res.usage.input; u.output += res.usage.output;
    const m = u.month[mk] || { requests: 0, input: 0, output: 0, ms: 0 };
    m.requests++; m.input += res.usage.input; m.output += res.usage.output; m.ms += res.usage.ms; u.month = { [mk]: m };
    D.aiUsage = u;
    if (FB) touch(D, acct.email, "intake");
    await store.setJSON(R.key, D);
    return json({ draft: res.draft, model: res.usage.model, ms: res.usage.ms });
  }

  if (route === "action" && req.method === "POST") {
    const a = await req.json().catch(() => null);
    if (!a || typeof a.type !== "string") return err("Bad request");
    const D = await getD();
    // In a workspace, an employee with sign-in access cannot be removed until their access is removed.
    if (R.kind === "org" && a.type === "removeEmployee" && R.meta.members.some((m) => m.empId === a.id)) return err("This employee has sign-in access. Remove it under Users first.");
    const problem = apply(D, acct, a, today, R.kind);
    if (problem) return err(problem, problem === "HR only" || problem.startsWith("Not your") || problem.startsWith("Not available") ? 403 : 400);
    if (FB) touch(D, acct.email, "action", a.type);
    if (R.kind === "org" && a.type === "updateCompany" && a.field === "name") { R.meta.name = D.company.name; await saveOrg(store, R.meta); }
    await store.setJSON(R.key, D);
    return json({ ...viewFor(D, acct, today, env, spaceInfo(R)), createdId: a._id || null });
  }
  return err("Not found", 404);
}

// Activity per copy, kept inside that copy's own data. Returns true when it is worth saving.
function touch(D, email, kind, type) {
  const A = D.activity || (D.activity = { first: new Date().toISOString(), last: null, views: 0, actions: 0, intakes: 0, personas: {}, types: {} });
  const now = Date.now(), stale = !A.last || now - Date.parse(A.last) > 10 * 60 * 1000;
  A.last = new Date(now).toISOString();
  if (kind === "persona") A.personas[email] = (A.personas[email] || 0) + 1;
  if (kind === "view") { A.views++; if (!A.personas[email]) { A.personas[email] = 1; return true; } return stale; }
  if (kind === "action") { A.actions++; A.types[type] = (A.types[type] || 0) + 1; }
  if (kind === "intake") A.intakes++;
  return true;
}
async function surveyOf(store, id) {
  const o = await store.get(SKEY, { type: "json" });
  return dict(o && o.byInvite)[id] || null;
}

/* ---------- Admin inbox (preview site only) ---------- */
// A valid admin cookie: Google sign-in by an email in LL_ADMIN_EMAILS, or the admin password.
function adminSession(req, env) {
  const o = readObj(cookieOf(req, "ll_admin"), env);
  return o && o.k === "admin" && (o.em ? isAdminEmail(env, o.em) : !!env.LL_ADMIN_PASSWORD) ? o : null;
}
const ADMIN_TTL = 7 * 24 * 3600; // admin stays signed in for a week
async function handleAdmin(req, route, store, env, today) {
  if (route === "admin/config" && req.method === "GET") return json({ password: !!env.LL_ADMIN_PASSWORD, google: googleOn(env) && !!env.LL_ADMIN_EMAILS });
  if (route === "admin/login" && req.method === "POST") {
    if (!env.LL_ADMIN_PASSWORD) return err("Password sign-in is off. Use Google, or set LL_ADMIN_PASSWORD in Netlify.", 503);
    const body = await req.json().catch(() => ({}));
    if (await throttled(store, req, "admin", 8)) return err("Too many tries. Wait 15 minutes.", 429);
    if (!safeEqual(String(body.password || ""), env.LL_ADMIN_PASSWORD)) { await failed(store, req, "admin"); return err("Wrong password.", 401); }
    return json({ ok: true }, 200, { "set-cookie": setCookie(signObj({ k: "admin" }, ADMIN_TTL, env), ADMIN_TTL, "ll_admin") });
  }
  if (route === "admin/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": setCookie("", 0, "ll_admin") });
  if (!adminSession(req, env)) return err("Signed out", 401);

  const invites = await loadInvites(store);
  if (route === "admin/state" && req.method === "GET") {
    const fb = (await store.get(FKEY, { type: "json" })) || { items: [] };
    const sv0 = await store.get(SKEY, { type: "json" }), sv = { byInvite: dict(sv0 && sv0.byInvite) };
    const ix = await loadOrgIndex(store);
    const list = [];
    for (const [code, inv] of Object.entries(invites.items)) {
      const D = inv.joined ? await store.get(tenantKey(code), { type: "json" }) : null;
      list.push({ code, ...inv, users: (inv.users || []).map(({ email, name, at }) => ({ email, name, at })), activity: D && D.activity ? D.activity : null, cases: D ? D.cases.length : 0, survey: !!sv.byInvite[code] });
    }
    list.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    const orgs = [];
    for (const id of Object.keys(ix.items)) {
      const meta = await loadOrg(store, id); if (!meta) continue;
      const D = await store.get(orgDataKey(id), { type: "json" });
      orgs.push({ id, name: meta.name, ownerEmail: meta.ownerEmail, created: meta.created, disabled: !!meta.disabled, domain: meta.domain,
        users: meta.members.length, joined: meta.members.filter((m) => m.sub).length, employees: D ? D.employees.length : 0, cases: D ? D.cases.length : 0,
        activity: D && D.activity ? D.activity : null, survey: !!sv.byInvite["org:" + id] });
    }
    orgs.sort((a, b) => b.created.localeCompare(a.created));
    const name = (f) => f.org ? ((ix.items[f.org] || {}).name || "Workspace") + " (workspace)" : (invites.items[f.invite] && invites.items[f.invite].name) || f.invite;
    const sname = (k) => k.startsWith("org:") ? ((ix.items[k.slice(4)] || {}).name || "Workspace") + " (workspace)" : (invites.items[k] && invites.items[k].name) || k;
    return json({
      invites: list, orgs,
      feedback: fb.items.map((f) => ({ ...f, who: name(f) })),
      surveys: Object.entries(sv.byInvite).map(([k, s]) => ({ invite: k, who: sname(k), ...s })).sort((a, b) => b.at.localeCompare(a.at)),
      summary: summarize(sv.byInvite),
      questions: SURVEY,
      google: googleOn(env),
    });
  }
  if (route === "admin/invite" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const nm = String(body.name || "").slice(0, 80).trim();
    if (!nm) return err("Give the invite a name, for example the user and company.");
    const email = String(body.email || "").toLowerCase().trim();
    if (email && !EMAIL_RE.test(email)) return err("That email does not look right.");
    let code = newCode(); while (invites.items[code]) code = newCode();
    invites.items[code] = { name: nm, note: String(body.note || "").slice(0, 300).trim(), email: email || null, created: new Date().toISOString(), disabled: false, joined: null, users: [] };
    await store.setJSON(IKEY, invites);
    return json({ ok: true, code });
  }
  if (route === "admin/invite/update" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const inv = invites.items[body.code];
    if (!inv) return err("Invite not found", 404);
    if ("disabled" in body) inv.disabled = !!body.disabled;
    if ("name" in body) inv.name = String(body.name || "").slice(0, 80).trim() || inv.name;
    if ("note" in body) inv.note = String(body.note || "").slice(0, 300).trim();
    await store.setJSON(IKEY, invites);
    if (body.resetData) {
      const fresh = E.sampleData(today);
      fresh.log = [{ at: new Date().toISOString(), by: "System", text: "Sample data loaded" }];
      await store.setJSON(tenantKey(body.code), fresh);
    }
    return json({ ok: true });
  }
  if (route === "admin/org/update" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const meta = await loadOrg(store, body.id);
    if (!meta) return err("Workspace not found", 404);
    if ("disabled" in body) meta.disabled = !!body.disabled;
    await saveOrg(store, meta);
    return json({ ok: true });
  }
  return err("Not found", 404);
}
