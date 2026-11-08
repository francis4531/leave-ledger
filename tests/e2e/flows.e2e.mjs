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
    await p.click("[data-ack-letter]");
    await p.waitForSelector("text=You confirmed receiving this");
    await p.click("[data-logout]");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="cases"]');
    await p.click('tr[data-open]:has-text("Marcus Bell")');
    await p.click("[data-letter-view]");
    await p.waitForSelector(".proof");
    const proof = await p.textContent(".proof");
    assert.match(proof, /Receipt confirmed/); assert.match(proof, /Marcus opened it/); assert.match(proof, /Marcus confirmed receiving it/);
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

  test("employee uses the guide wizard, sends the request, and ticks off an EDD step", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="priya@mesaverde.example"]');
    await p.click('[data-tab="guide"]');
    assert.equal((await p.$$(".lcard")).length, 7, "seven leave cards");
    await p.click("[data-wiz-start]");
    await p.click('[data-wiz-need="family_care"]');
    await p.selectOption("#wz-rel", "parent");
    await p.fill("#wz-wk", "5");
    await p.click("[data-wiz-next]");
    await p.waitForSelector("[data-wiz-use]");
    assert.match(await p.textContent("main"), /Your job is protected from/);
    await p.click("[data-wiz-use]");
    await p.waitForSelector('[data-form="req"]');
    assert.equal(await p.inputValue("#rq-reason"), "family_care");
    await p.click("[data-submitreq]");
    await p.waitForSelector("#toast:not([hidden])");
    assert.ok(await p.$(".status-banner.sent, .status-banner.wait"), "a new request says it is not confirmed yet");
    const box = p.locator('[data-edd$="|pfl-account"]').first();
    await box.check();
    await p.waitForSelector("text=Ticked off");
    assert.ok(await p.locator('[data-edd$="|pfl-account"]').first().isChecked(), "stays ticked after saving");
    assert.deepEqual(errors, []);
  });

  test("HR imports employees from the template, approves a leave, and the manager gets only the dates", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="employees"]');
    await p.click("[data-imp-open]");
    const { templateCSV } = await import("../../public/roster.mjs");
    await p.setInputFiles("#imp-file", { name: "team.csv", mimeType: "text/csv", buffer: Buffer.from(templateCSV()) });
    await p.waitForSelector(".imp-sum");
    assert.match(await p.textContent(".imp-sum"), /3 new employees/);
    await p.click("[data-imp-go]");
    await p.waitForSelector("text=Imported: 3 added");
    assert.ok(await p.$("text=jamie.rivera@example.com"), "new employee listed with email");

    await p.click('[data-tab="cases"]');
    await p.click('tr[data-open]:has-text("Marcus Bell")');
    await p.click("[data-appr-open]");
    await p.fill("#ap-note", "after the surgery");
    assert.ok(await p.$eval("[data-appr-go]", (x) => x.disabled), "a note with the reason cannot be sent");
    await p.fill("#ap-note", "A temp starts Monday.");
    await p.click("[data-appr-go]");
    await p.waitForSelector(".status-banner.ok");
    await p.click("[data-logout]");
    await p.click('[data-pick="mei@mesaverde.example"]');
    await p.click("text=Message from HR");
    const text = await p.textContent("main");
    assert.match(text, /approved time off for Marcus Bell/);
    assert.match(text, /A temp starts Monday/);
    for (const w of ["Care for", "Family and medical", "CFRA", "Paid Family Leave", "surgery"]) assert.ok(!text.includes(w), `manager must not see "${w}"`);
    await p.click("[data-logout]");
    await p.click('[data-pick="marcus@mesaverde.example"]');
    await p.waitForSelector(".status-banner.ok");
    assert.match(await p.textContent(".status-banner.ok"), /Confirmed by HR/);
    await p.click('[data-tab="guide"]');
    await p.waitForSelector(".walk h4");
    assert.equal(await p.textContent(".walk h3"), "Asking for time off", "employees get the employee walkthrough");
    assert.equal((await p.$$("[data-walk-flow]")).length, 0, "and only that one");
    assert.deepEqual(errors, []);
  });

  test("HR uploads an export with unfamiliar headings, Clerk matches the columns, and the next upload remembers", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="employees"]');
    await p.click("[data-imp-open]");
    const csv = "Employee,Login,Began,Boss\nNoor Haddad,noor@example.com,2022-02-01,Dana Ortiz\n";
    await p.setInputFiles("#imp-file", { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await p.waitForSelector(".mapbox");
    assert.ok(await p.$eval("[data-map-done]", (x) => x.disabled), "cannot continue without email and hire date");
    await p.click("[data-map-clerk]");
    await p.waitForSelector("[data-map-done]:not([disabled])");
    assert.equal(await p.inputValue('[data-map="email"]'), "1");
    await p.click("[data-map-done]");
    await p.waitForSelector(".imp-sum");
    await p.click("[data-imp-go]");
    await p.waitForSelector("text=Imported: 1 added");
    await p.click("[data-imp-open]");
    await p.setInputFiles("#imp-file", { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await p.waitForSelector(".imp-sum");
    assert.match(await p.textContent('[data-form="imp"]'), /same way as your last upload/);
    assert.deepEqual(errors, []);
  });

  test("after HR browses the HR walkthrough, a manager and an employee on the same browser see only their own", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.click('[data-tab="guide"]');
    await p.waitForSelector("[data-walk-flow]");
    await p.click('[data-walk-flow="hr"]'); await p.click('[data-walk="1"]');
    for (const [who, title] of [["mei", "Leave for managers"], ["marcus", "Asking for time off"]]) {
      await p.click("[data-logout]");
      await p.click('[data-pick="' + who + '@mesaverde.example"]');
      await p.click('[data-tab="guide"]');
      await p.waitForSelector(".walk h4");
      assert.equal(await p.textContent(".walk h3"), title, who);
      assert.match(await p.textContent(".walk-text"), /Step 1 of/);
      assert.equal((await p.$$("[data-walk-flow]")).length, 0);
    }
    assert.deepEqual(errors, []);
  });

  test("every HR screen opens without errors", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="grace@mesaverde.example"]');
    for (const t of ["overview", "cases", "plan", "employees", "settings", "guide", "myleave"]) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(100); }
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
    await p.waitForSelector("#tabs button");
    assert.ok(await p.$('[data-tab="settings"]'), "HR in a sample copy has Settings");
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
    assert.deepEqual(await ana.p.$$eval("#tabs button", (b) => b.map((x) => x.textContent)), ["My leave", "Guide"]);
    for (const x of [sam, ana, admin]) assert.deepEqual(x.errors, []);
  });

  test("HR downloads the workspace data, sees backups, and deletes the workspace", async () => {
    const admin = await page();
    await admin.p.goto(S.base + "/inbox"); await admin.p.fill("#pw", "admin-pass-1"); await admin.p.click('button:has-text("Sign in")');
    await admin.p.fill("#nm", "Pat, Kim Florist"); await admin.p.fill("#ne", "pat@gmail.com"); await admin.p.click("text=Create invite link"); await admin.p.waitForSelector(".link");
    const { p, errors } = await page({ acceptDownloads: true });
    await p.goto(S.base); await p.click(".gbtn"); await google(p, "pat@gmail.com");
    await p.fill("#ws-name", "Kim Florist"); await p.check("#ws-agree"); await p.click("[data-create]"); await p.waitForSelector("#tabs button");
    await p.click('[data-tab="settings"]');
    await p.waitForSelector("text=No backup yet");
    const [csv] = await Promise.all([p.waitForEvent("download"), p.click('[data-dl="employees"]')]);
    assert.match(csv.suggestedFilename(), /^kim-florist-employees-\d{4}-\d{2}-\d{2}\.csv$/);
    const [all] = await Promise.all([p.waitForEvent("download"), p.click('[data-dl="all"]')]);
    const json = JSON.parse(await (await import("node:fs")).promises.readFile(await all.path(), "utf8"));
    assert.equal(json.workspace.name, "Kim Florist");
    await admin.p.click("[data-backup-now]"); await admin.p.waitForSelector("text=Backed up");
    await p.click("[data-del-open]"); await p.fill("#del-name", "Kim"); await p.click("[data-del-go]");
    await p.waitForSelector("text=Type the workspace name exactly");
    await p.fill("#del-name", "Kim Florist"); await p.click("[data-del-go]");
    await p.waitForSelector("text=Workspace deleted");
    for (const x of [admin]) assert.deepEqual(x.errors, []);
    assert.deepEqual(errors, []);
  });

  test("a visitor with no invite opens their own sandbox and gets the full product, labeled", async () => {
    const { p, errors } = await page();
    await p.goto(S.base);
    await p.click("[data-sandbox]");
    await p.waitForSelector("[data-pick]");
    assert.equal(await p.textContent(".envtag"), "Sandbox");
    assert.match(await p.textContent(".welcome"), /deleted after 7 days/);
    await p.click('[data-pick="grace@mesaverde.example"]');
    await p.waitForSelector("#tabs button");
    assert.equal(await p.textContent(".envtag"), "Sandbox");
    await p.click('[data-tab="access"]');
    await p.waitForSelector("text=Just you");
    assert.equal(await p.$("[data-invite-colleague]"), null, "no colleague invites in a sandbox");
    await p.click('[data-tab="cases"]');
    await p.click("tr[data-open]");
    assert.ok(await p.$("[data-letter], [data-letter-view]"), "letters work");
    assert.deepEqual(errors, []);
  });

  test("a visitor without an invite sees the landing page with the sandbox, and /strategy is not found", async () => {
    const { p } = await page();
    await p.goto(S.base);
    await p.waitForSelector("text=Invited to the early preview?"); await p.waitForSelector("[data-sandbox]");
    await p.goto(S.base + "/strategy");
    await p.waitForSelector("text=Page not found");
  });
});

