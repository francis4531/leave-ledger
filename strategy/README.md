# Leave Ledger · AI Product Strategy

> A living strategy built across 6 weekly sessions, using the Product School AI product strategy template. Each week adds one module. By week 6, this folder is the strategy: version-controlled and ready for a board.

**The bet:** California leave of absence management for employers with 5 to 200 employees.
**Last updated:** Oct 28, 2026 (Week 2)
**Customer interviews:** 0 of 10 (kill criteria check on Nov 23, 2026)
**Partner challenges done:** 0 of 6

---

## Strategy at a Glance

| Component | Module | Week of | Status | Key Artifact |
|-----------|--------|---------|--------|-------------|
| **The Bet** | M1 | Oct 21 | [x] Draft, needs partner challenge | `01-the-bet/` |
| **The Moat** | M2 | Oct 28 | [x] Draft, needs partner challenge | `02-the-moat/` |
| **The Margin** | M3 | Nov 4 | [ ] | `03-the-margin/` |
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
- **Kill Criteria:** Under 3 of 10 interviewees feel the pain, or under 2 of 10 would pay $4 per employee per month, by Nov 23; or a payroll platform ships California leave stacking before we have 5 paying employers.

→ Details: [`01-the-bet/`](01-the-bet/)

---

## The Moat (M2) · Week of Oct 28

**Why this won't get copied in 6 months.**

- **Data Flywheel Score:** 6/20 (Correction 2 · Preference 1 · Domain Context 2 · Network 1)
- **Weakest Loop:** Network. Gusto, Tilt and Paylocity see far more leaves than we will for years. Fix: don't compete there; build Correction (weekly golden-set review of Copilot fixes) and Preference (company policy profile) first; add de-identified California benchmarks only after 25+ companies, opt-in, never below 10 pooled companies.
- **Competitive Position:** Axes are California depth and fit for a 5 to 49 employee business. Leave Ledger targets high on both. Paylocity+Aidora and Mitratech are deep but enterprise; Gusto fits small business but is shallow on California leave; Tilt is closest (AI phone intake, Gusto and Rippling integrations, $4 to $6 per employee per month).
- **Encroachment Defense:** Join Gusto rather than fight it (app directory listing with two-way sync); own the dispute-ready record (notice clock, signed notices, 12-month history); publish rules-engine tests and the Copilot accuracy score; sell through bookkeepers, PEOs and employment lawyers.
- **Vendor Portability:** Partial. The Copilot uses only Anthropic's Claude, and the code calling it is written for Anthropic alone. If Anthropic raised prices or went down, the rest of the product (eligibility, deadlines, notices) keeps working, but intake would fall back to the manual form. Fix, about 2 days of work: make that one piece of code able to call a second AI provider, then check the second provider gets the 20 test requests right before relying on it.

→ Details: [`02-the-moat/`](02-the-moat/)

---

## The Margin (M3) · Week of Nov 4

**Will this make money or bleed it?**

- **Gross Margin (current):**
- **Gross Margin (AI-adjusted):**
- **Pricing Model:**
- **Cascading Strategy:**
- **Break-even at:**

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

## Open decisions (Week 2)

1. **Partner challenge on Tilt.** Is Tilt the real threat rather than Gusto? It already has AI intake (Tilley), Gusto and Rippling sync, and California coverage. If yes, what does Leave Ledger do that Tilt will not do for a 15-person company?
2. **Gusto: partner or competitor?** The defense assumes a Gusto app directory listing. Is that the distribution bet, or should the first channel be bookkeepers and PEOs?
3. **Turn on the Copilot.** Add `ANTHROPIC_API_KEY` in Netlify and run `scripts/eval-intake.mjs`. The first accuracy score goes into `02-the-moat/kill-switch.md` and feeds Week 4.
4. **Interviews.** Kill criteria check is Nov 23. Ask each interviewee what they use for payroll; if most say Gusto, that confirms decision 2.

## Changelog

| Week | Date | What changed |
|------|------|-------------|
| 1 | Oct 26, 2026 | M1 drafted: market sizing, three-axis diagnostic, prototype bet, kill criteria |
| 1 | Oct 27, 2026 | Copilot archetype confirmed; interview and partner challenge counters added for the progress page |
| 1 | Oct 27, 2026 | Copilot intake built (Claude Haiku 5.5): own-words requests fill the form, corrections logged, 20-case golden set added |
| 2 | Oct 28, 2026 | M2 drafted: flywheel 6/20, competitive map, encroachment threats (Gusto, Tilt, CalChamber), 90-day attack and defense, kill switch audit (portability Partial). Schedule moved to Wednesday sessions |
