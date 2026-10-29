# Data Flywheel Map

> Week 2 · Oct 28, 2026 · Draft for partner challenge
> Score each loop 1-5. Your weakest loop is where competitors attack first.

**Starting point:** Leave Ledger is a test build with 10 test accounts and no real customers. Clerk intake (built Oct 27) is the first part that produces data that could compound. Scores below describe what exists today, not the plan.

## Flywheel Loops

| Loop | What It Measures | Score 1 | Score 5 | Score |
|------|------------------|---------|---------|-------|
| **Correction** | Do users fix AI outputs? Is that signal captured and reused? | No capture | Automated retraining | 2/5 |
| **Preference** | Does the product learn individual / team preferences over time? | Stateless | Deep personalization | 1/5 |
| **Domain Context** | Does usage in one area improve quality in adjacent areas? | Siloed | Cross-domain transfer | 2/5 |
| **Network** | Does each new user / team make the product better for everyone? | Isolated | Strong network effects | 1/5 |

### Correction Loop · 2/5
**What you capture today:** Every Clerk intake is stored with the user's own words, what Clerk read (leave type, family member, start date, length, confidence per field) and which fields the user changed before sending. HR sees "Sent as Clerk read it" or "Changed before sending: start date". HR Settings shows the share sent without changes and the count of fixes per field.
**How it compounds:** It doesn't yet. Corrections are captured but nothing feeds them back. Step to 3/5: a weekly review that turns each fixed intake into a row in `tests/intake-golden.json`, and the most common misses into prompt examples, with the eval score tracked over time. Step to 4/5: per-company examples ("at this company, 'a few weeks' usually means 4").

### Preference Loop · 1/5
**What you capture today:** Nothing per company or per user beyond settings (headcount, holidays). The product does not know whether a company pays for bereavement, tops up state pay, or lets employees use vacation first.
**How it compounds:** A company policy profile, learned from HR's edits and set once in Settings, would change the plan and the notices for every future leave at that company. Employee language preference (Spanish) would carry into answers and notices. Each is small, but together they make switching costly: a new tool starts without them.

### Domain Context Loop · 2/5
**What you capture today:** One case feeds the next for the same employee. CFRA weeks used in the rolling 12 months reduce what is left, sick hours carry across requests, and the manager's flag becomes the HR case. The rules engine is shared across all 8 leave types, so a rule fix (for example, holidays in the deadline count) improves every leave.
**How it compounds:** Within a company, a full history makes each new decision more accurate (no double-counting of CFRA, no missed PDL time). This is the start of switching cost: a competitor would not have the 12-month record that a dispute depends on.

### Network Loop · 1/5
**What you capture today:** Nothing. Each company is isolated, which is correct for health-related data.
**How it compounds:** Only through de-identified, aggregated benchmarks shown to HR: typical length by leave type, how often certifications come back late, how often PDL runs into bonding. Two limits: it needs enough companies to be meaningful and safe (for example, no figure shown unless it pools at least 10 companies), and leave reasons are sensitive health information, so it must be opt-in and never expose an individual. A second network effect is a shared library of California edge cases (rules HR had to override), which helps every customer and holds no personal data.

**Total Flywheel Score: 6/20**
**Weakest Loop:** Network and Preference (1/5 each). Network is the one a competitor with scale attacks first: Tilt, Gusto or Paylocity see far more leaves than Leave Ledger will for years.
**Fix for weakest loop:** Do not try to win on network effects. Invest in Correction and Preference, which work with a single customer, and build the de-identified California benchmark only after 25 or more active companies. The near-term fix is the Correction loop (weekly golden-set review), because it costs nothing and its score is already measured.

---

## Competitive Position

Two axes that matter to a 5 to 49 employee California employer:

- **California depth** (horizontal): from generic multi-state leave tracking to full California stacking (PDL then CFRA bonding, SDI and PFL pay, bereavement, reproductive loss, notice clock).
- **Fit for a small business** (vertical): from enterprise sales and implementation to self-serve setup at a price a 20-person company accepts.

