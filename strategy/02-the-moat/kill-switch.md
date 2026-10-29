# Kill Switch Audit

> Week 2 · Oct 28, 2026 · Draft for partner challenge

**Where AI is used today:** only Clerk intake (`netlify/lib/intake.mjs`). One model call per request, about 1,500 tokens in and 200 out. Eligibility, pay estimates and deadlines run in the rules engine with no AI. If the AI is off or failing, users fill in the form by hand and nothing else changes.

## Vendor Dependency Assessment

| Dimension | Current State | Risk Level | 48-Hour Action |
|-----------|--------------|------------|---------------|
| **Provider** | One provider: Anthropic, Claude Haiku 5.5, called directly over its API. Model name set by `LL_MODEL`. | M | Run the 20-case golden set on a second provider's small model and record the score. |
| **Abstraction** | Partial. The prompt and the output contract (a JSON draft validated field by field) are provider-neutral, but the HTTP call is written for Anthropic's API. | L | Move the call behind a small adapter (`callModel(system, message)`) with Anthropic and one other provider. |
| **Routing** | None. Every request goes to one model. There is no fallback model, only the manual form. | M | Add a fallback: if the main model errors or times out, retry once on the second provider; if that fails, show the form. |
| **Eval** | A 20-case golden set (4 adversarial) and `scripts/eval-intake.mjs` exist, plus a live "sent without changes" rate in HR Settings. Not run against the real model yet. | M | Add the API key, run the eval, and record the first baseline score in this file. |

## Portability Score

**Partial.** The parts that make the product valuable (rules engine, deadline clock, role views, the intake output contract) do not depend on any AI vendor. Switching models means changing one file and re-running the golden set. It is not "Ready" until a second provider is wired in and scored.

## If Anthropic doubles pricing tomorrow:

Little changes. At today's list price (Haiku 5.5: $0.10 per million input tokens, $0.50 per million output) one intake costs about $0.00025. Doubled, about $0.0005. A 20-employee company with 10 leaves a year would spend under one cent a year on intake. The 48-hour response is to do nothing on cost, and use the moment to finish the adapter and second-provider eval above.

Source: [Claude Haiku 5.5 overview and pricing](https://platform.claude.com/docs/en/models/haiku-5-5/overview). Per-request tokens are an estimate from the prompt size; the live number will appear in HR Settings.

## If Anthropic ships a competing product:

A general assistant that answers California leave questions does not threaten Leave Ledger more than ChatGPT already does. What a model vendor cannot replicate without becoming an HR software company:
1. **The employer's own data.** Hours, hire dates, 12-month leave history and sick balances per employee.
2. **The deadline clock and the record.** Notices owed, when the clock started (including from a manager's flag), what was sent and when.
3. **Role-based privacy.** Managers see dates only, employees see their own case, HR sees everything.
4. **Distribution into payroll** (the M2 defense), once built.

The real vendor risk is not competition; it is a model change that quietly lowers intake accuracy. The golden set run on every model change is the defense.
