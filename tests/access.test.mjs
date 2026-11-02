// Access, privacy and security tests for the API. Each test builds a fresh in-memory store.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, client, installFakes, TEST_ENV, PREVIEW_ENV, ACCTS } from "./helpers.mjs";

before(installFakes);

const testSite = () => { const store = memoryStore(); return { store, as: () => client(store, TEST_ENV) }; };
async function signedIn(site, email) {
  const c = site.as();
  const r = await c.post("/api/login", { email, password: "test-pass-123" });
  assert.equal(r.status, 200, `sign in ${email}`);
  return c;
}

describe("test site: sign-in", () => {
  test("wrong password is refused, right password signs in", async () => {
    const s = testSite(), c = s.as();
    assert.equal((await c.post("/api/login", { email: "grace@mesaverde.example", password: "nope" })).status, 401);
    const ok = await c.post("/api/login", { email: "grace@mesaverde.example", password: "test-pass-123" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.me.role, "hr");
  });
  test("a tampered session cookie is rejected", async () => {
    const s = testSite(), c = await signedIn(s, "ben@mesaverde.example");
    const [p, sig] = c.jar.get("ll_session").split(".");
    const forged = Buffer.from(JSON.stringify({ k: "s", e: "grace@mesaverde.example", x: 9999999999 })).toString("base64url");
    c.jar.set("ll_session", forged + "." + sig);
    assert.equal((await c.get("/api/state")).status, 401);
    c.jar.set("ll_session", p + ".AAAA");
    assert.equal((await c.get("/api/state")).status, 401);
  });
  test("a POST from another site is blocked", async () => {
    const s = testSite(), c = await signedIn(s, "grace@mesaverde.example");
    const r = await c.post("/api/action", { type: "reset" }, { origin: "https://evil.example" });
    assert.equal(r.status, 403);
  });
  test("inbox and Google routes do not exist on the test site", async () => {
    const s = testSite(), c = s.as();
    assert.equal((await c.get("/api/admin/state")).status, 404);
    assert.equal((await c.get("/api/me")).status, 404);
  });
});

describe("test site: what each role can see", () => {
  test("HR sees every employee and every case with notes", async () => {
    const s = testSite(), c = await signedIn(s, "grace@mesaverde.example");
    const { body } = await c.get("/api/state");
    assert.equal(body.data.employees.length, 10);
    assert.ok(body.data.cases.length >= 5);
  });
  test("a manager sees team dates and coverage, never the reason or notes", async () => {
    const s = testSite(), c = await signedIn(s, "dana@mesaverde.example");
    const { body } = await c.get("/api/state");
    const d = body.data;
    assert.equal(d.employees.length, 1, "only themselves");
    assert.ok(d.teamCases.length > 0);
    for (const tc of d.teamCases) {
      for (const k of ["reason", "notes", "hrNote", "intake", "tasks", "opts"]) assert.ok(!(k in tc), `team case must not include ${k}`);
    }
    const teamIds = new Set(d.team.map((t) => t.id));
    assert.ok(d.teamCases.every((tc) => teamIds.has(tc.empId)), "only their own team");
    assert.ok(!JSON.stringify(d).includes("Pregnancy"), "no leave reason text anywhere");
  });
  test("an employee sees only their own record and cases, without HR notes", async () => {
    const s = testSite();
    const hr = await signedIn(s, "grace@mesaverde.example");
    const st = (await hr.get("/api/state")).body;
    const priyaCase = st.data.cases.find((c) => c.empId === "e1");
    await hr.post("/api/action", { type: "setHrNote", caseId: priyaCase.id, text: "HR ONLY NOTE" });
    const c = await signedIn(s, "priya@mesaverde.example");
    const { body } = await c.get("/api/state");
    assert.deepEqual(body.data.employees.map((e) => e.id), ["e1"]);
    assert.ok(body.data.cases.every((x) => x.empId === "e1"));
    assert.ok(!JSON.stringify(body).includes("HR ONLY NOTE"));
  });
  test("a manager's flag note never reaches the employee, even after HR sets the type", async () => {
    const s = testSite();
    const mgr = await signedIn(s, "dana@mesaverde.example");
    assert.equal((await mgr.post("/api/action", { type: "flag", empId: "e8", note: "PRIVATE manager note" })).status, 200);
    const hr = await signedIn(s, "grace@mesaverde.example");
    const flagged = (await hr.get("/api/state")).body.data.cases.find((c) => c.empId === "e8" && c.reason === "unknown");
    await hr.post("/api/action", { type: "convert", caseId: flagged.id, reason: "own_health", opts: { start: "2027-01-11", weeks: 3 }, intake: { ai: { reason: "own_health" }, text: "" } });
    const ben = await signedIn(s, "ben@mesaverde.example");
    assert.ok(!JSON.stringify((await ben.get("/api/state")).body).includes("PRIVATE manager note"));
  });
  test("employees and managers cannot do HR actions", async () => {
    const s = testSite();
    const hr = await signedIn(s, "grace@mesaverde.example");
    const caseId = (await hr.get("/api/state")).body.data.cases[0].id;
    for (const who of ["ben@mesaverde.example", "dana@mesaverde.example"]) {
      const c = await signedIn(s, who);
      for (const a of [{ type: "toggleTask", caseId, key: "notice", done: true }, { type: "deleteCase", caseId }, { type: "updateEmployee", id: "e1", field: "sick", value: 999 }, { type: "setHrNote", caseId, text: "x" }, { type: "reset" }, { type: "updateCompany", field: "headcount", value: 3 }, { type: "addEmployee", employee: { name: "X", hire: "2024-01-01" } }]) {
        const r = await c.post("/api/action", a);
        assert.equal(r.status, 403, `${who} must not ${a.type}`);
      }
    }
  });
  test("an employee can only request leave for themselves; a manager can only flag their own team", async () => {
    const s = testSite();
    const ben = await signedIn(s, "ben@mesaverde.example");
    assert.equal((await ben.post("/api/action", { type: "createCase", empId: "e1", reason: "sick", opts: { start: "2027-01-11", hours: 8 } })).status, 400);
    assert.equal((await ben.post("/api/action", { type: "createCase", empId: "e8", reason: "sick", opts: { start: "2027-01-11", hours: 8 } })).status, 200);
    const mei = await signedIn(s, "mei@mesaverde.example");
    assert.equal((await mei.post("/api/action", { type: "flag", empId: "e1", note: "x" })).status, 400, "Priya is on Dana's team");
  });
  test("strategy is for signed-in test users; only HR records decisions", async () => {
    const s = testSite();
    assert.equal((await s.as().get("/api/strategy")).status, 401);
    const ben = await signedIn(s, "ben@mesaverde.example");
    assert.equal((await ben.get("/api/strategy")).status, 200);
    assert.equal((await ben.post("/api/strategy/decision", { week: 1, n: 1, answer: "x", status: "decided", title: "t", question: "q" })).status, 403);
  });
});

/* ---------------- Preview site ---------------- */
const preview = (env = PREVIEW_ENV) => { const store = memoryStore(); return { store, env, as: (o) => client(store, env, o) }; };
async function adminClient(p) {
  const a = p.as();
  assert.equal((await a.post("/api/admin/login", { password: "admin-pass-1" })).status, 200);
  return a;
}
async function makeInvite(p, body = { name: "Prospect" }) {
  const a = await adminClient(p);
  const r = await a.post("/api/admin/invite", body);
  assert.equal(r.status, 200);
  return r.body.code;
}

describe("preview site: setup and invite links", () => {
  test("refuses to run without a long LL_SECRET", async () => {
    const p = preview({ ...PREVIEW_ENV, LL_SECRET: "short" });
    assert.equal((await p.as().get("/api/me")).status, 503);
  });
  test("bad, built-in and disabled invite codes do not get in", async () => {
    const p = preview(), c = p.as();
    for (const code of ["nope1234", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      assert.equal((await c.post("/api/join", { code })).status, 403, code);
    }
    const code = await makeInvite(p);
    const a = await adminClient(p);
    await a.post("/api/admin/invite/update", { code, disabled: true });
    assert.equal((await c.post("/api/join", { code })).status, 403);
  });
  test("each invite has its own copy of the data", async () => {
    const p = preview();
    const [c1, c2] = [await makeInvite(p, { name: "One" }), await makeInvite(p, { name: "Two" })];
    const u1 = p.as({ ip: "1.1.1.1" }), u2 = p.as({ ip: "2.2.2.2" });
    await u1.post("/api/join", { code: c1 }); await u2.post("/api/join", { code: c2 });
    const s1 = await u1.post("/api/login", { email: "grace@mesaverde.example" });
    await u2.post("/api/login", { email: "grace@mesaverde.example" });
    await u1.post("/api/action", { type: "deleteCase", caseId: s1.body.data.cases[0].id });
    const n1 = (await u1.get("/api/state")).body.data.cases.length, n2 = (await u2.get("/api/state")).body.data.cases.length;
    assert.equal(n2 - n1, 1);
  });
  test("prospects cannot reset data, change company settings, or see the strategy page", async () => {
    const p = preview(), code = await makeInvite(p), c = p.as();
    await c.post("/api/join", { code }); await c.post("/api/login", { email: "grace@mesaverde.example" });
    assert.equal((await c.post("/api/action", { type: "reset" })).status, 403);
    assert.equal((await c.post("/api/action", { type: "updateCompany", field: "headcount", value: 3 })).status, 403);
    assert.equal((await c.get("/api/strategy")).status, 404);
    assert.equal((await c.post("/api/strategy/decision", { week: 1, n: 1, answer: "x" })).status, 404);
    assert.equal((await c.get("/api/admin/state")).status, 401);
  });
  test("turning off an invite signs its users out", async () => {
    const p = preview(), code = await makeInvite(p), c = p.as();
    await c.post("/api/join", { code }); await c.post("/api/login", { email: "grace@mesaverde.example" });
    const a = await adminClient(p);
    await a.post("/api/admin/invite/update", { code, disabled: true });
    assert.equal((await c.get("/api/state")).status, 401);
  });
  test("feedback is limited per copy per day", async () => {
    const p = preview(), code = await makeInvite(p), c = p.as();
    await c.post("/api/join", { code }); await c.post("/api/login", { email: "ben@mesaverde.example" });
    let last;
    for (let i = 0; i < 61; i++) last = await c.post("/api/feedback", { screen: "x", rating: 3 });
    assert.equal(last.status, 429);
  });
});

describe("preview site: admin inbox", () => {
  test("password guessing is throttled", async () => {
    const p = preview(), c = p.as({ ip: "9.9.9.9" });
    for (let i = 0; i < 8; i++) await c.post("/api/admin/login", { password: "wrong" });
    assert.equal((await c.post("/api/admin/login", { password: "admin-pass-1" })).status, 429);
  });
  test("Google admin sign-in works only for LL_ADMIN_EMAILS", async () => {
    const p = preview();
    const ok = p.as(); const r = await ok.google(ACCTS.owner, { intent: "admin" });
    assert.equal(r.location, "/inbox");
    assert.equal((await ok.get("/api/admin/state")).status, 200);
    const no = p.as(); const r2 = await no.google(ACCTS.eve, { intent: "admin" });
    assert.match(r2.location, /auth_error=notadmin/);
    assert.equal((await no.get("/api/admin/state")).status, 401);
  });
  test("the admin can open the strategy page from the inbox or from the app", async () => {
    const p = preview();
    const a = await adminClient(p);
    assert.equal((await a.get("/api/strategy")).status, 200);
    const g = p.as(); await g.google(ACCTS.owner);
    assert.equal((await g.get("/api/strategy")).status, 200);
    const e = p.as(); await e.google(ACCTS.eve);
    assert.equal((await e.get("/api/strategy")).status, 404);
  });
});

describe("preview site: Google sign-in checks", () => {
  test("a wrong state, wrong nonce, wrong audience or unverified email is refused", async () => {
    const p = preview();
    const c = p.as();
    const start = await c.raw("/api/auth/google/start");
    const loc = new URL(start.headers.get("location"));
    assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
    const code = (o) => Buffer.from(JSON.stringify({ ...ACCTS.pat, nonce: loc.searchParams.get("nonce"), ...o })).toString("base64url");
    const bad = await c.raw(`/api/auth/google/callback?state=wrong&code=${code({})}`);
    assert.match(bad.headers.get("location"), /auth_error=/);
    for (const o of [{ badNonce: true }, { aud: "someone-else" }, { verified: false }, { expired: true }, { iss: "https://evil.example" }]) {
      const cc = p.as();
      const st = new URL((await cc.raw("/api/auth/google/start")).headers.get("location"));
      const cd = Buffer.from(JSON.stringify({ ...ACCTS.pat, nonce: st.searchParams.get("nonce"), ...o })).toString("base64url");
      const r = await cc.raw(`/api/auth/google/callback?state=${st.searchParams.get("state")}&code=${cd}`);
      assert.match(r.headers.get("location"), /auth_error=/, JSON.stringify(o));
      assert.ok(!cc.jar.has("ll_user"), `no sign-in for ${JSON.stringify(o)}`);
    }
  });
  test("the return address after sign-in stays on this site", async () => {
    const p = preview();
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const r = await p.as().google(ACCTS.pat, { next });
      assert.equal(r.location, "/", next);
    }
  });
  test("a valid sign-in sets the user cookie", async () => {
    const p = preview(), c = p.as();
    await c.google(ACCTS.pat);
    const me = (await c.get("/api/me")).body;
    assert.equal(me.user.email, "pat@gmail.com");
  });
});

describe("preview site: company workspaces", () => {
  async function samWithWorkspace(p, extra = {}) {
    await makeInvite(p, { name: "Sam", email: "sam@bayside.com" });
    const sam = p.as({ ip: "3.3.3.3" }); await sam.google(ACCTS.sam);
    const r = await sam.post("/api/org/create", { name: "Bayside Dental", headcount: 18, start: "sample", agree: true, ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { sam, orgId: r.body.id };
  }
  test("creating a workspace needs an invite and the made-up data promise", async () => {
    const p = preview();
    const pat = p.as(); await pat.google(ACCTS.pat);
    assert.equal((await pat.post("/api/org/create", { name: "X", headcount: 5, agree: true })).status, 403);
    await makeInvite(p, { name: "Sam", email: "sam@bayside.com" });
    const sam = p.as(); await sam.google(ACCTS.sam);
    assert.equal((await sam.post("/api/org/create", { name: "X", headcount: 5 })).status, 400);
  });
  test("an invited user is not added until they accept", async () => {
    const p = preview(), { sam, orgId } = await samWithWorkspace(p);
    assert.equal((await sam.post("/api/org/members", { op: "invite", email: "ana@bayside.com", role: "emp", empId: "e8" })).status, 200);
    const ana = p.as({ ip: "4.4.4.4" }); await ana.google(ACCTS.ana);
    let me = (await ana.get("/api/me")).body;
    assert.equal(me.current, null);
    assert.equal(me.pending.length, 1);
    assert.equal((await ana.post("/api/space", { kind: "org", id: orgId })).status, 403);
    assert.equal((await ana.post("/api/org/accept", { id: orgId })).status, 200);
    const st = (await ana.get("/api/state")).body;
    assert.equal(st.me.role, "emp");
    assert.deepEqual(st.data.employees.map((e) => e.id), ["e8"]);
  });
  test("someone not invited cannot open a workspace, even knowing its id", async () => {
    const p = preview(), { orgId } = await samWithWorkspace(p);
    const eve = p.as(); await eve.google(ACCTS.eve);
    assert.equal((await eve.post("/api/space", { kind: "org", id: orgId })).status, 403);
    assert.equal((await eve.post("/api/org/accept", { id: orgId })).status, 403);
    assert.equal((await eve.get("/api/state")).status, 401);
  });
  test("domain lock refuses outside accounts", async () => {
    const p = preview(), { sam } = await samWithWorkspace(p, { lockDomain: true });
    assert.equal((await sam.post("/api/org/members", { op: "invite", email: "pat@gmail.com", role: "emp", empId: "e8" })).status, 400);
  });
  test("only HR can manage users; the last signed-in HR admin stays", async () => {
    const p = preview(), { sam, orgId } = await samWithWorkspace(p);
    await sam.post("/api/org/members", { op: "invite", email: "ana@bayside.com", role: "emp", empId: "e8" });
    await sam.post("/api/org/members", { op: "invite", email: "ghost@bayside.com", role: "hr", empId: "e1" });
    assert.equal((await sam.post("/api/org/members", { op: "role", email: "sam@bayside.com", role: "emp" })).status, 400);
    const ana = p.as({ ip: "5.5.5.5" }); await ana.google(ACCTS.ana); await ana.post("/api/org/accept", { id: orgId });
    assert.equal((await ana.get("/api/org/members")).status, 403);
    assert.equal((await ana.post("/api/org/members", { op: "role", email: "ana@bayside.com", role: "hr" })).status, 403);
  });
  test("a manager in a workspace sees dates, not reasons", async () => {
    const p = preview(), { sam, orgId } = await samWithWorkspace(p);
    await sam.post("/api/org/members", { op: "invite", email: "ana@bayside.com", role: "mgr", empId: "e9" });
    const ana = p.as({ ip: "6.6.6.6" }); await ana.google(ACCTS.ana); await ana.post("/api/org/accept", { id: orgId });
    const st = (await ana.get("/api/state")).body;
    assert.equal(st.me.role, "mgr");
    assert.ok(st.data.teamCases.length > 0);
    assert.ok(st.data.teamCases.every((tc) => !("reason" in tc) && !("notes" in tc)));
  });
  test("removing a user ends their access", async () => {
    const p = preview(), { sam, orgId } = await samWithWorkspace(p);
    await sam.post("/api/org/members", { op: "invite", email: "ana@bayside.com", role: "emp", empId: "e8" });
    const ana = p.as({ ip: "7.7.7.7" }); await ana.google(ACCTS.ana); await ana.post("/api/org/accept", { id: orgId });
    assert.equal((await ana.get("/api/state")).status, 200);
    await sam.post("/api/org/members", { op: "remove", email: "ana@bayside.com" });
    assert.equal((await ana.get("/api/state")).status, 401);
  });
  test("each user can create at most 2 workspaces, even after handing off HR", async () => {
    const p = preview(), { sam } = await samWithWorkspace(p);
    assert.equal((await sam.post("/api/org/create", { name: "Two", headcount: 5, start: "empty", agree: true })).status, 200);
    assert.equal((await sam.post("/api/org/create", { name: "Three", headcount: 5, start: "empty", agree: true })).status, 403);
  });
  test("reset is not available inside a workspace", async () => {
    const p = preview(), { sam } = await samWithWorkspace(p);
    assert.equal((await sam.post("/api/action", { type: "reset" })).status, 403);
  });
});

describe("preview site: inbox tools", () => {
  test("surveys from invites marked as test are left out of the numbers", async () => {
    const p = preview();
    const a = await adminClient(p);
    const real = (await a.post("/api/admin/invite", { name: "Real" })).body.code;
    const mine = (await a.post("/api/admin/invite", { name: "Mine" })).body.code;
    const answers = { role: "Owner or founder", size: "5 to 19", leaves: "1 or 2", pain: 5, pay: "Yes" };
    for (const [code, ip] of [[real, "8.1.1.1"], [mine, "8.2.2.2"]]) {
      const c = p.as({ ip }); await c.post("/api/join", { code }); await c.post("/api/login", { email: "ben@mesaverde.example" });
      assert.equal((await c.post("/api/survey", { answers })).status, 200);
    }
    assert.equal((await a.get("/api/admin/state")).body.summary.responses, 2);
    await a.post("/api/admin/invite/update", { code: mine, test: true });
    const st = (await a.get("/api/admin/state")).body;
    assert.equal(st.summary.responses, 1);
    assert.equal(st.summary.testExcluded, 1);
    assert.ok(st.surveys.find((s) => s.invite === mine).test);
  });
  test("workspaces the site admin creates are marked as test", async () => {
    const p = preview();
    const o = p.as(); await o.google(ACCTS.owner);
    const r = await o.post("/api/org/create", { name: "Owner Trial", headcount: 10, start: "empty", agree: true });
    assert.equal(r.status, 200);
    const a = await adminClient(p);
    assert.equal((await a.get("/api/admin/state")).body.orgs[0].test, true);
  });
  test("the Clerk test runs in batches and only for the admin", async () => {
    const p = preview();
    const prospect = p.as(); await prospect.google(ACCTS.pat);
    assert.equal((await prospect.post("/api/admin/eval/start", {})).status, 401);
    const a = await adminClient(p);
    const s = (await a.post("/api/admin/eval/start", {})).body;
    assert.equal(s.total, 50);
    let last;
    for (let from = 0; from < s.total; from += s.batch) last = (await a.post("/api/admin/eval/batch", { run: s.run, from })).body;
    assert.equal(last.done, true);
    assert.equal(last.summary.cases, 50);
    assert.ok(last.summary.reasonPct > 0 && last.summary.reasonPct < 100, "the stand-in model always answers family_care, so some rows must miss");
    const st = (await a.get("/api/admin/state")).body;
    assert.equal(st.clerk.runs[0].summary.cases, 50);
  });
});
