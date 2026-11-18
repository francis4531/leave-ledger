// Signing in with a link sent by email, for users without a Google account.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, client, installFakes, PREVIEW_ENV, ACCTS } from "./helpers.mjs";

before(() => installFakes());
const MAIL = { ...PREVIEW_ENV, LL_RESEND_API_KEY: "re_test", LL_MAIL_FROM: "Leave Ledger <hello@leaveledger.test>" };
const site = (env = MAIL) => { const store = memoryStore(); return { store, as: (o) => client(store, env, o) }; };
const linkFor = async (c, email) => {
  globalThis.__mails = [];
  assert.equal((await c.post("/api/auth/email/start", { email })).status, 200);
  const m = globalThis.__mails.at(-1);
  assert.equal(m.to[0], email.toLowerCase());
  return new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get("signin");
};

describe("sign in with an emailed link", () => {
  test("the link signs in once; opening it alone does nothing, the app's POST does", async () => {
    const s = site(), c = s.as();
    const t = await linkFor(c, "Rosa@Bakery.com");
    assert.equal((await c.get("/api/me")).body.user, null, "asking for a link does not sign in");
    assert.equal((await c.post("/api/auth/email/finish", { t })).status, 200);
    assert.equal((await c.get("/api/me")).body.user.email, "rosa@bakery.com");
    const other = s.as();
    assert.equal((await other.post("/api/auth/email/finish", { t })).status, 400, "a used link does not work again");
  });

  test("an expired or made-up link is refused", async () => {
    const s = site(), c = s.as();
    const t = await linkFor(c, "rosa@bakery.com");
    for (const [k, v] of s.store.map) if (k.startsWith("login-tokens/")) s.store.map.set(k, JSON.stringify({ ...JSON.parse(v), exp: Date.now() - 1000 }));
    assert.equal((await c.post("/api/auth/email/finish", { t })).status, 400);
    assert.equal((await c.post("/api/auth/email/finish", { t: "x".repeat(32) })).status, 400);
    assert.equal((await c.post("/api/auth/email/finish", { t: "../../users/g-sam" })).status, 400);
    assert.equal((await c.get("/api/me")).body.user, null);
  });

  test("Google and an emailed link reach the same user and the same workspaces, in either order", async () => {
    const s = site(), g = s.as();
    await g.google(ACCTS.sam);
    const before = (await g.get("/api/me")).body.user;
    const e = s.as(), t = await linkFor(e, "sam@bayside.com");
    await e.post("/api/auth/email/finish", { t });
    assert.equal((await e.get("/api/me")).body.user.email, before.email);
    assert.equal(s.store.map.has("users/g-sam") && [...s.store.map.keys()].filter((k) => k.startsWith("users/")).length, 1, "no second user record");
    // Email first, then Google: still one user.
    const s2 = site(), e2 = s2.as(), t2 = await linkFor(e2, "pat@gmail.com");
    await e2.post("/api/auth/email/finish", { t: t2 });
    const g2 = s2.as(); await g2.google(ACCTS.pat);
    assert.equal([...s2.store.map.keys()].filter((k) => k.startsWith("users/")).length, 1);
  });

  test("bad emails, too many links, and email being off", async () => {
    const s = site(), c = s.as();
    assert.equal((await c.post("/api/auth/email/start", { email: "rosa@" })).status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/auth/email/start", { email: `r${i}@bakery.com` })).status, 200);
    assert.equal((await c.post("/api/auth/email/start", { email: "r9@bakery.com" })).status, 429);
    const off = site({ ...PREVIEW_ENV });
    assert.equal((await off.as().post("/api/auth/email/start", { email: "rosa@bakery.com" })).status, 503);
    assert.equal((await site({ ...PREVIEW_ENV, LL_DEV_EMAIL_LINKS: "show" }).as().post("/api/auth/email/start", { email: "rosa@bakery.com" })).body.devLink.includes("signin="), true);
  });

  test("a user signed in by email is asked for their name when setting up a workspace", async () => {
    const s = site(), adm = s.as();
    assert.equal((await adm.post("/api/admin/login", { password: "admin-pass-1" })).status, 200);
    await adm.post("/api/admin/invite", { name: "Rosa, Bakery", email: "rosa@bakery.com" });
    const c = s.as(), t = await linkFor(c, "rosa@bakery.com");
    await c.post("/api/auth/email/finish", { t });
    assert.equal((await c.get("/api/me")).body.create.ok, true);
    const body = { name: "Rosa's Bakery", city: "Fresno", headcount: 12, start: "empty", agree: true };
    assert.match((await c.post("/api/org/create", body)).body.error, /your name/);
    const r = await c.post("/api/org/create", { ...body, yourName: "Rosa Diaz" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await c.get("/api/me")).body.user.name, "Rosa Diaz");
  });
});
