// Asking to use Leave Ledger for a real company: the request, the admin's approval, the invite email and the prefilled setup.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, client, installFakes, PREVIEW_ENV, ACCTS } from "./helpers.mjs";
import { cleanRequest } from "../netlify/lib/access.mjs";

before(() => installFakes());
const MAIL = { ...PREVIEW_ENV, LL_RESEND_API_KEY: "re_test", LL_MAIL_FROM: "Leave Ledger <hello@leaveledger.test>", LL_ADMIN_EMAILS: "owner@example.com" };
const site = (env = MAIL) => { const store = memoryStore(); return { store, as: () => client(store, env) }; };
const admin = async (s) => { const a = s.as(); assert.equal((await a.post("/api/admin/login", { password: "admin-pass-1" })).status, 200); return a; };
const SAM = { name: "Sam Lee", email: "Sam@Bayside.com ", company: "Bayside Dental", headcount: "22", city: "San Jose, CA", note: "Someone goes on leave in January" };

describe("access requests", () => {
  test("the form checks name, email, company and headcount", () => {
    assert.match(cleanRequest({ ...SAM, name: "" }).error, /name/);
    assert.match(cleanRequest({ ...SAM, email: "sam@" }).error, /email/);
    assert.match(cleanRequest({ ...SAM, company: " " }).error, /company/);
    assert.match(cleanRequest({ ...SAM, headcount: "0" }).error, /employees/);
    const r = cleanRequest(SAM);
    assert.equal(r.email, "sam@bayside.com"); assert.equal(r.headcount, 22);
  });

  test("anyone can ask, a second ask updates the first, and the admin is emailed once", async () => {
    globalThis.__mails = [];
    const s = site(), v = s.as();
    assert.equal((await v.post("/api/access/request", SAM)).status, 200);
    assert.equal((await v.post("/api/access/request", { ...SAM, headcount: 24 })).status, 200);
    const st = (await (await admin(s)).get("/api/admin/state")).body;
    assert.equal(st.requests.length, 1); assert.equal(st.requests[0].headcount, 24); assert.equal(st.requests[0].from, "sign-in page");
    assert.equal(globalThis.__mails.length, 1);
    assert.deepEqual(globalThis.__mails[0].to, ["owner@example.com"]);
    assert.match(globalThis.__mails[0].subject, /Bayside Dental \(22 employees\)/);
  });

  test("the request is not visible or approvable without the admin", async () => {
    const s = site(), v = s.as();
    await v.post("/api/access/request", SAM);
    assert.notEqual((await v.get("/api/admin/state")).status, 200);
    assert.notEqual((await v.post("/api/admin/request", { id: "x", action: "approve" })).status, 200);
    const g = s.as(); await g.google(ACCTS.eve);
    assert.notEqual((await g.get("/api/admin/state")).status, 200);
  });

  test("approve makes an invite for that email, emails the link, and the setup form starts filled in", async () => {
    globalThis.__mails = [];
    const s = site(), v = s.as();
    await v.post("/api/access/request", SAM);
    const a = await admin(s), id = (await a.get("/api/admin/state")).body.requests[0].id;
    globalThis.__mails = [];
    const r = (await a.post("/api/admin/request", { id, action: "approve" })).body;
    assert.equal(r.emailed, true);
    assert.equal(globalThis.__mails[0].to[0], "sam@bayside.com");
    assert.match(globalThis.__mails[0].text, new RegExp(`/\\?invite=${r.code}`));
    assert.doesNotMatch(globalThis.__mails[0].text + globalThis.__mails[0].subject, /[–—]/, "no dashes in the email");
    const st = (await a.get("/api/admin/state")).body;
    assert.equal(st.requests[0].status, "approved");
    // Approving again reuses the same invite.
    assert.equal((await a.post("/api/admin/request", { id, action: "approve" })).body.code, r.code);
    // Sam signs in with Google: the invite is theirs, workspace creation is open, and the form is prefilled.
    const sam = s.as(); await sam.google(ACCTS.sam);
    const me = (await sam.get("/api/me")).body;
    assert.equal(me.create.ok, true);
    assert.deepEqual(me.prefill, { name: "Bayside Dental", city: "San Jose, CA", headcount: 22 });
    // Someone else signing in does not get Sam's details.
    const pat = s.as(); await pat.google(ACCTS.pat);
    assert.equal((await pat.get("/api/me")).body.prefill, null);
  });

  test("decline and reopen; with email off, approve still works and returns the link to send by hand", async () => {
    const env = { ...PREVIEW_ENV }; const s = site(env), v = s.as();
    await v.post("/api/access/request", SAM);
    const a = await admin(s), id = (await a.get("/api/admin/state")).body.requests[0].id;
    await a.post("/api/admin/request", { id, action: "decline" });
    assert.equal((await a.get("/api/admin/state")).body.requests[0].status, "declined");
    await a.post("/api/admin/request", { id, action: "reopen" });
    const r = (await a.post("/api/admin/request", { id, action: "approve" })).body;
    assert.equal(r.emailed, false); assert.match(r.link, /\?invite=/);
  });

  test("too many requests from one place are slowed down", async () => {
    const s = site(), v = s.as();
    for (let i = 0; i < 5; i++) assert.equal((await v.post("/api/access/request", { ...SAM, email: `p${i}@bayside.com` })).status, 200);
    assert.equal((await v.post("/api/access/request", { ...SAM, email: "p9@bayside.com" })).status, 429);
  });
});
