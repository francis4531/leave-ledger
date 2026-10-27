# Three-Axis Vulnerability Diagnostic

> Week 1 · Oct 26, 2026 · Draft for partner challenge

## Product

**Product:** Leave Ledger. California leave of absence management for employers with 5 to 200 employees. It works out which state and federal leaves an employee qualifies for, what the state pays, and the notices and deadlines the employer owes, then gives HR, the employee and the manager each their own view.
**Your Role:** Founder and product lead (solo build, test site on Netlify with 10 test accounts).

**Scoring convention used here:** Contextual Moat and Data Advantage, 5 = strongest position. Platform Exposure, 5 = most exposed.

---

## The market in numbers

| Segment | California businesses | Why it matters |
|---|---|---|
| 5 to 49 employees | 328,201 | Owe CFRA, PDL, bereavement and reproductive loss leave, but not federal FMLA. Most leave tools are built around FMLA. |
| 50 to 249 employees | 48,240 | Owe all of the above plus FMLA. Where mid-market vendors start. |
| **5 to 249 total** | **376,441** | Rough employee base: about 9.8M (midpoint estimate per size band) |

Source: EDD size-of-business table, third quarter (statewide row). The employee figure multiplies each band's count by its midpoint, so treat it as an order of magnitude, not a fact.

**Price anchor:** Tilt lists $4 to $6 per employee per month (G2, Dec 2025). At that price, 9.8M employees is a $470M to $700M a year ceiling. Real reachable revenue is a small fraction of that; M3 works the actual number.

---

## Scores

### Contextual Moat · 2/5
*Workflow depth × switching cost. Would users leave in a weekend if a competitor showed up?*

**Score rationale:** The workflow is real: a deadline clock that starts when a manager hears about a leave, stacked entitlements (PDL then CFRA bonding, with SDI and PFL pay), notices, and three role views with server-side privacy. But today Leave Ledger holds no history and no documents, and it does not touch payroll. A user could move in a weekend. Switching cost appears once it holds the 12-month rolling CFRA history, signed notices and certifications for every employee, because that record is what an employer needs in a dispute.

**Named attacker (draft, for partner challenge):** **Tilt** (formerly Sparrow). $4 to $6 per employee per month, two-way Gusto sync, all leave types nationwide. If Tilt adds a small-business tier, it arrives with payroll integration on day one, which Leave Ledger lacks.

---

### Data Advantage · 1/5
*Proprietary signal that compounds with usage. What do you see that OpenAI doesn't?*

**Score rationale:** No users yet, so no data. The rules engine encodes public law that anyone can read. The signal that could compound:
1. How employees and managers actually describe a need for time off ("my mom's surgery is next month"), mapped to the leave type HR confirmed. This trains intake.
2. Outcomes per California leave pattern: real durations by reason, how often PDL runs into bonding, how often certifications come back late.
3. California edge cases HR had to override, which become rules or tests.

None of this exists until roughly 50 active employers are using it.

**Named attacker (draft, for partner challenge):** **ChatGPT and other general assistants.** An office manager can already ask "my employee is pregnant, what leave do they get in California?" and get a decent answer for free. What the assistant lacks is the employee's hours, tenure, prior leave and the deadline clock. That is the gap to own.

---

### Platform Exposure · 4/5
*Encroachment risk × pivot speed. If Apple/Google/OpenAI ships your hero feature native, then what?*

**Score rationale:** For this product, the platforms are the payroll and HR systems small businesses already pay for. Encroachment is already happening, one tier up:
- **Paylocity** acquired Aidora, an AI-native leave management company, on July 9, 2026. Aimed at mid-market and enterprise.
- **Mitratech** launched Mitratech Leave, AI-native leave compliance, at SHRM26 in June 2026. Aimed at mid-sized and multi-state employers.
- **Gusto, Rippling and Justworks** are where California small businesses run payroll. Any of them can bundle leave tracking at no extra price.

Pivot speed is the one strength: the codebase is small and could become an add-on inside a payroll marketplace within weeks.

**Named attacker (draft, for partner challenge):** **Gusto.** It already holds the hours, hire dates and pay that eligibility depends on. A California leave module bundled into its plans would remove the reason to buy a separate tool.

---

## Top Vulnerability

Distribution. Small businesses buy HR software through their payroll provider. If Gusto or Rippling ships California-specific leave (CFRA and PDL stacking plus a notice clock) before Leave Ledger has paying users, a standalone product has no way in.

## Confidence Level

**L (low).** The product logic is sound and the gap for 5 to 49 employee employers is real on paper, but nobody outside this build has used it or said they would pay. Moves to M after 10 interviews with California office managers or HR generalists.
