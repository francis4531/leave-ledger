// Leave Ledger API logic. Storage is injected so this runs under Netlify Blobs or a local Map.
import crypto from "node:crypto";
import * as E from "../../public/engine.mjs";
import STRATEGY from "./strategy-data.mjs";
import { runIntake, validate as validateDraft, changedFields, DEFAULT_MODEL } from "./intake.mjs";
import { DKEY, loadDecisions, cleanDecision, mirrorToGitHub } from "./decisions.mjs";
import { IKEY, FKEY, SKEY, SURVEY, loadInvites, validCode, newCode, addFeedback, cleanFeedback, cleanSurvey, summarize, aiGlobalOk } from "./feedback.mjs";

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

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

function secret(env) {
  const s = env.LL_SECRET || (env.LL_TEST_PASSWORD ? "ll:" + env.LL_TEST_PASSWORD : env.LL_ADMIN_PASSWORD ? "adm:" + env.LL_ADMIN_PASSWORD : "");
  return crypto.createHash("sha256").update(s).digest();
}
const b64 = (s) => Buffer.from(s).toString("base64url");
export function signObj(o, ttl, env) {
  const p = b64(JSON.stringify({ ...o, x: Math.floor(Date.now() / 1000) + ttl }));
  return p + "." + crypto.createHmac("sha256", secret(env)).update(p).digest("base64url");
}
export function readObj(token, env) {
  if (!token || !token.includes(".")) return null;
  const [p, sig] = token.split(".");
  const good = crypto.createHmac("sha256", secret(env)).update(p).digest("base64url");
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const o = JSON.parse(Buffer.from(p, "base64url").toString());
    return o.x < Date.now() / 1000 ? null : o;
  } catch { return null; }
}
// Session cookie: {k:"s", e: account email or none, t: invite code in feedback mode}.
function session(req, env) {
  const o = readObj(cookieOf(req), env);
  if (!o || (o.k && o.k !== "s")) return null;
  return { acct: o.e ? ACCOUNTS.find((a) => a.email === o.e) || null : null, t: o.t || null };
}
const sign = (email, env, t) => signObj({ k: "s", e: email || undefined, t: t || undefined }, t ? FB_TTL : WEEK, env);
export const cookieOf = (req, name = "ll_session") => (req.headers.get("cookie") || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];
export const setCookie = (val, maxAge, name = "ll_session") => `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function load(store, today, key = KEY) {
  let D = await store.get(key, { type: "json" });
  if (!D || !D.cases) {
    D = E.sampleData(today);
    D.log = [{ at: new Date().toISOString(), by: "System", text: "Sample data loaded" }];
    await store.setJSON(key, D);
  }
  return D;
}

// What each signed-in account may see. Managers get dates only; employees get their own record.
export function viewFor(D, acct, today, env = {}) {
  const me = D.employees.find((e) => e.id === acct.empId);
  const out = { me: { email: acct.email, name: me.name, role: acct.role, label: acct.label, empId: me.id, views: VIEWS[acct.role] }, today, mode: isFeedback(env) ? "feedback" : "test", ai: { on: !!env.ANTHROPIC_API_KEY, model: env.LL_MODEL || DEFAULT_MODEL } };
  if (acct.role === "hr") return { ...out, data: D };
  const own = D.cases.filter((c) => c.empId === me.id && c.reason !== "unknown").map(({ hrNote, notes, ...c }) => c);
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

const err = (m, s = 400) => json({ error: m }, s);
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
function apply(D, acct, a, today, fb = false) {
  if (fb && (a.type === "reset" || a.type === "updateCompany")) return "Not available in this preview";
  const hr = acct.role === "hr", me = acct.empId;
  const emp = (id) => D.employees.find((e) => e.id === id);
  const kase = (id) => D.cases.find((c) => c.id === id);
  const who = emp(me).name;
  const log = (text) => { D.log = [{ at: new Date().toISOString(), by: who, text }, ...(D.log || [])].slice(0, 200); };
  switch (a.type) {
    case "createCase": {
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
      const e = emp(a.id); if (!e || !["hours12", "sick", "sickUsedYr", "cfraUsed", "hiQuarter"].includes(a.field)) return "Field not editable";
      e[a.field] = Math.max(0, Math.min(1e6, +a.value || 0)); log(`Updated ${e.name}: ${a.field}`); return null;
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

export async function handle(req, store, env) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const today = todayPT();
  const FB = isFeedback(env);

  if (route.startsWith("admin")) return FB ? handleAdmin(req, route, store, env, today) : err("Not found", 404);

  // In feedback mode the session must carry an active invite; each invite has its own copy of the data.
  let sess = session(req, env), invite = null, invites = null;
  if (FB && sess) {
    invites = await loadInvites(store);
    invite = sess.t && invites.items[sess.t];
    if (!invite || invite.disabled) sess = null;
  }
  const key = FB && sess ? tenantKey(sess.t) : KEY;

  if (route === "accounts" && req.method === "GET") {
    const list = ACCOUNTS.map(({ email, label, empId, name, role }) => ({ email, label, empId, name, role }));
    if (!FB) return json({ mode: "test", accounts: list, configured: !!env.LL_TEST_PASSWORD });
    return json({ mode: "feedback", invited: !!sess, accounts: sess ? list : [], configured: !!(env.LL_SECRET || env.LL_ADMIN_PASSWORD), surveyDone: !!(sess && (await surveyOf(store, sess.t))) });
  }

  if (FB && route === "join" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").toLowerCase().trim();
    const all = invites || (await loadInvites(store));
    const inv = validCode(code) && all.items[code];
    if (!inv || inv.disabled) return err("This invite link is not active. Ask the person who sent it for a new one.", 403);
    if (!inv.joined) { inv.joined = new Date().toISOString(); await store.setJSON(IKEY, all); }
    await load(store, today, tenantKey(code));
    return json({ ok: true }, 200, { "set-cookie": setCookie(sign(null, env, code), FB_TTL) });
  }

  if (route === "login" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const acct = ACCOUNTS.find((a) => a.email === String(body.email || "").toLowerCase().trim());
    if (FB) {
      // No password here: the invite cookie is the key. Picking a person just switches the view.
      if (!sess) return err("Open the invite link you were sent to start.", 401);
      if (!acct) return err("Pick one of the people listed.");
      const D = await load(store, today, key);
      touch(D, acct.email, "persona"); await store.setJSON(key, D);
      return json(viewFor(D, acct, today, env), 200, { "set-cookie": setCookie(sign(acct.email, env, sess.t), FB_TTL) });
    }
    if (!env.LL_TEST_PASSWORD) return err("This site has no test password yet. Set LL_TEST_PASSWORD in Netlify, then redeploy.", 503);
    const pw = String(body.password || "");
    const ok = acct && pw.length === env.LL_TEST_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(env.LL_TEST_PASSWORD));
    if (!ok) return err("That email and password do not match a test account.", 401);
    const D = await load(store, today);
    return json(viewFor(D, acct, today, env), 200, { "set-cookie": setCookie(sign(acct.email, env), WEEK) });
  }
  if (route === "logout" && req.method === "POST") {
    // In feedback mode, keep the invite so "Switch user" goes back to the people picker.
    const keep = FB && sess ? setCookie(sign(null, env, sess.t), FB_TTL) : setCookie("", 0);
    return json({ ok: true }, 200, { "set-cookie": keep });
  }

  if (FB && sess && route === "survey" && req.method === "GET") return json({ questions: SURVEY, answers: (await surveyOf(store, sess.t))?.answers || null });
  if (FB && sess && route === "survey" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const r = cleanSurvey(body.answers);
    if (r.error) return err(r.error);
    const o = (await store.get(SKEY, { type: "json" })) || { byInvite: {} };
    o.byInvite[sess.t] = { at: new Date().toISOString(), persona: sess.acct ? sess.acct.email : null, answers: r.answers };
    await store.setJSON(SKEY, o);
    return json({ ok: true });
  }

  const acct = sess && sess.acct;
  if (!acct) return err("Signed out", 401);

  if (FB && route === "feedback" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const f = cleanFeedback(body);
    if (f.error) return err(f.error);
    await addFeedback(store, { ...f, at: new Date().toISOString(), invite: sess.t, persona: acct.email, role: acct.role });
    return json({ ok: true });
  }

  if (!FB && route === "strategy" && req.method === "GET") {
    const dec = await loadDecisions(store);
    return json({ ...STRATEGY, viewer: acct.email, decisions: Object.values(dec.items), canEdit: acct.role === "hr", github: { on: !!env.LL_GITHUB_TOKEN, last: dec.github || null } });
  }

  if (!FB && route === "strategy/decision" && req.method === "POST") {
    if (acct.role !== "hr") return err("Only the HR admin account can record decisions.", 403);
    const body = await req.json().catch(() => ({}));
    const d = cleanDecision(body);
    if (d.error) return err(d.error);
    const dec = await loadDecisions(store);
    const prev = dec.items[d.key];
    const me = ACCOUNTS.find((x) => x.email === acct.email);
    const history = prev ? [{ at: prev.at, status: prev.status, answer: prev.answer }, ...(prev.history || [])].slice(0, 20) : [];
    dec.items[d.key] = { ...d, at: new Date().toISOString(), by: me ? me.name : acct.email, history };
    const ghErr = await mirrorToGitHub(dec, env);
    dec.github = { at: new Date().toISOString(), ok: !ghErr, error: ghErr === "not set up" ? null : ghErr, on: !!env.LL_GITHUB_TOKEN };
    await store.setJSON(DKEY, dec);
    return json({ decisions: Object.values(dec.items), github: dec.github });
  }

  if (route === "state" && req.method === "GET") {
    const D = await load(store, today, key);
    if (FB && touch(D, acct.email, "view")) await store.setJSON(key, D);
    return json(viewFor(D, acct, today, env));
  }

  if (route === "intake" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const D = await load(store, today, key);
    const u = D.aiUsage && D.aiUsage.day === today ? D.aiUsage : { day: today, count: 0, by: {}, input: 0, output: 0, month: (D.aiUsage && D.aiUsage.month) || {} };
    const perUser = +(env.LL_AI_PER_USER_DAY || (FB ? 15 : 40)), perDay = +(FB ? env.LL_AI_PER_INVITE_DAY || 30 : env.LL_AI_DAY || 400);
    const limitMsg = FB ? "Clerk has reached today's limit for this preview. Fill in the form yourself, or try again tomorrow." : "Clerk has reached today's test limit. Fill in the form yourself, or try again tomorrow.";
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
    await store.setJSON(key, D);
    return json({ draft: res.draft, model: res.usage.model, ms: res.usage.ms });
  }

  if (route === "action" && req.method === "POST") {
    const a = await req.json().catch(() => null);
    if (!a || typeof a.type !== "string") return err("Bad request");
    const D = await load(store, today, key);
    const problem = apply(D, acct, a, today, FB);
    if (problem) return err(problem, problem === "HR only" || problem.startsWith("Not your") || problem.startsWith("Not available") ? 403 : 400);
    if (FB) touch(D, acct.email, "action", a.type);
    await store.setJSON(key, D);
    return json({ ...viewFor(D, acct, today, env), createdId: a._id || null });
  }
  return err("Not found", 404);
}

// Activity per invite, kept inside that invite's own data. Returns true when it is worth saving.
function touch(D, email, kind, type) {
  const A = D.activity || (D.activity = { first: new Date().toISOString(), last: null, views: 0, actions: 0, intakes: 0, personas: {}, types: {} });
  const now = Date.now(), stale = !A.last || now - Date.parse(A.last) > 10 * 60 * 1000;
  A.last = new Date(now).toISOString();
  if (kind === "persona") A.personas[email] = (A.personas[email] || 0) + 1;
  if (kind === "view") { A.views++; return stale; }
  if (kind === "action") { A.actions++; A.types[type] = (A.types[type] || 0) + 1; }
  if (kind === "intake") A.intakes++;
  return true;
}
async function surveyOf(store, t) {
  const o = await store.get(SKEY, { type: "json" });
  return (o && o.byInvite && o.byInvite[t]) || null;
}

/* ---------- Admin inbox (feedback mode only) ---------- */
const ADMIN_TTL = 12 * 3600;
async function handleAdmin(req, route, store, env, today) {
  if (route === "admin/login" && req.method === "POST") {
    if (!env.LL_ADMIN_PASSWORD) return err("Set LL_ADMIN_PASSWORD in Netlify, then redeploy.", 503);
    const body = await req.json().catch(() => ({}));
    const pw = String(body.password || "");
    const ok = pw.length === env.LL_ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(env.LL_ADMIN_PASSWORD));
    if (!ok) return err("Wrong password.", 401);
    return json({ ok: true }, 200, { "set-cookie": setCookie(signObj({ k: "admin" }, ADMIN_TTL, env), ADMIN_TTL, "ll_admin") });
  }
  if (route === "admin/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": setCookie("", 0, "ll_admin") });
  const o = readObj(cookieOf(req, "ll_admin"), env);
  if (!env.LL_ADMIN_PASSWORD || !o || o.k !== "admin") return err("Signed out", 401);

  const invites = await loadInvites(store);
  if (route === "admin/state" && req.method === "GET") {
    const fb = (await store.get(FKEY, { type: "json" })) || { items: [] };
    const sv = (await store.get(SKEY, { type: "json" })) || { byInvite: {} };
    const list = [];
    for (const [code, inv] of Object.entries(invites.items)) {
      const D = inv.joined ? await store.get(tenantKey(code), { type: "json" }) : null;
      list.push({ code, ...inv, activity: D && D.activity ? D.activity : null, cases: D ? D.cases.length : 0, survey: !!sv.byInvite[code] });
    }
    list.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    const name = (c) => (invites.items[c] && invites.items[c].name) || c;
    return json({
      invites: list,
      feedback: fb.items.map((f) => ({ ...f, who: name(f.invite) })),
      surveys: Object.entries(sv.byInvite).map(([code, s]) => ({ invite: code, who: name(code), ...s })).sort((a, b) => b.at.localeCompare(a.at)),
      summary: summarize(sv.byInvite),
      questions: SURVEY,
    });
  }
  if (route === "admin/invite" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const nm = String(body.name || "").slice(0, 80).trim();
    if (!nm) return err("Give the invite a name, for example the person and company.");
    let code = newCode(); while (invites.items[code]) code = newCode();
    invites.items[code] = { name: nm, note: String(body.note || "").slice(0, 300).trim(), created: new Date().toISOString(), disabled: false, joined: null };
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
  return err("Not found", 404);
}
