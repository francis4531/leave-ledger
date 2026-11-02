// Records the step-by-step walkthroughs on the Guide tab, one per kind of user, from the real app on a local server.
// Run: node scripts/record-guides.mjs   (needs Playwright with Chromium)
// Writes public/guides/<hr|mgr|emp>/NN.jpg and public/guides/walkthroughs.json. Made-up data only.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { startServer } from "./dev-server.mjs";
import { templateCSV } from "../public/roster.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, "public", "guides");
const W = 1100, H = 760;
const manifest = {};

async function flow(browser, key, title, intro) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const dir = path.join(outDir, key);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const steps = [];
  // One step: scroll the highlighted part into view, ring it, take the picture.
  const step = async (t, d, at) => {
    await p.waitForTimeout(200);
    await p.evaluate((sel) => {
      document.querySelectorAll("[data-ring]").forEach((x) => { x.style.outline = ""; x.style.outlineOffset = ""; x.removeAttribute("data-ring"); });
      const t = document.getElementById("toast"); if (t) t.hidden = true;
      const fb = document.getElementById("fbBtn"); if (fb) fb.style.display = "none";
      const el = sel && document.querySelector(sel); if (!el) { window.scrollTo(0, 0); return; }
      el.setAttribute("data-ring", ""); el.style.outline = "4px solid #f0a020"; el.style.outlineOffset = "4px";
      const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - Math.max(90, (innerHeight - Math.min(r.height, innerHeight - 120)) / 2));
    }, at || null);
    const n = String(steps.length + 1).padStart(2, "0");
    await p.screenshot({ path: path.join(dir, `${n}.jpg`), type: "jpeg", quality: 80 });
    steps.push({ img: `/guides/${key}/${n}.jpg`, t, d });
  };
  return { p, ctx, step, done: () => { manifest[key] = { title, intro, steps }; console.log(`${key}: ${steps.length} steps`); } };
}

async function hr(browser) {
  const S = await startServer("preview");
  try {
    const admin = await (await browser.newContext()).newPage();
    await admin.goto(S.base + "/inbox"); await admin.fill("#pw", "admin-pass-1"); await admin.click('button:has-text("Sign in")');
    await admin.fill("#nm", "Sam Lee, Bayside Dental"); await admin.fill("#ne", "sam@bayside.com"); await admin.click("text=Create invite link"); await admin.waitForSelector(".link");

    const { p, step, done } = await flow(browser, "hr", "Running leave as HR", "Set up once, then Leave Ledger tells you what is due and drafts what you send.");
    await p.goto(S.base); await p.click(".gbtn"); await p.waitForURL(/fake-google/); await p.click("text=sam@bayside.com");
    await p.waitForSelector("[data-create]"); await p.fill("#ws-name", "Bayside Dental"); await p.check("#ws-agree"); await p.click("[data-create]"); await p.waitForSelector("#tabs button");
    await p.click('[data-tab="settings"]'); await p.waitForSelector("#co-hc");
    await step("Tell Leave Ledger about your company", "Settings. Your headcount and holidays decide which California leave laws apply to you.", "#co-hc");
    await p.click('[data-tab="employees"]'); await p.click("[data-imp-open]");
    await p.setInputFiles("#imp-file", { name: "employees.csv", mimeType: "text/csv", buffer: Buffer.from(templateCSV()) }); await p.waitForSelector(".imp-sum");
    await step("Bring in your employees", "Employees, then Import from a file. Fill in the template from your HR or payroll system and upload it. You see every row before anything is saved.", ".imp-sum");
    await p.click("[data-imp-go]"); await p.waitForTimeout(300);
    await p.click('[data-tab="access"]'); await p.waitForSelector("#us-email"); await p.fill("#us-email", "ana@bayside.com");
    await step("Invite your team to sign in", "Users. Each employee signs in with Google and sees only their own leave. Managers see dates, never reasons.", '[data-form="users"]');
    await p.click('[data-tab="overview"]'); await p.waitForTimeout(200);
    await step("Start each day on Today", "Every deadline you owe by law, soonest first. Tick a step when it is done.", ".panel");
    await p.click('[data-tab="cases"]'); await p.click('tr[data-open]:has-text("Marcus Bell")'); await p.waitForSelector(".appr");
    await step("Open a leave that needs approval", "Leaves. The plan shows the protected dates, what the state pays, and whether the employee qualifies.", ".appr");
    await p.click("[data-appr-open]"); await p.waitForSelector(".mailprev");
    await step("Check what the manager will read", "The manager gets the dates and what not to do. Never the reason, the type of leave, or anything medical.", ".mailprev");
    await p.click("[data-appr-go]"); await p.waitForSelector(".status-banner.ok");
    await step("Approved", "The employee now sees a green Confirmed on their leave page, and the manager has the dates.", ".status-banner.ok");
    await p.click('[data-letter$="|notice"]'); await p.waitForSelector("#lt-body");
    await step("Send the letters the law requires", "Leave Ledger drafts each letter from the plan. Read it, edit it, then mark it sent. The employee can read it on their leave page.", ".letter");
    done();
  } finally { await S.close(); }
}

