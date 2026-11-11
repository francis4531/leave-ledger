# Leave Ledger · AI Product Strategy

> A living strategy built across 6 weekly sessions, using the Product School AI product strategy template. Each week adds one module. By week 6, this folder is the strategy: version-controlled and ready for a board.

**The bet:** California leave of absence management for employers with 5 to 200 employees.
**Last updated:** Nov 10, 2026 (Week 4)
**Customer interviews:** 0 of 10 (kill criteria check on Nov 23, 2026)
**Partner challenges done:** 0 of 6

---

## Strategy at a Glance

| Component | Module | Week of | Status | Key Artifact |
|-----------|--------|---------|--------|-------------|
| **The Bet** | M1 | Oct 21 | [x] Draft, needs partner challenge | `01-the-bet/` |
| **The Moat** | M2 | Oct 28 | [x] Draft, needs partner challenge | `02-the-moat/` |
| **The Margin** | M3 | Nov 4 | [x] Draft, needs partner challenge | `03-the-margin/` |
| **The Contract** | M4 | Nov 11 | [x] Draft, needs partner challenge | `04-the-contract/` |
| **The Guardrails** | M5 | Nov 18 | [ ] | `05-the-guardrails/` |
| **The Pitch** | M6 | Nov 25 | [ ] | `06-the-pitch/` |

---

## The Bet (M1)

**What we're building, for whom, why now.**

- **Product:** Leave Ledger. Works out which California and federal leaves an employee qualifies for, what the state pays, and the notices and deadlines the employer owes. Separate views for HR, employee and manager.
- **AI Value Archetype:** Copilot (confirmed Oct 26). AI handles intake, plain-language answers and notice drafts; a deterministic rules engine decides eligibility; a human signs off on every notice.
- **Vulnerability Scores:** Moat 2/5 · Data 1/5 · Platform 4/5 (exposed)
- **Top Risk:** Distribution. Small businesses buy HR through their payroll provider. If Gusto or Rippling ships California leave first, a standalone tool has no way in.
- **Confidence:** L (until 10 customer interviews)
- **Prototype:** Netlify test site, 10 test accounts (link in `01-the-bet/prototype.md`)
- **Kill criterion 4 (Clerk 90% on leave type):** Passed on Nov 3, 100% of 50 cases, on a test set we wrote ourselves. Real phrasings still owed (see M4).
- **Kill Criteria:** Under 3 of 10 interviewees feel the pain, or under 2 of 10 would pay $2 per employee per month (our price), by Nov 23; or a payroll platform ships California leave stacking before we have 5 paying employers.
- **Changed by Nov 2 product decisions:** first segment narrowed to 5 to 49 employees (state leaves only, no FMLA), owner is the buyer, price set at $3 per employee per month (free for 1 to 4), lowered to $2 on Nov 4. Kill criterion 2 follows the price we will charge: $4, then $3 (Nov 3), now $2 (Nov 4).

→ Details: [`01-the-bet/`](01-the-bet/)

---

## The Moat (M2) · Week of Oct 28

**Why this won't get copied in 6 months.**

- **Data Flywheel Score:** 6/20 (Correction 2 · Preference 1 · Domain Context 2 · Network 1)
- **Weakest Loop:** Network. Gusto, Tilt and Paylocity see far more leaves than we will for years. Fix: don't compete there; build Correction (weekly golden-set review of Clerk fixes) and Preference (company policy profile) first; add de-identified California benchmarks only after 25+ companies, opt-in, never below 10 pooled companies.
- **Competitive Position:** Axes are California depth and fit for a 5 to 49 employee business. Leave Ledger targets high on both. Paylocity+Aidora and Mitratech are deep but enterprise; Gusto fits small business but is shallow on California leave; Tilt is closest (AI phone intake, Gusto and Rippling integrations, $4 to $6 per employee per month).
- **Encroachment Defense:** Join Gusto rather than fight it (app directory listing with two-way sync); own the dispute-ready record (notice clock, signed notices, 12-month history); publish rules-engine tests and Clerk accuracy score; sell through bookkeepers, PEOs and employment lawyers.
- **Decided Oct 30 and Nov 2:** Gusto is a partner and the first payroll connection; price and the notice clock are the claimed edge over Tilt. Tilt now lists $2.50 per employee per month (Nov 2026), so the price edge needs re-testing (see M3).
- **Vendor Portability:** Partial. Clerk uses only Anthropic's Claude, and the code calling it is written for Anthropic alone. If Anthropic raised prices or went down, the rest of the product (eligibility, deadlines, notices) keeps working, but intake would fall back to the manual form. Fix, about 2 days of work: make that one piece of code able to call a second AI provider, then check the second provider gets the 20 test requests right before relying on it.

