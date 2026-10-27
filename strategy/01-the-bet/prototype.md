# The Prototype Bet

> Week 1 · Oct 26, 2026

## What I Built

A working test site where an HR admin, a manager and an employee each see a California leave from their side. The HR admin gets stacked entitlements, a state pay estimate, the notices owed, and a deadline clock. The employee gets their balances and next steps. The manager gets dates only.

## Tool Used

Claude (product, rules research, code), GitHub (`francis4531/leave-ledger`), Netlify (hosting, serverless API, Blobs storage). Cursor for quick local edits from here on.

## Prototype Link

`https://<site-name>.netlify.app` (fill in) · 10 test accounts, shared password from Netlify settings.

What works today:
- **Rules engine** for CFRA, PDL, FMLA, SDI, PFL, paid sick leave, bereavement and reproductive loss, checked against sources in October 2026.
- **Deadline clock**: 5 business days for the first notice, 15 calendar days for certification, 5 business days to designate. It skips weekends and company holidays.
- **Server-side privacy**: managers never receive the reason for a leave, and employees only receive their own records.
- **Manager flag**: when a manager hears about a possible leave, the notice clock starts.

## AI Value Archetype

**Copilot** (proposed; needs your confirmation).

The prototype is a deterministic rules engine with no AI in it yet. The AI layer the bet depends on sits on top of it, and the rules engine stays the only thing that decides eligibility:

1. **Intake.** An employee or manager writes in plain words ("my dad has surgery on the 12th, I need a few weeks"). The copilot turns that into a draft case: likely leave type, family relation, dates. HR confirms it with one click.
2. **Plain-language answers.** Employees ask "will I get paid?" and get an answer grounded in their own case, in English or Spanish.
3. **Notice drafting.** The copilot fills in the eligibility, designation and return-to-work notices from the case for HR to review and send.

The copilot never decides eligibility or denies a leave; a human signs off on every notice. That boundary is the trust story for Module 4.

Why not the other archetypes: an **Automator** that sends notices on its own is too risky for legal notices. An **Oracle** with no workflow is what ChatGPT already gives away for free.

## The Bet in One Sentence

California employers with 5 to 200 employees get every leave right the first time: Leave Ledger turns "I need time off" into the right state and federal leaves, pay and deadlines, so a part-time office manager does not need an employment lawyer or a leave vendor built for 5,000-person companies.

**Why now:**
- CFRA reached employers with 5+ employees in 2021.
- California keeps adding leave rules: bereavement (2023), reproductive loss and 40 hours of sick leave (2024), and PFL for a designated individual from July 2028.
- The AI-native leave tools that launched in 2026 (Aidora, now part of Paylocity; Mitratech Leave) are built for mid-market and enterprise.

## Kill Criteria

Stop, or pivot to an add-on inside a payroll platform, if any of these happen:

| # | Evidence that kills or changes the bet | Check by |
|---|---|---|
| 1 | Fewer than 3 of 10 interviewed California office managers or HR generalists handled a CFRA or PDL leave in the last 12 months and called it painful | Nov 23, 2026 |
| 2 | Fewer than 2 of those 10 would pay at least $4 per employee per month (Tilt's lowest tier) or a flat monthly price of similar size | Nov 23, 2026 |
| 3 | Gusto or Rippling ships California-specific leave stacking with a notice clock before Leave Ledger has 5 paying employers | Ongoing; review monthly |
| 4 | AI intake classifies under 90% of a 50-case golden set into the right leave type | Built and tested in Module 4 |

If #4 fails, the bet survives as a rules-and-workflow product with no AI in the decision path, and the archetype is revisited.
