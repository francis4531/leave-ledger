# Compounding System Design

> Week 5 · Nov 17, 2026 · Draft, for partner challenge. Builds on: Copilot archetype delivered as Clerk, with the rules engine alone deciding eligibility and a human signing off on every notice (Week 1, decided Oct 26); Gusto as partner and first payroll connection (Week 2); vendor portability Partial, second provider when employee answers or notice drafting ship (Week 2); live accuracy bar set only after the first 50 real intakes, jury duty and voting as simple HR-handled categories in the rules engine, Spanish grown to 10 golden rows, intake records kept four years (Week 4, all decided Nov 11).

**The short answer:** Leave Ledger's guardrails are mostly built into the code already: Clerk only drafts, its output is checked field by field, managers never receive a leave reason, and tests stop a bad deploy. Two things are weaker than they look. First, the loops that are meant to compound (user fixes becoming test rows, decisions becoming code) are wired but idle or leaking: 0 real intakes so far, and 2 of the 4 Week 4 decisions are not built yet. Second, the most powerful AI in this project is not Clerk. It is the AI coding sessions that wrote 35 of the last 50 commits and deploy straight to the live site whenever tests pass. The governance posture below puts the tightest rules on that, not on Clerk.

**Where AI runs today (from the code):**

| AI job | What it sees | What it can change | Code |
|---|---|---|---|
| Clerk intake | One message from an employee or manager (up to 1,200 characters) | Nothing. It returns a draft the user checks and sends | `netlify/lib/intake.mjs` |
| Clerk column matching (HR only, roster import) | Column headings, data type and how full each column is. Never names, emails or values | Nothing. It suggests a column map HR confirms | `netlify/lib/rostermap.mjs` |
| AI coding sessions (Claude) | The whole repository | Any file. Netlify deploys every push to main once tests pass | 35 of the last 50 commits |
| Weekly strategy task (this draft) | The repository | Files under `strategy/` only, never `decisions.md` (Francis's rule, Oct 29) | Scheduled task |

Both Clerk jobs use the same model (Claude Haiku 5.5, set by `LL_MODEL`), the same daily limits (15 requests per user and 30 per workspace a day on the preview site, 400 site-wide), and fall back to the manual form on any error or after 8 seconds.

## Feedback Loops

"Compounds" means each turn of the loop makes the next one better without extra work from Francis. Status is from the code and the repo history, Nov 17.

| Loop | Input | Output | Compounds? | Status |
|------|-------|--------|-----------|--------|
| 1. Correction (M2's strongest loop) | Fields the user changes in Clerk's draft before sending (logged per intake with Clerk's confidence) | Missed phrasings become golden set rows; prompt changes must pass the set | Y | **Idle.** Logging is built; 0 real intakes; no weekly review routine yet. First 50 real intakes set the live bar (decided Nov 11) |
| 2. Golden set gate | Every model or prompt change | Change ships only at 90% or more on leave type (100% of 50 on Nov 3) | Y | **Partial.** Run by hand from the admin inbox. The deploy tests (181 automated tests and 85 rule cases, M4) do not call Clerk, so a prompt edit can deploy without a golden set run |
| 3. Confidence calibration | Fix rate by confidence label | Proof that "high" means fewer fixes, or a switch to orange on every field | Y | **Missing.** The data is logged; the report is not built (M4) |
| 4. Rules engine hardening | Role-play testing, partner and lawyer review | New rule cases and tests that run on every deploy | Y | **Active.** Nov 17 role-play round added 9 tests and fixed eligibility and privacy gaps. Lawyer review not started |
| 5. Red-team from the sandbox | Odd or hostile messages typed into the public sandbox (flagged ⚑ when they try to instruct Clerk) | New adversarial golden set rows | Y | **Missing.** Flags are logged; nobody turns them into rows |
| 6. Decision to code | Francis's answers on /strategy | Code changes and the next week's draft | N (only as fast as someone builds) | **Leaking.** Week 4: decision 1 (wait for 50 intakes) and 3 (Spanish rows) need data, but decisions 2 (jury duty and voting categories) and 4 (four-year intake records) were decided Nov 11 and are not built; the intake log still keeps the last 300 entries |
| 7. Customer evidence | Interviews, feedback form, survey answers | Kill criteria check, pricing, roadmap | Y | **Broken until interviews land.** 0 of 10 interviews recorded, kill criteria check on Nov 23 (6 days) |

**Broken loop identified by partner:** Partner challenge not done yet (0 of 6). Self-identified for the session: loop 6. It looks like a loop on the /strategy page, but answers stop at `decisions.md`. Nothing turns a "Decided" answer that needs a code change into work, so the strategy can claim a guardrail (four-year records) that the product does not have. Second candidate: loop 2, because the one thing that protects Clerk's quality is a manual button.

**Fix plan (draft, for partner challenge):**
1. Every "Decided" answer that needs code gets a line in `strategy/product-decisions.md` with "built" or "owed", and the weekly draft reports owed items first. Cost: none.
2. Build the two owed Week 4 items before any design partner goes live (code change, not made by this task; see the note to Francis).
3. Make a golden set run part of any change to `intake.mjs` or `rostermap.mjs`: the commit message records the score, or the deploy check fails if the prompt text changed without a new score on file. About one cent a run (M3).
4. Start the weekly 20-minute intake review the week the first design partner sends a real intake: read every fixed or flagged intake, add the misses as golden set rows.

## Context Connectivity
<!-- How does knowledge flow across teams and domains? Where does it silo? -->

Leave Ledger is one person plus AI sessions, so "teams" here means places where knowledge lives.

**Flows well:**
- Strategy to code: `strategy/` sits in the same repo as the code, so every coding session and this weekly task can read the decisions.
- Rules to every screen: one shared rules file (`public/engine.mjs`) drives HR, employee and manager views, letters and tests, so a rule fixed once is fixed everywhere.
- Clerk's draft to HR: HR sees the employee's own words, Clerk's reading and what the user changed side by side on the case.

**Silos:**
- **Real intakes stay inside each workspace.** Fixes are logged per workspace in Netlify Blobs; nothing copies them, de-identified, into the golden set. That is right for privacy (managers never see reasons, and design partner data is the company's), but it means loop 1 depends on a person reading and rewriting each miss.
- **Interview notes are nowhere.** No interview finding is in the repo, so the strategy cannot fold any in. Kill criteria 1 and 2 depend on them.
- **AI coding sessions start from scratch.** Each session reads the code but not why a guardrail exists. The comments in `handler.mjs` and `notices.mjs` that cite Civil Code 56.20 and Gov. Code 12945.6 and 12945.7 are the only record. Fix: a short `GUARDRAILS.md` at the repo root listing the protected rules (below) that every session reads first. That file sits outside `strategy/`, so Francis adds it.

## Governance Policy

**Scope:** every AI job in the table above: Clerk intake, Clerk column matching, AI coding sessions, and scheduled tasks that write to the repo. Also any future Clerk job (plain-language answers for employees, notice drafting), which starts under this policy before it ships.

**Autonomy boundaries:**
- **Clerk may:** read the one message or the column headings it is given; return a draft in the fixed JSON shape; mark its own confidence; flag a message that tries to instruct it.
- **Clerk may not, and the code enforces it:** decide eligibility, approve leave, promise pay, write or send a notice, see any other employee's data, see employee values during roster import, or return anything outside the allowed fields (`validate()` drops it). Users press send, not Clerk.
- **Protected rules (no session changes these without Francis reading the diff):** what each role can see (`capsFor` and `viewFor` in `handler.mjs`), the words filtered out of HR's note to a manager (`SENSITIVE` in `notices.mjs`), Clerk's output checks (`validate` in `intake.mjs`, `validateMap` in `rostermap.mjs`), the real-data switch (`LL_AI_REAL_DATA_OK`), and the eligibility rules in `engine.mjs`. Today any AI coding session can change them and deploy if tests pass. Proposed: changes to these files go through a pull request Francis approves (decision 2). The repo setting for that is outside `strategy/`.
- **Never build (proposed, decision 3):** no feature that scores, ranks or predicts employees by leave use or absence, and no export of leave data into discipline or performance decisions. California's SB 947 (below) bars using an automated system to predict or punish workers for exercising legal rights, and taking protected leave is one.

**Escalation triggers:**
- A summary or manager notice that shows a leave reason or diagnosis: Clerk off for that workspace the same day, root cause before it is turned back on.
- Golden set under 90% on leave type, or any privacy or adversarial row failing: the change does not ship (M4).
- Live fix rate: lines set once the first 50 real intakes are in (decided Nov 11).
- AI provider errors on more than 1 in 50 requests in a day, or a provider change to model, price or data terms: re-run the golden set, check terms, tell design partners if their data handling changes.
- A new Clerk job (employee answers or notice drafting): second AI provider wired in and scored first (Week 2 decision), new golden set rows for that job, this policy updated.
- A real-data workspace about to go live: the design partner checklist in `product-decisions.md` is complete (4 of 9 items done today).

**Audit cadence:**
- Weekly, once real intakes exist: 20-minute review of fixed and flagged intakes (loop 1).
- Monthly: golden set run on the live model, drift check (4 points or less), review of who has access to workspaces and the admin inbox.
- Quarterly: check the GitHub token the site uses to write `decisions.md` is limited to this repo, rotate secrets (`LL_SECRET`, API keys), re-read the AI provider's data terms.
- Before design partners, then yearly: lawyer review of rules, letters, the city sick leave table and this policy.

**Regulatory exposure (EU AI Act / other):** California rules matter, the EU does not yet. Draft, for the lawyer review; not legal advice.

| Rule | In force | What it asks | Leave Ledger exposure |
|---|---|---|---|
| Civil Rights Council rules on automated-decision systems in employment (FEHA) | Oct 1, 2025 | Employers keep ADS-related records four years; an employer's agent can share liability ([Jackson Lewis](https://www.jacksonlewis.com/insights/californias-new-ai-regulations-take-effect-oct-1-heres-your-compliance-checklist), [Littler](https://www.littler.com/news-analysis/asap/californias-automated-decisionmaking-technology-regulations-seven-steps)) | **Medium.** Whether intake or the rules engine "assists in" an employment decision is for the lawyer. Four-year intake records decided Nov 11, **not built yet** |
| CPPA rules on automated decision-making technology (CCPA) | Jan 1, 2027 | For "significant decisions" (hiring, allocation of work, compensation, promotion, demotion, suspension, termination): pre-use notice, opt-out or a human appeal, risk assessment before first use, reviewed every 3 years ([Littler](https://www.littler.com/news-analysis/asap/californias-automated-decisionmaking-technology-regulations-seven-steps)) | **Low for customers:** applies to businesses over the CCPA line, $26,625,000 in annual revenue since Jan 1, 2025 ([CPPA](https://www.cppa.ca.gov/regulations/cpi_adjustment.html)), which most 5 to 49 employee employers are not. Leave decisions are not on the list, and a human decides at every step. Larger customers (up to 200 employees) may ask for help with their risk assessment |
| SB 947, "No Robo Bosses Act" | Signed Sept 30, 2026; in force July 1, 2027 | Employers may not rely solely on an automated system to discipline or fire; human review and written notice when they primarily rely on one; no predicting or acting against workers for exercising legal rights ([SHRM](https://www.shrm.org/topics-tools/employment-law-compliance/newsom-signs-revamped-no-robo-bosses-act-into-law)). The earlier SB 7 was vetoed in Oct 2025 | **Low if the never-build line holds.** Leave Ledger does not touch discipline. A future "absence pattern" or attendance feature would walk straight into it |
| Confidentiality of medical information (Civil Code 56.20) and of bereavement and reproductive loss leave (Gov. Code 12945.6, 12945.7) | In force | Employers keep medical information and these leave reasons confidential | **Medium, and the core of the product.** Managers get dates only, enforced on the server; HR's note to a manager is checked against a word list (widened Nov 17). Clerk's summaries are told not to repeat diagnoses, checked by 6 golden rows and a word list (M4 gap) |
| Data breach notice (Civil Code 1798.82) | In force | Notify affected people of a breach of personal information | **Medium once real data lands.** Breach plan is an open checklist item |
| Federal executive order "Ensuring a National Policy Framework for Artificial Intelligence" | Dec 2025 | An AI Litigation Task Force to challenge state AI laws; Commerce to list "onerous" state laws ([The Regulatory Review](https://www.theregreview.org/2026/02/26/champagne-president-trump-targets-state-based-ai-regulations/)) | **Plan as if every California rule applies.** No California rule above was reported blocked as of the sources found; leave laws themselves are not AI laws |
| EU AI Act | n/a | Treats AI used in employment decisions as high risk | **None today** (California only, product decision 13). Revisit only if Leave Ledger ever sells outside the US |

**AI provider terms (the one vendor Clerk depends on):** Anthropic's API documentation says conversation content is "not retained by default," except for certain larger model families that require 30-day retention, and that retained data "is never used for model training without your express permission." Zero data retention is available on request ([Anthropic, API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). Haiku 5.5 is not one of the 30-day families named there. Matches product decision 4 (an AI agreement that does not keep or train on the data). To do before design partners: save a dated copy of the terms with the checklist, and ask about zero data retention in writing.

## Agent Topology
<!-- If using agents: what can each agent do? What can't it do? Who approves what? -->

| Agent | Can do | Cannot do | Who approves |
|---|---|---|---|
| Clerk intake | Draft one leave request from one message | Decide, approve, send, see other employees, call tools, keep memory between requests | The user who presses send, then HR on every leave and notice |
| Clerk column matching | Suggest which file column is which field | See any employee value; write employees | HR confirms the map before import |
| Rules engine (not AI) | Decide eligibility, pay estimates, deadlines | Change itself; it is code with 85 rule cases | Tests on every deploy; lawyer review (not started) |
| AI coding sessions | Change any file, push to main, trigger a deploy | Set Netlify secrets or turn on real-data AI (`LL_AI_REAL_DATA_OK`) | Today: the tests. Proposed: Francis approves changes to protected rules (decision 2) |
| Weekly strategy task | Write files under `strategy/` and push | Touch code, config or `decisions.md` | Francis reads the push summary; signs off modules on /strategy |
| /strategy page sync | Write `strategy/decisions.md` with a GitHub token | Write anything else, if the token is scoped to this repo's contents (unchecked) | Only the site admin can record decisions on the preview site. On the test-mode site any HR test account can, and the weekly task treats those answers as Francis's: keep the site in preview mode |

**One chain to watch:** answers typed on /strategy become `decisions.md`, which the weekly task reads as Francis's decisions and builds on, and pushes. The commit rule keeps that chain inside `strategy/`, so the worst case is a wrong strategy draft, not wrong code. The risk is higher with AI coding sessions, which also read `strategy/` and can change code.

## Shadow AI Audit

"Shadow AI" is AI in use that nobody decided to govern. For a one-person venture there are two kinds: AI tools touching Leave Ledger's code or data, and AI that customers' staff already use for leave questions (the M1 "ChatGPT" attacker).

| Tool | Owner | Risk Level | Decision |
|------|-------|-----------|----------|
| Anthropic API (Clerk intake and column matching) | Francis | M | keep, governed by this policy and the golden set |
| AI coding sessions with push access to main | Francis | H | govern: protected-rules review (decision 2), `GUARDRAILS.md` |
| Weekly strategy task | Francis | L | keep, scoped to `strategy/` |
| GitHub token on Netlify for `decisions.md` | Francis | M | govern: confirm it is limited to this repo and to file contents |
| Google Drive connected to Francis's Claude account | Francis | L | keep; rule: no real employee data in Drive files or AI chats, only inside a design partner workspace |
| General chatbots used by customers' office managers and employees for leave questions | Customer | H (for the customer) | not ours to kill; it is the product's case: Clerk is the governed option, with no training on the data and a human sign-off. Ask about it in every interview |

**Total tools found:** 6
**Tools after triage:** 6 kept or governed (3 keep, 3 govern), 0 killed. 1 of the 6 is on the customer side.
**Estimated hidden spend:** Clerk's API cost is near zero (HR Settings; about $0.0003 an intake, M3). The AI coding sessions and this scheduled task run on Francis's Claude plan, which is **not counted** in M3's $40 a month running costs. Add the actual plan price to M3 before the pitch; it may be the largest AI line in the budget.

## Red-team questions for Wednesday (draft, for partner challenge)

1. Would an office manager trust that "managers never see the reason" if they knew most of the code was written by AI and deploys on its own? What proof would they want?
2. Is a pull request rule for a handful of files real protection for a solo founder, or friction that gets skipped?
3. Is "never score employees by leave use" a selling point for owners, or a feature some will ask for?
4. Which of the regulations above would a 20-person owner actually ask about, if any?
