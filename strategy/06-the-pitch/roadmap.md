# Three-Horizon Roadmap & Board Pitch

> Week 6 · Nov 24, 2026 · Draft, for partner challenge. Builds on: Copilot archetype delivered as Clerk, rules engine alone decides eligibility, a human signs off on every notice (Week 1, decided Oct 26); Gusto as partner and first payroll connection, price and notice clock as the edge over Tilt (Week 2, decided Oct 30); $2 per employee per month, kill criterion 2 at $2, annual prepay by bank transfer as the default for small companies (Week 3, decided Nov 3 and 4); live accuracy lines after the first 50 real intakes, jury duty and voting as simple HR-handled categories, Spanish grown to 10 golden rows, intake records kept four years (Week 4, decided Nov 11). Also the Nov 2 product decisions (5 to 49 employees first, owner is the buyer, 3 free design partners, California only).

**The short answer:** The product is further along than the evidence. The rules engine, deadline clock, role privacy and Clerk intake work on the test site, and Clerk scored 100% of 50 on our own test set. But the kill criteria check date (Nov 23) has passed with **0 of 10 customer interviews recorded**, 0 partner challenges, 0 real intakes and 0 paying employers. So the honest pitch today is not "fund growth". It is "fund 90 days of proof": 10 interviews, 3 design partners, and the first 50 real intakes, with clear lines for stopping.

**What changed this week (from the repo, Nov 24):**
- No Week 5 answers are recorded, so all four Week 5 questions carry into Week 6 (below).
- The two owed Week 4 builds are still not built: Clerk still treats jury duty and voting as "outside the supported reasons" (`netlify/lib/golden-data.mjs`), and the intake log still keeps the last 300 entries (`netlify/lib/handler.mjs`, `.slice(0, 300)`).
- The Nov 17 release removed visible pricing from the site; the survey now asks what people would pay without showing a number. Good for interviews: answers are not anchored to $2.
- AI coding sessions wrote 37 of the last 50 commits (35 of 50 at Week 5).

## Roadmap

Dates assume Horizon 1 starts Dec 1, 2026. Confidence is how sure we are the initiative hits its metric, not whether we can do the work.

### Horizon 1 · Now (0-3 months)
*Quick wins. Ship with existing capabilities.*
Dec 2026 to Feb 2027. Everything here uses what is already built, plus small code changes.

