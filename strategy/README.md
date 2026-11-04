# Leave Ledger · AI Product Strategy

> A living strategy built across 6 weekly sessions, using the Product School AI product strategy template. Each week adds one module. By week 6, this folder is the strategy: version-controlled and ready for a board.

**The bet:** California leave of absence management for employers with 5 to 200 employees.
**Last updated:** Nov 3, 2026 (Week 3)
**Customer interviews:** 0 of 10 (kill criteria check on Nov 23, 2026)
**Partner challenges done:** 0 of 6

---

## Strategy at a Glance

| Component | Module | Week of | Status | Key Artifact |
|-----------|--------|---------|--------|-------------|
| **The Bet** | M1 | Oct 21 | [x] Draft, needs partner challenge | `01-the-bet/` |
| **The Moat** | M2 | Oct 28 | [x] Draft, needs partner challenge | `02-the-moat/` |
| **The Margin** | M3 | Nov 4 | [x] Draft, needs partner challenge | `03-the-margin/` |
| **The Contract** | M4 | Nov 11 | [ ] | `04-the-contract/` |
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
- **Break-even at:** Running costs about $40 a month (Netlify Pro, Resend Pro). 1 paying 20-employee company, or 10 paying 5-employee companies, covers them. One-time lawyer review (no quote yet) and trademark clearance come on top: each $1,000 is about 21 company-months at 20 employees. Draft, for partner challenge.

→ Details: [`03-the-margin/`](03-the-margin/)

---

## The Contract (M4) · Week of Nov 11

**Why users will trust a probabilistic system.**

- **Reliability Target:**
- **Golden Dataset:** __ rows, __ adversarial
- **Confidence UX:** [approach]
- **HITL Architecture:**
- **Failure Mode Coverage:**

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

## Open decisions (Week 3)

1. **Tilt's $2.50 price.** Tilt now lists Essentials at $2.50 per employee per month (plus $0.60 for Gusto and Rippling sync), below our $3. Keep $3 and sell the notice clock and setup in minutes, or change the price? Either way, ask each interviewee what they would pay with Tilt's list price in front of them.
2. **Kill criterion 2 price.** Criterion 2 still asks whether 2 of 10 would pay at least $4 per employee per month, set when Tilt's lowest tier looked like $4. Our price is now $3 and Tilt's is $2.50. Change the bar to $3 (our price), keep $4, or something else?
3. **Small companies: billing and support.** At 5 employees and 15 minutes of support a month, gross margin is about 14% (18 minutes and the company costs money). Make annual prepay by bank transfer the default and support email-only below 10 employees, set a monthly minimum, or leave it until design partners show real support time?
4. **Clerk's first numbers.** Week 2's "turn on Clerk" is done, but no score is recorded yet. Add the golden set result (inbox, Clerk test run: % right on leave type, out of 50 cases) and HR Settings' requests and AI cost this month to `02-the-moat/kill-switch.md`, or paste them in this answer. They replace this week's token estimate and set the Week 4 baseline.

## Changelog

| Week | Date | What changed |
|------|------|-------------|
| 1 | Oct 26, 2026 | M1 drafted: market sizing, three-axis diagnostic, prototype bet, kill criteria |
| 1 | Oct 27, 2026 | Copilot archetype confirmed; interview and partner challenge counters added for the progress page |
| 1 | Oct 27, 2026 | Clerk intake built (Claude Haiku 5.5): own-words requests fill the form, corrections logged, 20-case golden set added |
| 2 | Oct 28, 2026 | M2 drafted: flywheel 6/20, competitive map, encroachment threats (Gusto, Tilt, CalChamber), 90-day attack and defense, kill switch audit (portability Partial). Schedule moved to Wednesday sessions |
| 3 | Nov 3, 2026 | M3 drafted: cost model (Clerk about $0.0003 an intake, gross margin about 76% at 20 employees, 14% at 5), no-model-first cascade, pricing on the Nov 2 decisions, stress tests incl. Tilt at $2.50, break-even. M1 and M2 summaries note the Nov 2 decisions and Tilt's new price |
