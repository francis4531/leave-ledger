# Cost Curve & Pricing Strategy

> Week 3 · Nov 3, 2026 · Draft, for partner challenge. Builds on the Nov 2 product decisions: $3 per employee per month (PEPM), free for 1 to 4 employees, first segment 5 to 49 employees, owner is the buyer, design partners free for 3 months, Gusto first.

**The short answer:** Clerk is not the margin problem. One intake costs about $0.0003, so a 20-employee company's whole month of Clerk use costs under one cent. What decides the margin is human support time and card fees, and both hit the smallest companies hardest. At 5 employees and 15 minutes of support a month, gross margin is about 14%.

**How the numbers were built.** Every figure below is an estimate unless it cites a price page. The reference company has 20 employees and pays $60 a month. Assumptions, all to be replaced with real data:

| Assumption | Value | Why |
|---|---|---|
| Tokens per intake | 1,650 in, 250 out | The system prompt is 4,812 characters (about 1,200 tokens at 4 characters per token), plus a short message. Haiku 5.5's new tokenizer uses about 30% more tokens for the same text ([Mixed](https://mixed-news.com/en/?p=35955)), so 1,200 + 100 = 1,300, times 1.3 ≈ 1,650. Output is the JSON draft (about 150 to 250 tokens). HR Settings shows the real count. |
| Clerk calls per company per month | 20 | 20 employees, about 5 short sick absences each a year plus 3 longer leaves ≈ 105 requests a year ≈ 9 a month, doubled for rewording, retries and HR reading manager notes. |
| Support time per company per month | 15 minutes | No data yet. This is the number to pressure-test. |
| Cost of an hour of support | $40 | A placeholder for Francis's time or a part-time helper. Change it and every margin below moves. |
| Payment | Card, monthly | Stripe 2.9% + $0.30 per charge, plus Stripe Billing 0.7% ([NerdWallet](https://www.nerdwallet.com/business/software/learn/stripe-fees)). |

## Cost Model

Per company per month for the 20-employee reference company (PEPM in brackets = divide by 20). "10 companies" and "100 companies" show how fixed hosting spreads out.

| Cost Category | Per-User/Month | Notes |
|--------------|----------------|-------|
| Inference (primary model) | $0.006 per company ($0.0003 PEPM) | Claude Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output ([Mixed](https://mixed-news.com/en/?p=35955), [Haiku 5.5 API guide](https://dev.to/hassann/how-to-use-the-claude-haiku-55-api--1981)). 1,650 × $0.10/1M + 250 × $0.50/1M = $0.00029 per call, × 20 calls. The employee file column match (`netlify/lib/rostermap.mjs`) runs about once at setup and adds a fraction of a cent. |
| Inference (cascading/triage) | $0 | No second model. Haiku is already the cheapest tier, and the rules engine (free) does all decisions. See Cascading Strategy. |
| Infrastructure | $2.00 at 10 companies, $0.20 at 100 | Netlify Pro is $20 a month for 3,000 credits ([Netlify, Apr 2026](https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/)). Usage per company is small, so this is mostly a fixed cost shared out. |
| Data/storage | about $0 to $0.20 | Netlify Blobs (cases, logs, 14 days of daily backups) sit inside the Netlify credits at this size. Email (Resend) is free up to 3,000 emails a month but capped at 100 a day; Pro is $20 for 50,000 ([Resend](https://www.resend.com/pricing.md)). Plan on Pro (another $0.20 per company at 100 companies) once letters and receipts go out for real. |
| Human-in-the-loop | $10.00 | 15 minutes × $40 an hour. HR's own sign-off on each notice is the customer's time, not ours. This line is our support time: setup help, "is this right?" questions, design partner check-ins. |
| Payments (not in the template, added) | $2.46 | $60 × 2.9% + $0.30 = $2.04, plus $60 × 0.7% = $0.42. |
| **Total AI COGS** | **$0.006 per company** | AI is 0.04% of all costs. Total cost to serve is about $14.47 at 10 companies and $12.87 at 100. |

**Gross margin by company size** (all estimates, card monthly, 15 minutes support):

| Company | Revenue | Cost at 10 companies | Gross margin | Without support time |
|---|---|---|---|---|
| 5 employees | $15 | $12.85 | **14%** | 81% |
| 20 employees | $60 | $14.47 | **76%** (79% at 100 companies) | 93% |
| 49 employees | $147 | $17.60 | **88%** (89% at 100 companies) | 95% |
| 1 to 4 employees (free) | $0 | about $2 hosting share + any support | negative | |

What this says: below about 10 employees, every support minute matters. A 5-employee company leaves $12.15 a month after payments, hosting and Clerk ($15 − $0.84 − $2.00 − $0.01). At $40 an hour that is about 18 minutes of support before the company costs money. A 20-employee company can absorb about 83 minutes. The free tier only works if it gets no human support at all.

## Cascading Strategy
<!-- Cheap model → frontier model routing logic -->

The template assumes a cheap model hands hard cases to an expensive one. Leave Ledger's cascade has a different first step: **no model at all**.

**Triage model:** The rules engine and fixed letter templates (`public/engine.mjs`, `public/notices.mjs`), cost $0. They decide eligibility, pay estimates and deadlines, and write every notice. Notice drafting shipped on Nov 1 as fixed wording filled from the case, not AI.
**Frontier model:** Claude Haiku 5.5 for reading free text (intake, manager notes, file columns). There is no bigger model in the path, and none is needed today.
**Routing rule:** Form first; Clerk only when someone types in their own words. When Clerk is unsure (low confidence on reason), it does not escalate to a bigger model. It asks HR, because a person checking is the trust story (M4) and costs the customer seconds, not us money.
**Expected cascade ratio:** 100% of AI calls on Haiku. If the 50-case golden set ever shows Haiku under 90% on leave type (kill criterion 4), the fallback is Sonnet 5.5 at $2 / $10 per million ([Mixed](https://mixed-news.com/en/?p=35955)): $0.0058 a call, 20 times Haiku. Even sending every call to Sonnet costs $0.12 a month for the reference company (0.2% of revenue). Escalating 10% of calls brings the blended cost to $0.00084 a call.

**Not worth doing yet:**
- **Prompt caching.** Haiku 5.5 can cache prompts of 512 tokens or more ([guide](https://dev.to/hassann/how-to-use-the-claude-haiku-55-api--1981)), and ours qualifies, but the cache lasts 5 minutes and a small company sends a request every few days. Cache writes cost 25% more than plain input, so it would raise cost. Revisit only for bulk work (the eval run, a large file import).
- **The 100,000 token price cliff.** Above 100k tokens a prompt costs 5 times as much. Intake is about 1,650 tokens and the column match is capped at 80 columns, so we are far below it. Keep it in mind for future "answer from the whole case history" features.

## Pricing Model

**Current pricing:** $3 PEPM, free for 1 to 4 employees (decided Nov 2). Design partners free for 3 months. No billing built yet.
**Proposed AI pricing:** No separate AI charge. Clerk is included and not metered. At $0.0003 PEPM, charging for it would cost more to explain than it earns. The daily limits already in the code (15 a user, 30 a workspace, 400 across the site) cap the worst case at about $0.26 a workspace a month and about $3.50 for the whole site.
**Model:** seat-based (per employee per month). Usage-based and outcome-based pricing do not fit: the cost does not vary with usage, and an owner wants a predictable bill.

Two changes to how the seat price is collected, for Francis to decide (Week 3 questions):
1. **Annual prepay, by bank transfer (ACH), as the default for small companies.** A 5-employee company paying $15 by card monthly loses 5.6% to fees ($0.84). Paying $180 a year by ACH costs $1.44 (0.8%, capped at $5) plus $1.26 Billing fee, 1.5% in total. It also cuts churn and invoice handling.
2. **Self-serve support below 10 employees.** Email support only, with the Guide tab and walkthroughs doing the work. Setup calls only for 10 or more employees and design partners.

**Competitor price check (Nov 2026):** Tilt now lists **Essentials at $2.50 PEPM**, with integrations +$0.60, premium support +$1.50 and Tilley phone intake +$0.50; Professional at $3.50 is "coming soon" ([Tilt pricing](https://hellotilt.com/pricing)). That is lower than the $4 to $6 in M2. A small company wanting Gusto sync would pay Tilt $3.10 PEPM, close to our $3 with Gusto included. The Oct 30 decision says "our price and our notice clock are our edge." On list price alone the edge is now thin, so the case rests on the notice clock, California-only depth, self-serve setup in minutes (Tilt quotes 4 to 6 weeks of implementation under 500 employees), and no minimums. Draft, for partner challenge.

## Stress Tests

For the 20-employee reference company at 10 companies (gross margin 75.9%).

| Scenario | Impact on Margin | Response |
|----------|-----------------|----------|
| Inference costs 3x | Clerk goes from $0.006 to $0.017 a month. Margin moves by 0.02 points. | Nothing on price. Run the golden set on the cheaper option if one appears. |
| Heaviest segment doubles | Clerk use doubling: under $0.01. **Support time doubling to 30 minutes: margin falls from 76% to 59%.** For a 5-employee company it goes negative. | Support time is the real heavy segment. Measure minutes per company from the first design partner. Self-serve below 10 employees; ship the plain-language answers (Clerk) so employees ask Clerk before they ask us. |
| Model provider raises prices 50% | $0.003 more a month. No change. | Use it to finish the second-provider adapter (M2 kill switch), which is about portability, not cost. |
| Tilt prices at $2.50 PEPM (happening now) | If we matched it: revenue $50 for 20 employees, margin falls to about 72%; a 5-employee company at $12.50 slips just below break-even with 15 minutes of support. | Do not match yet. Test $3 against Tilt's $2.50 + $0.60 integrations in the interviews (Week 3 question 1). |
| Gusto takes a 20% revenue share (hypothetical) | Gusto's app partner terms are not public; this is a what-if. $12 off $60: margin falls to about 56%. | Ask about partner fees in the Gusto developer application before building the listing. If the share is real, a $3.50 price through Gusto may be needed. |
| Card payments, monthly, for every company | Already in the base case (4.1% of revenue at 20 employees). | Annual ACH default saves about 3 points at 20 employees and 4 points at 5. |

## Board One-Pager
<!-- Before/After: Old SaaS revenue vs. AI usage revenue for your product -->

**Before (traditional SaaS):** Leave Ledger without Clerk: $3 PEPM, rules engine, deadline clock, template letters. Cost to serve a 20-employee company: about $14.46 a month (payments $2.46, hosting $2.00, support $10.00). Gross margin about 76%.
**After (AI-enabled):** Same price, Clerk included. AI adds $0.006 a month. Gross margin about 76%. The AI is a feature, not a cost line, and is not resold by usage.
**Net margin shift:** −0.01 points from inference. The bigger upside is indirect: if Clerk intake and, later, Clerk answers cut support from 15 to 10 minutes a company a month, margin rises about 5.5 points (from 76% to 81%). That is the claim to prove with design partners, not to assume.

**Break-even at:** Running costs once paying are about $40 a month (Netlify Pro $20, Resend Pro $20). Each paying 20-employee company contributes about $47.50 after payments, Clerk and 15 minutes of support, so **1 paying 20-employee company covers the running costs**. With only 5-employee companies it takes **10** ($4.16 each). One-time costs come on top: the lawyer review of rules, letters and the city sick leave table (no quote yet) and trademark clearance (usually a few hundred dollars, per the Nov 2 notes). Each $1,000 of one-time cost is about 21 months of one 20-employee company's contribution. The 3 free design partners cost about $58 a month each in support time (a weekly 20-minute check-in is about 87 minutes a month), about $520 in total over the 3 months. This does not count Francis's own time beyond support.

## What would change these numbers

1. **Real tokens per intake** from HR Settings (AI cost this month ÷ requests). The estimate could be off by 30% either way; it changes nothing at this size.
2. **Real support minutes per company** from design partners. This one changes everything.
3. **Gusto's partner terms** (fees or revenue share, if any).
4. **Interview answers on price** against Tilt's $2.50.

## Code notes (not changed; for Francis)

- The site-wide limit of 400 Clerk calls a day (`LL_AI_DAY` in `netlify/lib/handler.mjs`) is fine now. At roughly 100 or more active companies it may start turning users away on busy days. It is an environment setting, so raise it in Netlify when needed.
- HR Settings "AI cost this month" uses the list price table in `handler.mjs` ($0.10 / $0.50), which matches the current Haiku 5.5 price. The column match calls are counted in the same total, which is fine.
- Billing is not built. Annual ACH would need Stripe Billing with bank debits enabled.