| Initiative | Metric | Confidence |
|-----------|--------|-----------|
| **Customer proof.** 10 interviews with California owners, office managers or HR generalists at 5 to 49 employee companies; record each in `strategy/` (payroll provider, handled a CFRA or PDL leave in the last 12 months, called it painful, would pay $2, what they use today) | 10 of 10 recorded. Kill criteria 1 and 2: at least 3 felt the pain, at least 2 would pay $2 | **M** to finish them (in Francis's control, but 0 done in 4 weeks); **L** on the outcome |
| **Design partner bar.** Finish the checklist (4 of 9 done): agreement, data processing terms, privacy policy, lawyer review, company accounts, breach plan. Plus the owed builds: four-year intake records, jury duty and voting categories | 9 of 9 checklist items; both owed builds shipped and tested | **H** for the builds (small code changes); **M** for the lawyer review (no quote yet) |
| **3 design partners live**, free for 3 months, weekly 20-minute check-in (Nov 2 decision 10) | First 50 real intakes (sets the live accuracy lines, Nov 11 decision); "sent without changes" rate; real support minutes per company per month (M3's biggest unknown, assumed 15) | **L.** Depends on interviews turning into partners |
| **Golden set from real words.** Grow from 50 to 80 rows, 15 or more from real phrasings, Spanish to 10 (Nov 11 decision) | Still 90% or more on leave type with real rows in the set | **M.** Today's 100% is a ceiling we wrote ourselves |
| **Apply to Gusto's developer and app partner program** (Nov 2 decision 11) | Application in; partner terms (fees, revenue share, review time) known | **M** to apply; terms unknown |

### Horizon 2 · Next (3-9 months)
*Bets. Requires new capabilities or integrations.*
Mar to Aug 2027.

| Initiative | Metric | Confidence |
|-----------|--------|-----------|
| **First paying employers.** Convert design partners and referrals at $2 per employee per month, annual prepay by bank transfer (Nov 3 decision). Needs billing, which is not built | 5 paying employers (the kill criterion 3 line). Break-even on running costs is 1 paying 20-employee company or 10 at 5 employees (M3 estimate) | **L** |
| **Gusto two-way sync** (hours, hire dates, roster) and an app listing | Listing live; share of new workspaces that come through Gusto. As of Nov 24, Gusto's embedded partner category lists busybusy, CleanCloud, Formations, GoCo and Hour Timesheet, and no leave app ([Gusto App Directory](https://gusto.com/product/integrations/categories/embedded_partners)) | **L.** Gusto controls the timeline |
| **Clerk answers employee questions** ("will I get paid?") in English and Spanish, grounded in the employee's own case. Per the Week 2 decision, a second AI provider is wired in and scored on the golden set before this ships | Support minutes per company fall from the measured baseline by a third (M3: 15 to 10 minutes is worth about 5 points of margin); both providers 90% or more on the golden set | **M.** Low cost (about $0.0003 a call, M3), but the support saving is unproven |
| **Written never-build line** and a review gate for protected code, before SB 947 takes effect July 1, 2027 | Line published on the site; every change to protected rules reviewed by Francis | **H** if decided (Week 6 questions 2 and 3) |

### Horizon 3 · Bet (9-18 months)
*Moonshots. High uncertainty, high potential.*
Sept 2027 to May 2028.

| Initiative | Metric | Confidence |
|-----------|--------|-----------|
| **The dispute-ready record.** Clerk drafts eligibility, designation and return-to-work notices from the case for HR to review and sign (today these are fixed templates, no AI); 12-month history, signed notices and delivery proof in one printable file per leave | 25 paying employers; 0 late notices across real leaves; at least one customer uses the record in a real dispute or audit | **L** |
| **California benchmarks.** De-identified, opt-in, never below 10 pooled companies (M2), only after 25 or more companies | Benchmark shown to owners ("leaves like this usually last N weeks in companies your size"); opt-in rate | **L** |
| **Second channel: bookkeepers, PEOs and employment lawyers** who serve many small California employers (M2 defense) | 3 referral partners each bringing 5 or more companies | **L** |
| **Rules ready for PFL for a designated person** (July 2028, M1). Just past this horizon; the rules update is due before it | Rule cases and tests in place by May 2028 | **H** (rules work, our strength) |

**Not on the roadmap, on purpose:** other states (Nov 2 decision 13: not before paying customers), FMLA-first features for 50 to 200 employees (the first segment is 5 to 49), an AI assistant connection (Nov 2 decision 14: later), and anything that scores or predicts employees by leave use (proposed never-build line).

## Board Pitch

**Thesis (1 sentence):** California's 328,201 employers with 5 to 49 employees owe state leave rules (CFRA, PDL, bereavement, reproductive loss) that FMLA-shaped tools and payroll add-ons do not handle, and Leave Ledger turns "I need time off" into the right leaves, pay and on-time notices for $2 per employee per month, with Clerk doing the paperwork and a person making every decision.

**The case:**
1. **Why now:** CFRA has covered employers with 5 or more employees since 2021, and California keeps adding leave (bereavement 2023, reproductive loss and 40 hours of sick leave 2024, PFL for a designated person July 2028). The AI-native leave tools launched in 2026 (Aidora, bought by Paylocity in July; Mitratech Leave, June) aim at mid-market and enterprise. Gusto's own absence management page covers PTO policies, accruals and requests, and mentions FMLA and state leave laws, but says nothing about CFRA and PDL stacking, eligibility decisions or notice deadlines ([Gusto](https://gusto.com/product/time-tools/absence-management), read Nov 24, 2026). So kill criterion 3 has not triggered.
2. **What's defensible:** Not the AI, and not today. M1 scored the moat 2/5 and data 1/5; M2's flywheel is 6/20. What can become defensible in 12 months: the dispute-ready record (notice clock, signed notices, delivery proof, 12-month history) that makes leaving costly, the Clerk correction loop once real intakes flow, and California-only depth tested by 85 rule cases and a lawyer review. Honest weak spot: Tilt already has AI intake, Gusto and Rippling sync and California coverage, at $2.50 per employee per month (M3, Tilt pricing page, Nov 2026). Our edge over Tilt is $0.50 of price and the notice clock, and neither has been tested with a customer.
3. **The economics:** AI is not a cost problem: about $0.0003 an intake, under one cent a month for a 20-employee company (M3). At $2 per employee per month, estimated gross margin is about 66% at 20 employees and 84% at 49, but about −27% at 5 employees with 15 minutes of support a month. Support time decides the margin, and it has never been measured. Running costs are about $40 a month (Netlify Pro, Resend Pro), not counting the Claude plan that runs the coding sessions (M5: still to add).

   **Size of the prize (estimate, show the arithmetic):** using the 20-employee reference company, every 5 to 49 employee California employer paying $2 would be 328,201 × 20 × $2 × 12 ≈ **$158 million a year**. That is the ceiling at 100% share; 20 is our reference company, not the measured average. 1% share is about $1.6 million a year; 100 companies is about $48,000 a year. A side venture at this price is a real small business, not a venture-scale one, unless it later adds states, the 50 to 200 segment or a higher price. That is a choice to make after proof, not now.

**The risks:**
1. **Trust / failure modes:** A wrong leave type or a missed notice is a legal problem for the customer. Defenses in the code: the rules engine alone decides, Clerk only drafts and its output is checked field by field, the user presses send, HR signs every notice, managers never receive a reason (enforced on the server). Gaps: no real intakes yet, Clerk's confidence labels unproven, the privacy check on HR's note to a manager is a word list, no lawyer review yet (M4, M5).
2. **Scale / governance:** AI coding sessions write most commits (37 of the last 50) and Netlify deploys every push to main that passes tests. Protected rules (role views, the manager note filter, Clerk's output checks, eligibility) have no human review gate. Decisions get recorded faster than they get built (2 Week 4 builds owed since Nov 11). Four-year records under the Civil Rights Council ADS rules are decided but not built (M5).
3. **Competitive:** Distribution. Small employers buy through payroll. If Gusto or Rippling bundles California leave stacking with a notice clock, or Tilt cuts price again, the standalone case weakens. Partnering with Gusto is the bet, and its terms are unknown.

**The ask:** Not money yet. For the next 90 days (Dec 2026 to Feb 2027):
1. **Introductions** to 10 California owners or office managers at 5 to 49 employee companies, ideally Gusto users, for 30-minute interviews.
2. **A budget line for the lawyer review** of the rules, letter templates and city sick leave table. No quote yet; get two quotes in December. Each $1,000 is about 21 months of one paying 20-employee company's contribution (M3 estimate).
3. **Agreement on the stop lines:** if interviews miss kill criteria 1 or 2, or no design partner signs by the end of February 2027, Leave Ledger becomes an add-on inside a payroll platform or stops (M1 kill criteria).

Draft, for partner challenge. The partner should push hardest on the thesis sentence (is "FMLA-shaped tools do not handle it" true of Tilt?) and on the ask (is "not money yet" credible to a board?).

## M1 Baseline vs. Now
*Your 3-sentence AI strategy from Module 1 vs. what you'd say now:*

**M1 baseline:** California employers with 5 to 200 employees get every leave right the first time, without an employment lawyer or an enterprise leave vendor. A Copilot does intake, plain-language answers and notice drafting, while a deterministic rules engine decides eligibility and a human signs off on every notice. The top risk is distribution through payroll providers, confidence is low, and 10 interviews by Nov 23 decide whether the bet holds.

**Now:** Start narrower: California employers with 5 to 49 employees, sold to the owner at $2 per employee per month (below Tilt's $2.50), reached through Gusto as a partner rather than against it. Clerk does intake today (100% of our own 50 test cases, about $0.0003 a request); answers and notice drafting wait for real users and a second AI provider, and the rules engine and a human still make every decision. The architecture and economics held up across six modules; the demand did not get tested, so the next 90 days are interviews and design partners, not features.

## Partner challenge prompts for Wednesday

1. Read the thesis sentence aloud. Would a 20-person owner in Fresno care? What word would they not understand?
2. "Not money yet" as the ask: honest, or a sign the bet is not ready to pitch?
3. The $158 million ceiling at 100% share: does that make this a business worth Francis's time, a side project, or a reason to plan for more states early?
4. Kill criteria date passed with 0 interviews recorded. Set a new date, or treat it as a fail?
