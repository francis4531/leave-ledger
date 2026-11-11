# Strategy decisions

> Answered on the /strategy page of the test site and copied here automatically. Newest week first. Edit them on the page, not in this file; the page overwrites it.

## Week 4 · The Contract

### 1. Live accuracy bar

**Question:** Clerk passed the golden set (100% of 50), but real use is the true test. Proposed: if users change Clerk's leave type in 3 of a design partner's last 20 intakes, review them that week; at 5 of 20, that workspace goes to "suggest only" (Clerk shows its reading but does not fill the form). Accept these lines, set different ones, or wait for the first 50 real intakes?

**Status:** Decided · Nov 11, 2026 · Site admin

**Answer:** wait for the first 50 real intakes.

### 2. Jury duty, voting and other legal time off

**Question:** California protects time off for jury duty and gives up to 2 paid hours to vote, but Clerk and the rules engine have no category for them, so users see "I could not tell what kind of time off this is." Add them as simple categories HR handles (no eligibility math), build them into the rules engine, or keep them out of scope for the 5 to 49 pilot?

**Status:** Decided · Nov 11, 2026 · Site admin

**Answer:** Add them as simple categories HR handles (no eligibility math), build them into the rules engine,

### 3. Languages Clerk promises

**Question:** The form says "English or Spanish is fine" and the golden set has 4 Spanish rows and 1 Tagalog. Grow Spanish to 10 rows before design partners and keep the promise at English and Spanish, add other common California languages (Chinese, Vietnamese, Tagalog, Korean), or drop the Spanish line until it is tested?

**Status:** Decided · Nov 11, 2026 · Site admin

**Answer:** Grow Spanish to 10 rows before design partners and keep the promise at English and Spanish,

### 4. Four-year records

**Question:** California's rules on automated-decision systems in employment (in force since Oct 1, 2025) ask employers to keep related records for four years. Leave Ledger keeps the last 300 intakes per workspace. Keep intake records for four years now (a code change), or wait for the lawyer review to say whether Clerk and the rules engine count?

**Status:** Decided · Nov 11, 2026 · Site admin

**Answer:** Keep intake records for four years now (a code change).

## Week 3 · The Margin

### 1. Tilt's $2.50 price

**Question:** Tilt now lists Essentials at $2.50 per employee per month (plus $0.60 for Gusto and Rippling sync), below our $3. Keep $3 and sell the notice clock and setup in minutes, or change the price? Either way, ask each interviewee what they would pay with Tilt's list price in front of them.

**Status:** Decided · Nov 3, 2026 · Site admin

**Answer:** Keep the same price as Tilt.  We compete on both price and value.

### 2. Kill criterion 2 price

**Question:** Criterion 2 still asks whether 2 of 10 would pay at least $4 per employee per month, set when Tilt's lowest tier looked like $4. Our price is now $3 and Tilt's is $2.50. Change the bar to $3 (our price), keep $4, or something else?

**Status:** Decided · Nov 4, 2026 · Site admin

**Answer:** Lower it below Tilt's $2.50 and bring it to $2.00

### 3. Small companies: billing and support

**Question:** At 5 employees and 15 minutes of support a month, gross margin is about 14% (18 minutes and the company costs money). Make annual prepay by bank transfer the default and support email-only below 10 employees, set a monthly minimum, or leave it until design partners show real support time?

**Status:** Decided · Nov 3, 2026 · Site admin

**Answer:** Make it the default.   We need to build the trust from our customers to have automated prepay.

### 4. Clerk's first numbers

**Question:** Week 2's "turn on Clerk" is done, but no score is recorded yet. Add the golden set result (inbox, Clerk test run: % right on leave type, out of 50 cases) and HR Settings' requests and AI cost this month to `02-the-moat/kill-switch.md`, or paste them in this answer. They replace this week's token estimate and set the Week 4 baseline.

**Status:** Decided · Nov 4, 2026 · Site admin