// Parity: HR gets the same product in the test site, a prospect's sample copy, and a real workspace.
describe("same product everywhere", { skip }, () => {
  const HR_TABS = ["overview", "cases", "plan", "employees", "settings", "myleave"];
  async function checkHR(p, label, { users }) {
    const tabs = await p.$$eval("#tabs [data-tab], #tabs .more-menu [data-tab]", (b) => b.map((x) => x.dataset.tab));
    for (const t of HR_TABS) assert.ok(tabs.includes(t), `${label}: ${t} tab`);
    assert.equal(tabs.includes("access"), users, `${label}: Users tab`);
    await p.click('[data-tab="settings"]');
    for (const sel of ["#co-name", "#co-hc", "#co-hol", "#co-max"]) assert.ok(await p.$(sel), `${label}: setting ${sel}`);
    await p.click('[data-tab="employees"]');
    assert.ok(await p.$("[data-addemp-open]"), `${label}: add employee`);
    await p.click('[data-tab="cases"]');
    await p.click("tr[data-open]");
    assert.ok(await p.$("[data-change]"), `${label}: change this leave`);
    assert.ok(await p.$("[data-letter], [data-letter-view]"), `${label}: letters`);
  }
  test("test site, sample copy and workspace give HR every screen", async () => {
    const T = await startServer("test"), P = await startServer("preview");
    try {
      const t = await page(); await t.p.goto(T.base); await t.p.fill("#lg-pw", "test-pass-123"); await t.p.click('[data-pick="grace@mesaverde.example"]'); await t.p.waitForSelector("#tabs button");
      await checkHR(t.p, "test site", { users: false });

      const admin = await page(); await admin.p.goto(P.base + "/inbox"); await admin.p.fill("#pw", "admin-pass-1"); await admin.p.click('button:has-text("Sign in")');
      await admin.p.fill("#nm", "Parity"); await admin.p.fill("#ne", "sam@bayside.com"); await admin.p.click("text=Create invite link");
      const link = (await admin.p.textContent(".link")).trim();
      const s = await page(); await s.p.goto(link); await s.p.click('[data-pick="grace@mesaverde.example"]'); await s.p.waitForSelector("#tabs button");
      await checkHR(s.p, "sample copy", { users: true });
      await s.p.click('[data-tab="access"]'); await s.p.waitForSelector("[data-invite-colleague]");
      assert.equal((await s.p.$$("button[data-pick]")).length, 9, "Try as for the other 9 sample users");

      const w = await page(); await w.p.goto(P.base); await w.p.click(".gbtn"); await google(w.p, "sam@bayside.com");
      await w.p.fill("#ws-name", "Parity Co"); await w.p.check("#ws-agree"); await w.p.click("[data-create]"); await w.p.waitForSelector("#tabs button");
      await checkHR(w.p, "workspace", { users: true });
      for (const x of [t, s, w, admin]) assert.deepEqual(x.errors, []);
    } finally { await T.close(); await P.close(); }
  });
});
