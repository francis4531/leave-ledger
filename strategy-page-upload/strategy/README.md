# Leave Ledger · AI Product Strategy

> A living strategy built across 6 weekly sessions, using the Product School AI product strategy template. Each week adds one module. By week 6, this folder is the strategy: version-controlled and ready for a board.

**The bet:** California leave of absence management for employers with 5 to 200 employees.
**Last updated:** Oct 27, 2026 (Week 1)
**Customer interviews:** 0 of 10 (kill criteria check on Nov 23, 2026)
**Partner challenges done:** 0 of 6

---

## Strategy at a Glance

| Component | Module | Week of | Status | Key Artifact |
|-----------|--------|---------|--------|-------------|
| **The Bet** | M1 | Oct 26 | [x] Draft, needs partner challenge | `01-the-bet/` |
| **The Moat** | M2 | Nov 2 | [ ] | `02-the-moat/` |
| **The Margin** | M3 | Nov 9 | [ ] | `03-the-margin/` |
| **The Contract** | M4 | Nov 16 | [ ] | `04-the-contract/` |
| **The Guardrails** | M5 | Nov 23 | [ ] | `05-the-guardrails/` |
| **The Pitch** | M6 | Nov 30 | [ ] | `06-the-pitch/` |

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

## The Moat (M2) · Week of Nov 2

**Why this won't get copied in 6 months.**

- **Data Flywheel Score:** __/20
- **Weakest Loop:**
- **Competitive Position:** [describe axes + placement]
- **Encroachment Defense:**
- **Vendor Portability:** Ready / Partial / Locked

→ Details: [`02-the-moat/`](02-the-moat/)

---

## The Margin (M3) · Week of Nov 9

**Will this make money or bleed it?**

- **Gross Margin (current):**
- **Gross Margin (AI-adjusted):**
- **Pricing Model:**
- **Cascading Strategy:**
- **Break-even at:**

→ Details: [`03-the-margin/`](03-the-margin/)

---

## The Contract (M4) · Week of Nov 16

**Why users will trust a probabilistic system.**

- **Reliability Target:**
- **Golden Dataset:** __ rows, __ adversarial
- **Confidence UX:** [approach]
- **HITL Architecture:**
- **Failure Mode Coverage:**

→ Details: [`04-the-contract/`](04-the-contract/)

---

## The Guardrails (M5) · Week of Nov 23

**What breaks when this scales, and what compounds.**

- **Compounding System:** [describe feedback loops]
- **Governance Posture:** [approach]
- **Shadow AI Status:** __ tools found, __ triaged
- **Agent Boundaries:**
- **Regulatory Exposure:**

→ Details: [`05-the-guardrails/`](05-the-guardrails/)

---

## The Pitch (M6) · Week of Nov 30

**How you get this funded, shipped, and adopted.**

- **Horizon 1 (Now):**
- **Horizon 2 (Next):**
- **Horizon 3 (Bet):**
- **Board Narrative:** [1-sentence thesis]
- **Key Metric:**

→ Details: [`06-the-pitch/`](06-the-pitch/)

---

## Open decisions (Week 1)

1. ~~Confirm the archetype.~~ Done Oct 26: Copilot, with the rules engine deciding eligibility.
2. **Partner challenge.** Test the three named attackers (Tilt, ChatGPT, Gusto) and the 1/5 data score with your course partner. Record what they push on in `01-the-bet/diagnostic.md`.
3. **Prototype link.** Add the Netlify URL to `01-the-bet/prototype.md`.
4. **Start interviews.** Kill criteria 1 and 2 need 10 conversations by Nov 23, so about 3 a week. Update the interview count at the top of this file as you go.

## Changelog

| Week | Date | What changed |
|------|------|-------------|
| 1 | Oct 26, 2026 | M1 drafted: market sizing, three-axis diagnostic, prototype bet, kill criteria |
| 1 | Oct 27, 2026 | Copilot archetype confirmed; interview and partner challenge counters added for the progress page |