→ Details: [`02-the-moat/`](02-the-moat/)

---

## The Margin (M3) · Week of Nov 4

**Will this make money or bleed it?**

- **Gross Margin (current):** At $2 per employee per month (Nov 4): about 66% for a 20-employee company ($40), 84% at 49 employees, and **negative (about −27%) at 5 employees** with 15 minutes of support a month. A 5-employee company covers about 11 minutes of support before it costs money. Estimates; support time ($40 an hour, assumed) is the biggest cost, then card fees. At $3 these were 76%, 88% and 14%.
- **Gross Margin (AI-adjusted):** The same. One Clerk intake costs about $0.0003 (Haiku 5.5 at $0.10 / $0.50 per million tokens, about 1,650 in and 250 out), so a month of Clerk for 20 employees is under one cent. AI moves margin by 0.01 points. Upside if Clerk cuts support by 5 minutes a company a month: about 81%.
- **Pricing Model:** Seat-based, $2 per employee per month (lowered from $3 on Nov 4), free for 1 to 4. Clerk included, not metered. Below Tilt ($2.50, or $3.10 with integrations). Small companies only work with self-serve support and annual prepay; consider a monthly minimum.
- **Cascading Strategy:** Rules engine and template letters first (free, no model); Haiku 5.5 only for free text; when unsure, ask HR rather than a bigger model. Sonnet 5.5 is the fallback only if Haiku fails the 90% leave type bar, and would still cost $0.12 a month per company.
- **Decided Nov 3 and 4:** price $2 per employee per month (below Tilt's $2.50) and kill criterion 2 moved to $2; annual prepay by bank transfer is the default for small companies, automated card prepay later once customers trust us.
- **Break-even at:** Running costs about $40 a month (Netlify Pro, Resend Pro). 1 paying 20-employee company, or 10 paying 5-employee companies, covers them. One-time lawyer review (no quote yet) and trademark clearance come on top: each $1,000 is about 21 company-months at 20 employees. Draft, for partner challenge.

→ Details: [`03-the-margin/`](03-the-margin/)

---

## The Contract (M4) · Week of Nov 11

**Why users will trust a probabilistic system.**

- **Reliability Target:** Golden set 90% or more on leave type before any model or prompt change ships (today 100% of 50, Nov 3). Live, proposed: the user changes Clerk's leave type in fewer than 1 in 10 sent intakes. p95 reply 5 seconds or less (average 2.3 seconds; p95 not measured yet), cut-off at 8 seconds then the manual form. 0 summaries that repeat a diagnosis.
- **Golden Dataset:** 50 rows, 10 adversarial. All exact-rule checks, no AI judge. Gaps: 0 real phrasings, 4 sick-time rows for the most common request, 4 Spanish rows, 0 manager notes, one fixed "today". Target 80 rows, 15 or more from real people, before design partners.
- **Confidence UX:** Per-field human-in-loop trigger. High: filled in. Medium or low: filled in and marked orange with "please check". Leave type unclear: nothing filled, user picks. The labels are Clerk's own and unproven; check them against what users fix (high-confidence fields changed under 5%) once there are about 50 real intakes.
- **HITL Architecture:** Four checkpoints, Clerk only in the first: the user checks the draft and presses send; the rules engine decides eligibility (no AI); HR approves every leave and signs every notice; the employee confirms receipt. Unclear or suspicious messages still become a case for HR, because the notice clock does not wait.
- **Failure Mode Coverage:** 10 adversarial rows (hijack attempts, prying for other employees' reasons, diagnoses, nonsense) all handled. Not covered: legal time off with no category (jury duty, voting show as "not sure"), unproven confidence labels, a privacy check limited to a word list, p95 latency. Self red-team only; partner challenge not done.

→ Details: [`04-the-contract/`](04-the-contract/)

---

## The Guardrails (M5) · Week of Nov 18

**What breaks when this scales, and what compounds.**

- **Compounding System:** [describe feedback loops]
- **Governance Posture:** [approach]
- **Shadow AI Status:** __ tools found, __ triaged
- **Agent Boundaries:**
- **Regulatory Exposure:**

→ Details: [`05-the-guardrails/`](05-the-guardrails/)

---

## The Pitch (M6) · Week of Nov 25

**How you get this funded, shipped, and adopted.**

- **Horizon 1 (Now):**
- **Horizon 2 (Next):**
- **Horizon 3 (Bet):**
- **Board Narrative:** [1-sentence thesis]
- **Key Metric:**

→ Details: [`06-the-pitch/`](06-the-pitch/)

---

## Open decisions (Week 4)

1. **Live accuracy bar.** Clerk passed the golden set (100% of 50), but real use is the true test. Proposed: if users change Clerk's leave type in 3 of a design partner's last 20 intakes, review them that week; at 5 of 20, that workspace goes to "suggest only" (Clerk shows its reading but does not fill the form). Accept these lines, set different ones, or wait for the first 50 real intakes?
2. **Jury duty, voting and other legal time off.** California protects time off for jury duty and gives up to 2 paid hours to vote, but Clerk and the rules engine have no category for them, so users see "I could not tell what kind of time off this is." Add them as simple categories HR handles (no eligibility math), build them into the rules engine, or keep them out of scope for the 5 to 49 pilot?
3. **Languages Clerk promises.** The form says "English or Spanish is fine" and the golden set has 4 Spanish rows and 1 Tagalog. Grow Spanish to 10 rows before design partners and keep the promise at English and Spanish, add other common California languages (Chinese, Vietnamese, Tagalog, Korean), or drop the Spanish line until it is tested?
4. **Four-year records.** California's rules on automated-decision systems in employment (in force since Oct 1, 2025) ask employers to keep related records for four years. Leave Ledger keeps the last 300 intakes per workspace. Keep intake records for four years now (a code change), or wait for the lawyer review to say whether Clerk and the rules engine count?

## Changelog

| Week | Date | What changed |
|------|------|-------------|
| 1 | Oct 26, 2026 | M1 drafted: market sizing, three-axis diagnostic, prototype bet, kill criteria |
| 1 | Oct 27, 2026 | Copilot archetype confirmed; interview and partner challenge counters added for the progress page |
| 1 | Oct 27, 2026 | Clerk intake built (Claude Haiku 5.5): own-words requests fill the form, corrections logged, 20-case golden set added |
| 2 | Oct 28, 2026 | M2 drafted: flywheel 6/20, competitive map, encroachment threats (Gusto, Tilt, CalChamber), 90-day attack and defense, kill switch audit (portability Partial). Schedule moved to Wednesday sessions |
| 3 | Nov 3, 2026 | M3 drafted: cost model (Clerk about $0.0003 an intake, gross margin about 76% at 20 employees, 14% at 5), no-model-first cascade, pricing on the Nov 2 decisions, stress tests incl. Tilt at $2.50, break-even. M1 and M2 summaries note the Nov 2 decisions and Tilt's new price |
| 4 | Nov 10, 2026 | M4 drafted: golden set audit (50 rows, 10 adversarial, gaps), per-field confidence UX and calibration check, reliability contract with alert lines, four-checkpoint HITL design, self red-team. M1 notes kill criterion 4 passed on our own set; M3 notes the Nov 3 and 4 price and prepay decisions |
