# Leave Ledger (test build)

California leave of absence management for employers with 5 to 200 employees. This build runs on Netlify with a sample company (Mesa Verde Coffee Roasters) and ten test accounts that share one set of data.

## What is in the folder

| Path | What it does |
|---|---|
| `public/index.html` | Page shell and styles |
| `public/app.mjs` | Front end: sign-in, HR admin, manager and employee views |
| `public/engine.mjs` | Leave rules, plan builder, deadline clock. Shared by browser and server |
| `netlify/functions/api.mjs` | Netlify Function at `/api/*` |
| `netlify/lib/handler.mjs` | Sign-in, test accounts, what each role can see, permission checks, activity log |
| `netlify.toml` | Publish folder, functions folder, noindex headers |

Data is stored in Netlify Blobs (store `leave-ledger`, key `data-v1`). Nothing to set up; Netlify provides it on Git and CLI deploys.

## Deploy

Netlify Drop (drag and drop) does not deploy functions, so use Git or the CLI.

### Option A: GitHub plus Netlify (recommended)

1. Create an empty private repo on GitHub, for example `francis4531/leave-ledger`.
2. From this folder:
   ```bash
   git init && git add . && git commit -m "Leave Ledger test build"
   git branch -M main
   git remote add origin https://github.com/francis4531/leave-ledger.git
   git push -u origin main
   ```
   If the push fails with a 403, git is using the wrong GitHub account. Push with the personal account's token.
3. In Netlify: Add new site, Import an existing project, pick the repo. Leave build settings as they are (`netlify.toml` sets them).
4. Site configuration, Environment variables, add:
   - `LL_TEST_PASSWORD`: the shared password for every test account
   - `LL_SECRET`: a long random string that signs sessions (`openssl rand -hex 32`)
5. Deploys, Trigger deploy, so the function picks up the variables.

### Option B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init          # create a new site
netlify env:set LL_TEST_PASSWORD "choose-a-password"
netlify env:set LL_SECRET "$(openssl rand -hex 32)"
netlify deploy --prod
```

### Custom domain (optional)

Add `leave.453labs.com` under Domain management in Netlify, then a CNAME at Porkbun: `leave` to `<site-name>.netlify.app`.

## Test accounts

All use `LL_TEST_PASSWORD`.

| Account | Role | What it shows |
|---|---|---|
| grace@mesaverde.example | HR admin | Full console; can also view her own leave |
| dana@mesaverde.example | Manager, Roastery | Team calendar for Priya, Jordan, Tomás, Alana, Ben |
| mei@mesaverde.example | Manager, Café | Team calendar for Marcus and Sofia |
| priya@mesaverde.example | Employee | Pregnancy disability then CFRA bonding, in progress |
| marcus@mesaverde.example | Employee | Family care leave coming up, certification pending |
| sofia@mesaverde.example | Employee | Under 12 months, not CFRA eligible; PFL still pays |
| jordan@mesaverde.example | Employee | Own medical leave; designation notice overdue |
| tomas@mesaverde.example | Employee | Bereavement next week |
| alana@mesaverde.example | Employee | Hired under 30 days ago |
| ben@mesaverde.example | Employee | No leave yet; good for a fresh request |

## What the server enforces

- Managers get dates and coverage notes for their own team only. No leave reason, tasks or notes reach their browser.
- Employees get their own record and cases only. HR private notes are stripped.
- Only HR can complete deadlines, edit employees or settings, delete cases, or reset data.
- Sessions are signed HttpOnly cookies that last 7 days.

## Things to know while testing

- Everyone shares one dataset. HR admin, Settings, "Reset to sample data" restores it for all accounts.
- Dates are computed in Pacific time. Sample cases are placed relative to the day the data was first loaded.
- This is a test build with a shared password. Do not enter real employee or medical information.
- The site sends `noindex` so search engines skip it.
- Rules were checked October 2026. Benefit amounts are estimates; EDD makes the final calculation. Not legal advice.