**Answer:** Done. First valid golden set run, Nov 3, 10:27 PM PT: 100% right on leave type out of 50 cases (target 90%). Every field right 100%, tricky requests handled 100%, average reply 2.3 seconds, 0 errors. A full 50-case run costs about one cent. Requests and AI cost this month in HR Settings are near zero, since only test runs have used Clerk so far.

An earlier run the same evening failed all 50 because the API key was invalid; it is excluded. Recorded in 02-the-moat/kill-switch.md as the Week 4 baseline.

Caveat: we wrote the 50 cases alongside the prompt, so 100% is the ceiling. The real measure is “Sent without changes” once design partners use it. Next: add 10 to 20 real phrasings from interviews to the test set.

## Week 2 · The Moat

### 1. Partner challenge on Tilt

**Question:** Is Tilt the real threat rather than Gusto? It already has AI intake (Tilley), Gusto and Rippling sync, and California coverage. If yes, what does Leave Ledger do that Tilt will not do for a 15-person company?

**Status:** Decided · Oct 30, 2026 · Site admin

**Answer:** Our price and our notice clock is our edge.   To be tested in the interviews.

### 2. Gusto: partner or competitor?

**Question:** The defense assumes a Gusto app directory listing. Is that the distribution bet, or should the first channel be bookkeepers and PEOs?

**Status:** Decided · Oct 30, 2026 · Site admin

**Answer:** Gusto is a partner.  Without an established distribution network, reaching tiny companies will be cost prohibitive.

### 3. Turn on the Copilot

**Question:** Add `ANTHROPIC_API_KEY` in Netlify and run `scripts/eval-intake.mjs`. The first accuracy score goes into `02-the-moat/kill-switch.md` and feeds Week 4.

**Status:** Decided · Oct 30, 2026 · Site admin

**Answer:** Done.

### 4. Interviews

**Question:** Kill criteria check is Nov 23. Ask each interviewee what they use for payroll; if most say Gusto, that confirms decision 2.

**Status:** Decided · Oct 30, 2026 · Site admin

**Answer:** Understood.  Will do.

## Week 1 · The Bet

### 1. Confirm the archetype

**Question:** Copilot with a rules engine underneath, or something else?

**Status:** Decided · Oct 28, 2026 · Grace Okafor

**Answer:** Go with a Copilot concept.  This AI does intake, plain-language answers and notice drafts; the rules engine alone decides eligibility, and a human (persona) signs off on every notice.

<details><summary>Earlier answers (4)</summary>

- Oct 28, 2026 · Decided: Go with a Copilot concept.  This AI does intake, plain-language answers and notice drafts; the rules engine alone decides eligibility, and a human (persona-based) signs off on every notice.
- Oct 28, 2026 · Decided: Go with a Copilot concept.  This AI does intake, plain-language answers and notice drafts; the rules engine alone decides eligibility, and a human signs off on every notice.
- Oct 28, 2026 · Decided: Go with a Copilot concept.  This AI does intake, plain-language answers and notice drafts; the rules engine alone decides eligibility, and a human signs off on every notice.
- Oct 26, 2026 · Decided: Go with Copilot. AI does intake, plain-language answers and notice drafts; the rules engine alone decides eligibility, and a human signs off on every notice.

</details>

### 2. Partner challenge

**Question:** Test the three named attackers (Tilt, ChatGPT, Gusto) and the 1/5 data score with your course partner.

**Status:** Decided · Oct 26, 2026 · Francis (in chat)

**Answer:** Yes. Test Tilt, ChatGPT and Gusto as attackers, and the 1/5 data score, with my course partner.

### 3. Prototype link

**Question:** Add the Netlify URL to 01-the-bet/prototype.md.

**Status:** Decided · Oct 26, 2026 · Francis (in chat)

**Answer:** Yes. Done: https://spectacular-mousse-c413d6.netlify.app is in prototype.md.

### 4. Start interviews

**Question:** Kill criteria 1 and 2 need 10 conversations by Nov 23.

**Status:** Decided · Oct 26, 2026 · Francis (in chat)

**Answer:** Will do: 10 interviews with California office managers or HR generalists by Nov 23.
