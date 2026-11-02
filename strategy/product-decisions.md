# Product decisions

> Decisions about the product and the business, made outside the course schedule. Newest first. Decided by Francis on Nov 2, 2026 unless noted.

## Decided

| # | Decision | What we chose | What it means in the product |
|---|---|---|---|
| 1 | Legal sign-off | HR signs off on each leave, then can send a copy of the decision to legal. | Approve on each leave. "Send a copy to legal" emails the legal contact from Settings a summary: dates, each eligibility test and its result, letters and their delivery record. |
| 2 | City sick leave laws | Cover the largest cities now. | Settings, "City where most employees work": San Francisco, Oakland, Berkeley, Emeryville, Los Angeles city and county, San Diego, Santa Monica. The employee gets the more generous of the state and the city rule. Needs the lawyer's check (see 1). |
| 3 | Real employee data | A design partner bar for 2 or 3 companies. | The site admin switches on "Design partner" per workspace in the inbox, only after the checklist below is done. |
| 4 | Employee words and AI | Keep Clerk, with an AI agreement that does not keep or train on the data, and a consent line employees see. | In design partner workspaces Clerk stays off until `LL_AI_REAL_DATA_OK=yes` is set in Netlify. The request form says what Clerk does with their words. |
| 5 | Employer | A personal side venture with no connection to Francis's employer. | Nothing to build. |
| 6 | Name | Keep "Leave Ledger" for now; clear it properly before spending on brand. | See trademark notes below. |
| 7 | First segment | California employers with 5 to 49 employees. | State leaves only (no federal FMLA). This is where the California-only complexity is the edge. |
| 8 | Price | $3 per employee per month. Free for 1 to 4 employees (decided Nov 2). | Companies under 5 owe only sick leave, so the free tier does not overlap the 5 to 49 target. No billing built yet. |
| 9 | Buyer | The owner. | Pitch and onboarding speak to the owner: risk, time saved, cost. HR or the office manager runs it day to day. |
| 10 | Pilot | Design partners, free for 3 months. | In return: a weekly 20-minute check-in and permission to quote them. |
| 11 | Payroll connection | Gusto first. | Next: apply to Gusto's developer and app partner program. File import covers everyone else until then. |
| 12 | Proof of delivery | Track it for every letter and show it. | Letters are sent through Leave Ledger (and emailed when set up). The employee opens and confirms receipt. HR sees the record on the leave, with times, and can print it. |
| 13 | Where | California only. | No other states until after the first paying customers. |
| 14 | AI assistant connection (MCP server) | Later. | Not built. Revisit after design partners. |

## Design partner checklist

Switch a workspace to "Design partner" in the inbox only when every line is done for that company.

- [ ] Signed design partner agreement: 3 months free, confidentiality, who owns the data (the company), deletion when the pilot ends, not legal advice.
- [ ] Data processing terms signed with the company.
- [ ] Privacy policy updated for real data, naming every outside service: hosting and storage (Netlify), AI (Anthropic), email (Resend), sign-in (Google).
- [x] `LL_AI_REAL_DATA_OK=yes` set in Netlify (Nov 2). Keep the AI agreement on file: employee words are not kept or used for training.
- [ ] Lawyer review of the rules, the letter templates and the city sick leave table done, and fixes made.
- [ ] Company accounts only switched on for the workspace (Users tab).
- [x] Export and delete for a workspace built and tested (Settings, Your data). Deleting removes data, users and backups.
- [x] Daily backup of every workspace, 14 days kept, restore from the admin inbox. Backups live with the app's storage: they cover mistakes, not a hosting outage.
- [ ] A short plan for a data breach: who is told, how fast (California Civil Code 1798.82).

## Trademark notes (Nov 2, 2026)

A web search found no product or registered mark called "Leave Ledger". Two things to know:

- "Leave ledger" is ordinary HR wording. Frappe HR, an open source HR system, has a "Leave Ledger" report and "Leave Ledger Entry" records. A descriptive name like this is harder to register and to defend.
- "Ledger" alone is a crowded mark, held by the crypto wallet company Ledger for software and finance. Different goods and services, but expect pushback if the filing leans on "Ledger".

This was a web search, not a USPTO search. Before spending on brand: run the USPTO trademark search for "Leave Ledger" and close variants in classes 9, 35 and 42, then have a trademark attorney do a clearance search (usually a few hundred dollars).