async function mgr(browser) {
  const S = await startServer("test");
  try {
    const hrp = await (await browser.newContext()).newPage();
    await hrp.goto(S.base); await hrp.fill("#lg-pw", "test-pass-123"); await hrp.click('[data-pick="grace@mesaverde.example"]');
    await hrp.click('[data-tab="cases"]'); await hrp.click('tr[data-open]:has-text("Marcus Bell")'); await hrp.click("[data-appr-open]"); await hrp.click("[data-appr-go]"); await hrp.waitForSelector(".status-banner.ok");

    const { p, step, done } = await flow(browser, "mgr", "Leave for managers", "You see when your team is out and plan coverage. The reasons stay with HR.");
    await p.goto(S.base); await p.fill("#lg-pw", "test-pass-123"); await p.click('[data-pick="mei@mesaverde.example"]'); await p.waitForSelector(".calw");
    await step("See who is out", "My team shows the next 12 weeks. You see dates only, never why.", ".calw");
    await p.click("text=Message from HR"); await p.waitForTimeout(200);
    await step("HR tells you when a leave is approved", "You get the dates, the expected return, and what to do and not do. It also comes by email when your company has it set up.", "details:has(.letter-text)");
    await p.fill('[data-cov]', "Sofia covers the Saturday opening. Temp barista starts Nov 9.");
    await step("Plan coverage", "Write who covers what. HR sees your plan on the leave.", "[data-cov]");
    await p.selectOption("#fl-emp", { index: 1 }); await p.fill("#fl-note", "Asked for some time off next month");
    await step("Heard someone needs time off? Tell HR the same day", "The legal clock starts when you hear about it, even if they never say the word leave. Keep it short, no medical details.", '[data-form="flag"]');
    done();
  } finally { await S.close(); }
}

async function emp(browser) {
  const S = await startServer("test");
  try {
    const { p, step, done } = await flow(browser, "emp", "Asking for time off", "Find out what you qualify for, send the request, and follow it until it is confirmed.");
    await p.goto(S.base); await p.fill("#lg-pw", "test-pass-123"); await p.click('[data-pick="ben@mesaverde.example"]'); await p.waitForSelector("#tabs button");
    await step("See what you have", "My leave shows your sick hours, family leave, and about how much the state pays while you are out.", ".balance");
    await p.click('[data-tab="guide"]'); await p.waitForSelector(".leavecards");
    await step("Learn your options", "Guide explains each California leave in plain words: how long, what it pays, who qualifies.", ".leavecards");
    await p.click("[data-wiz-start]");
    await step("Not sure which leave fits? Start here", "Pick what is going on. A few questions, and nothing is sent until you say so.", ".choices");
    await p.click('[data-wiz-need="family_care"]'); await p.click("[data-wiz-next]"); await p.waitForSelector("[data-wiz-use]");
    await step("See your protection and pay first", "The dates your job is protected and what the state may pay, worked out for you.", "main .panel");
    await p.click("[data-wiz-use]"); await p.waitForSelector('[data-form="req"]');
    await step("Check it and send it to HR", "The request is filled in from your answers. Change anything, then send it.", '[data-form="req"]');
    await p.click("[data-submitreq]"); await p.waitForSelector(".status-banner.sent");
    await step("Follow your request", "Sent to HR, then HR reviewing, then Confirmed. HR replies within 5 business days.", ".status-banner");
    const hrp = await (await browser.newContext()).newPage();
    await hrp.goto(S.base); await hrp.fill("#lg-pw", "test-pass-123"); await hrp.click('[data-pick="grace@mesaverde.example"]');
    await hrp.click('[data-tab="cases"]'); await hrp.click('tr[data-open]:has-text("Ben Whitaker")'); await hrp.click("[data-appr-open]"); await hrp.click("[data-appr-go]"); await hrp.waitForSelector(".status-banner.ok");
    await p.reload(); await p.waitForSelector(".status-banner.ok");
    await step("Look for the green Confirmed", "When HR approves, your dates are confirmed. Your manager is told the dates only, never the reason.", ".status-banner.ok");
    await step("Get paid by the state, step by step", "File with EDD using the dates and links here. Tick each step as you go.", ".edd .claim");
    done();
  } finally { await S.close(); }
}

const browser = await chromium.launch();
try { await hr(browser); await mgr(browser); await emp(browser); } finally { await browser.close(); }
fs.writeFileSync(path.join(outDir, "walkthroughs.json"), JSON.stringify(manifest, null, 1) + "\n");
for (const f of ["hr-setup.gif", "employee.gif"]) fs.rmSync(path.join(outDir, f), { force: true });
