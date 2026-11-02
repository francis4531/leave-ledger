// Click-through tests in a real browser (Chromium via Playwright) against a local server.
// Run: npm run e2e   (needs Playwright with Chromium installed; skipped if it is missing)
// Not part of the deploy gate, because Netlify builds have no browser.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../../scripts/dev-server.mjs";

import { createRequire } from "node:module";
let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { chromium = null; }
const skip = chromium ? false : "Playwright is not installed";

let browser;
before(async () => { if (chromium) browser = await chromium.launch(); });
after(async () => { if (browser) await browser.close(); });

async function page(ctxOpts = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  return { p, ctx, errors };
}
const google = async (p, email) => { await p.waitForURL(/fake-google/); await p.click(`text=${email}`); };

describe("test site", { skip }, () => {
  let S;
  before(async () => { S = await startServer("test"); });
  after(async () => { await S.close(); });

  test("employee asks for leave in their own words, HR sees it and works the to-do list", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="ben@mesaverde.example"]');
    await p.waitForSelector('[data-form="req"]');
    await p.fill("#rq-text", "My dad has surgery on the 12th, I need a few weeks");
    await p.click("[data-intake]");
    await p.waitForSelector(".needs-check, .cp-note", { timeout: 5000 });
    assert.equal(await p.inputValue("#rq-reason"), "family_care", "Clerk filled the form");
    await p.click("[data-submitreq]");
    await p.waitForSelector("#toast:not([hidden])");
    assert.match(await p.textContent("#toast"), /Sent/);

    await p.click("[data-logout]");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="cases"]');
    const rows = await p.$$eval("tr[data-open]", (rs) => rs.map((r) => r.textContent));
    assert.ok(rows.some((t) => t.includes("Ben Whitaker")), "HR sees Ben's request");
    await p.click('tr[data-open]:has-text("Ben Whitaker")');
    const box = p.locator("input[data-task]").first();
    await box.check();
    await p.waitForSelector("#toast:not([hidden])");
    assert.match(await p.textContent("#toast"), /done/i);
    assert.deepEqual(errors, []);
  });

  test("HR writes and sends a letter from the draft, and the employee reads it", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="cases"]');
    await p.click('tr[data-open]:has-text("Marcus Bell")');
    await p.click('[data-letter$="|notice"]');
    await p.waitForSelector("#lt-body");
    assert.match(await p.inputValue("#lt-body"), /California Family Rights Act/);
    await p.fill("#lt-subject", "What you qualify for");
    await p.click("[data-letter-send]");
    await p.waitForSelector(".letter-text");
    await p.click("[data-logout]");
    await p.click('[data-pick="marcus@mesaverde.example"]');
    await p.click(".letter-item summary");
    assert.match(await p.textContent(".letter-item"), /What you qualify for/);
    assert.deepEqual(errors, []);
  });

  test("manager flags a possible leave and never sees the reason", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="dana@mesaverde.example"]');
    await p.waitForSelector('[data-form="flag"]');
    await p.selectOption('[data-form="flag"] select', { index: 1 });
    await p.fill("#fl-note", "Asked for some time off next month");
    await p.click("[data-flag]");
    await p.waitForSelector("#toast:not([hidden])");
    const text = await p.textContent("main");
    for (const word of ["Pregnancy", "Own serious health", "Bereavement"]) assert.ok(!text.includes(word), `manager must not see "${word}"`);
    assert.deepEqual(errors, []);
  });

  test("every HR screen opens without errors", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    for (const t of ["overview", "cases", "plan", "employees", "settings", "myleave"]) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(100); }
    assert.deepEqual(errors, []);
  });
});

describe("preview site", { skip }, () => {
  let S;
  before(async () => { S = await startServer("preview"); });
  after(async () => { await S.close(); });

  test("prospect opens an invite link, sends feedback and takes the survey; the inbox shows it", async () => {
    const admin = await page();
    await admin.p.goto(S.base + "/inbox");
    await admin.p.fill("#pw", "admin-pass-1");
    await admin.p.click('button:has-text("Sign in")');
    await admin.p.fill("#nm", "Riley, Harbor Vet");
    await admin.p.click("text=Create invite link");
    const link = (await admin.p.textContent(".link")).trim();

    const { p, errors } = await page();
    await p.goto(link);
    await p.waitForSelector("[data-pick]");
    assert.equal(await p.textContent(".envtag"), "Early preview");
    await p.click('[data-pick="grace@mesaverde.example"]');
    assert.ok(!(await p.$('[data-tab="settings"]')), "no Settings for prospects");
    await p.click("#fbBtn");
    await p.click('[data-fb-rate="4"]');
    await p.fill("#fb-note", "Clear and fast");
    await p.click("[data-fb-send]");
    await p.waitForSelector("#toast:not([hidden])");
    await p.click("[data-survey]");
    await p.click('[data-sv="role"][data-val="Owner or founder"]');
    await p.click('[data-sv="size"][data-val="5 to 19"]');
    await p.click('[data-sv="pain"][data-val="4"]');
    await p.click('[data-sv="pay"][data-val="Yes"]');
    await p.click("[data-survey-send]");
    await p.waitForSelector("text=Thank you");

    await admin.p.click("[data-refresh]");
    await admin.p.waitForSelector("text=Clear and fast");
    assert.match(await admin.p.textContent(".stats"), /1\s*Surveys answered/);
    assert.deepEqual(errors, []);
    assert.deepEqual(admin.errors, []);
  });

  test("invited HR creates a workspace, invites an employee, who accepts and sees only their own leave", async () => {
    const admin = await page();
    await admin.p.goto(S.base + "/inbox");
    await admin.p.fill("#pw", "admin-pass-1");
    await admin.p.click('button:has-text("Sign in")');
    await admin.p.fill("#nm", "Sam Lee, Bayside");
    await admin.p.fill("#ne", "sam@bayside.com");
    await admin.p.click("text=Create invite link");
    await admin.p.waitForSelector(".link");

    const sam = await page();
    await sam.p.goto(S.base);
    await sam.p.click(".gbtn");
    await google(sam.p, "sam@bayside.com");
    await sam.p.waitForSelector("[data-create]");
    await sam.p.fill("#ws-name", "Bayside Dental");
    await sam.p.check("#ws-agree");
    await sam.p.click("[data-create]");
    await sam.p.waitForSelector('[data-tab="access"]');
    await sam.p.click('[data-tab="access"]');
    await sam.p.fill("#us-email", "ana@bayside.com");
    await sam.p.selectOption("#us-emp", { label: "Ben Whitaker · Roaster" });
    await sam.p.click("[data-invite-user]");
    await sam.p.waitForSelector("text=ana@bayside.com");

    const ana = await page();
    await ana.p.goto(S.base);
    await ana.p.click(".gbtn");
    await google(ana.p, "ana@bayside.com");
    await ana.p.waitForSelector("[data-accept]");
    await ana.p.click("[data-accept]");
    await ana.p.waitForSelector("#who .nm");
    assert.equal(await ana.p.textContent("#who .nm"), "Ben Whitaker");
    assert.deepEqual(await ana.p.$$eval("#tabs button", (b) => b.map((x) => x.textContent)), ["My leave"]);
    for (const x of [sam, ana, admin]) assert.deepEqual(x.errors, []);
  });

  test("a visitor without an invite sees only the invite-only page, and /strategy is not found", async () => {
    const { p } = await page();
    await p.goto(S.base);
    await p.waitForSelector("text=invite only");
    await p.goto(S.base + "/strategy");
    await p.waitForSelector("text=Page not found");
  });
});