| Player | California depth | Small-business fit | Notes |
|---|---|---|---|
| Paylocity + Aidora | High | Low | AI-native leave, acquired Jul 2026; aimed at mid-market and enterprise |
| Mitratech Leave | High | Low | AI-native leave compliance, launched Jun 2026; mid-sized and multi-state |
| Tilt | Medium to high | Medium | $4 to $6 per employee per month, in-house leave experts, Gusto and Rippling integrations, AI assistant "Tilley" with English and Spanish phone intake (premium support customers) |
| Rippling Leave Management | Medium | Medium | Built-in leave app; Rippling suggests adding Tilt for complex cases |
| Gusto | Low | High | PTO requests, accruals and balances inside payroll; no sign of CFRA eligibility, notices or state leave stacking |
| CalChamber | High (content) | High | Forms, guides and a helpline, not a workflow |
| ChatGPT and similar | Medium | High | Free answers; no employee data, no deadlines, no record |
| **Leave Ledger** | **High** | **High (target)** | Rules engine, notice clock, three role views, Clerk intake; no integrations, no customers |

**Placement:** Leave Ledger aims for the top right corner, where only CalChamber (content, not software) and Tilt (partly) sit today. That corner is attractive and also the easiest to copy, because the rules are public law.

Sources: [Tilt's Tilley assistant](https://hellotilt.com/platform/tilley/), [Rippling and Tilt](https://www.rippling.com/blog/tilt-rippling-the-easy-way-to-automate-leave-management), [Gusto time off, per LeaveBalance (a competitor), Jul 2026](https://www.leavebalance.com/blog/gusto-time-off-tracking/), [Tilt pricing on G2](https://www.g2.com/products/tilt-tilt/pricing). M1 sources cover Paylocity and Mitratech.

---

## Encroachment Threat Assessment

Time-to-threat and value-at-risk figures are estimates for partner challenge, not measurements.

### 1. Platform Encroachment
**Attacker:** Gusto (where California small businesses already run payroll).
**Vector:** Adds a California leave module to its plans: CFRA and PDL eligibility from the hours and hire dates it already holds, a notice checklist, and payroll pay codes that update automatically.
**Time-to-threat:** 6 to 18 months. Gusto has the data and the customers; nothing public suggests it is building this now.
**% of value at risk:** About 70%. Eligibility, balances and tracking would be covered. What it would likely not match early: the notice clock tied to the manager flag, PDL to CFRA stacking detail, and Clerk.

### 2. Vertical Competitor
**Attacker:** Tilt.
**Vector:** A lower-priced, self-serve tier for small employers, using its existing Gusto integration and Tilley assistant.
**Time-to-threat:** 3 to 12 months. It already has the product, the AI intake and the integrations; the only gap is packaging for very small companies.
**% of value at risk:** About 80%. Tilt's main weakness here is price and a sales-led model built for larger companies.

### 3. Adjacent Expansion
**Attacker:** CalChamber.
**Vector:** Turns its leave content, forms and helpline into a guided workflow for its existing California members.
**Time-to-threat:** 12 to 24 months. Its strength is trust and distribution, not software.
**% of value at risk:** About 40%, mostly the "help me get this right" value for 5 to 49 employee members.

---

## 90-Day Encroachment Plan

*Draft attack for your partner to play and sharpen.*

**Attacker:** Gusto.
**Attack vector (target the weakest loop):** Network. Gusto sees leave patterns across hundreds of thousands of small businesses. It ships benchmarks and defaults ("most California companies your size give 5 paid bereavement days") that Leave Ledger cannot match.
**Weeks 1-4 - what they ship:** "California leave" inside Gusto: an eligibility check (CFRA, PDL) from payroll data, a leave request type, and a notice checklist, free in existing plans.
**Weeks 5-8 - how they poach users:** An in-app banner for every California customer with 5 or more employees: "You owe CFRA leave. We now track it for you." One-click setup, no new vendor, no new login, no per-employee fee.
**Weeks 9-12 - why users don't come back:** Leave pay codes, balances and history now live in payroll. Leaving Gusto's module means re-entering history and losing automatic pay updates.
**Your defense:**
1. **Be inside Gusto, not against it.** List in Gusto's app directory with a two-way sync (hours, hire dates, pay codes). Position as the California leave specialist that Gusto customers add, the way Tilt already does.
2. **Own the record.** The notice clock, the signed notices and the 12-month leave history are what an employer needs in a dispute. Make exporting it easy, and make keeping it in Leave Ledger the safer choice.
3. **Win on correctness for California.** Publish the rules engine's test cases (PDL to bonding, bereavement within 3 months, reproductive loss caps) and Clerk's accuracy score. A free bundled checklist does not ship with either.
4. **Go through advisors.** Payroll bookkeepers, PEOs and employment lawyers who serve 5 to 49 employee companies are a channel Gusto does not control.
