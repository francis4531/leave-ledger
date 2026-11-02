// Records the two walkthrough GIFs shown on the Guide tab, from the real app on a local server.
// Run: node scripts/record-guides.mjs   (needs Playwright with Chromium, and ffmpeg)
// Writes public/guides/hr-setup.gif and public/guides/employee.gif. Made-up data only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { startServer } from "./dev-server.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, "public", "guides");
fs.mkdirSync(outDir, { recursive: true });

const W = 1100, H = 720;

async function recorder(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gif-${name}-`));
  const frames = [];
  // Shows a caption bar and optionally scrolls an element into view, then takes one frame.
  const shot = async (caption, { at, secs = 2.6, step } = {}) => {
    await p.waitForTimeout(150);
    if (at) await p.locator(at).first().scrollIntoViewIfNeeded().catch(() => {});
    if (at) await p.evaluate((sel) => { const el = document.querySelector(sel); if (el) { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - 120); } }, at);
    await p.evaluate(([t, s]) => {
      let bar = document.getElementById("gif-cap");
      if (!bar) { bar = document.createElement("div"); bar.id = "gif-cap"; document.body.appendChild(bar);
        bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#0f2a36;color:#fff;font:600 19px/1.35 system-ui,sans-serif;padding:14px 22px;display:flex;gap:14px;align-items:center;box-shadow:0 -4px 16px rgba(0,0,0,.18)"; }
      bar.innerHTML = (s ? `<span style="background:#fff;color:#0f2a36;border-radius:999px;min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-size:15px">${s}</span>` : "") + `<span>${t}</span>`;
      const toast = document.getElementById("toast"); if (toast) toast.hidden = true;
    }, [caption, step || ""]);
    const f = path.join(dir, `${String(frames.length).padStart(3, "0")}.png`);
    await p.screenshot({ path: f });
    frames.push([f, secs]);
  };
  const finish = () => {
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, frames.map(([f, s]) => `file '${f}'\nduration ${s}`).join("\n") + `\nfile '${frames[frames.length - 1][0]}'\n`);
    const out = path.join(outDir, `${name}.gif`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
      "-vf", "fps=4,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", out]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`${out} · ${(fs.statSync(out).size / 1024).toFixed(0)} KB · ${frames.length} frames`);
  };
  return { p, shot, finish };
}

async function hrSetup(browser) {
  const S = await startServer("preview");
  try {
    // The site admin invites the HR lead (not recorded).
    const admin = await (await browser.newContext()).newPage();
    await admin.goto(S.base + "/inbox"); await admin.fill("#pw", "admin-pass-1"); await admin.click('button:has-text("Sign in")');
    await admin.fill("#nm", "Sam Lee, Bayside Dental"); await admin.fill("#ne", "sam@bayside.com"); await admin.click("text=Create invite link"); await admin.waitForSelector(".link");

    const { p, shot, finish } = await recorder(browser, "hr-setup");
    await p.goto(S.base); await p.waitForSelector(".gbtn");
    await shot("HR signs in with their Google work account", { step: 1 });
    await p.click(".gbtn"); await p.waitForURL(/fake-google/); await p.click("text=sam@bayside.com");
    await p.waitForSelector("[data-create]");
    await p.fill("#ws-name", "Bayside Dental"); await p.check("#ws-agree");
    await shot("Name your company workspace", { step: 2 });
    await p.click("[data-create]"); await p.waitForSelector("#tabs button");
    await p.click('[data-tab="settings"]'); await p.waitForSelector("#co-name");
    await shot("Settings: company size and holidays decide which laws apply", { step: 3 });
    await p.click('[data-tab="employees"]'); await p.waitForTimeout(200);
    await shot("Employees: hire dates, hours and pay drive eligibility", { step: 4 });
    await p.click('[data-tab="access"]'); await p.waitForSelector("#us-email");
    await p.fill("#us-email", "ana@bayside.com");
    await shot("Users: invite each employee to sign in and see their own leave", { step: 5 });
    await p.click('[data-tab="overview"]'); await p.waitForTimeout(200);
    await shot("Today: every deadline you owe, soonest first", { step: 6, secs: 3 });
    await p.click('[data-tab="cases"]'); await p.click("tr[data-open]"); await p.waitForTimeout(200);
    await shot("Open a leave: the plan, the pay, and the to-do list", { step: 7, secs: 3 });
    const letter = p.locator("[data-letter]").first();
    if (await letter.count()) {
      await letter.click(); await p.waitForSelector("#lt-body");
      await shot("Leave Ledger drafts each letter. You check it and edit it", { step: 8, at: "#lt-body", secs: 3 });
      await p.click("[data-letter-send]"); await p.waitForSelector(".letter-text");
      await shot("Mark it sent. The employee can read it on their leave page", { step: 9, at: ".letter-text", secs: 3 });
    }
    finish();
  } finally { await S.close(); }
}

async function employee(browser) {
  const S = await startServer("test");
  try {
    const { p, shot, finish } = await recorder(browser, "employee");
    await p.goto(S.base); await p.fill("#lg-pw", "test-pass-123");
    await p.click('[data-pick="marcus@mesaverde.example"]'); await p.waitForSelector("#tabs button");
    await shot("Your leave page: what you have, and what happens next", { step: 1, secs: 3 });
    await p.click('[data-tab="guide"]'); await p.waitForSelector(".wiz-start");
    await shot("Guide: California leave explained in plain words", { step: 2, at: ".leavecards", secs: 3 });
    await p.click("[data-wiz-start]");
    await shot("Not sure which leave fits? Start the wizard", { step: 3 });
    await p.click('[data-wiz-need="bonding"]');
    await shot("Give a first day off and how long", { step: 4 });
    await p.click("[data-wiz-next]"); await p.waitForSelector("[data-wiz-use]");
    await shot("See your job protection and state pay before you send anything", { step: 5, secs: 3.4 });
    await p.click("[data-wiz-use]"); await p.waitForSelector('[data-form="req"]');
    await shot("The request is filled in for you. Check it and send it to HR", { step: 6, at: '[data-form="req"]', secs: 3 });
    await p.click("[data-submitreq]"); await p.waitForSelector("#toast:not([hidden])"); await p.waitForTimeout(300);
    await shot("Track where your request is", { step: 7, at: ".track" });
    await p.locator("[data-edd]").first().check(); await p.waitForSelector("#toast:not([hidden])"); await p.waitForTimeout(300);
    await shot("Step-by-step help to file with EDD, with links and dates", { step: 8, at: ".edd", secs: 3.4 });
    finish();
  } finally { await S.close(); }
}

const browser = await chromium.launch();
try { await hrSetup(browser); await employee(browser); } finally { await browser.close(); }
