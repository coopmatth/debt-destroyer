# Deploying to Vercel

Front end and API on Vercel, database on hosted Supabase, bank data from Plaid.

Read this once before starting: **the order matters**. Plaid needs a URL you do
not have until the first deploy, and Plaid records a webhook URL *per bank
connection at the moment you link it* — so linking your bank before step 7 means
that connection never gets webhooks, even after you set the variable.

---

## 1. Get the branch onto your default branch

Vercel deploys your production branch. Either merge first:

```bash
git checkout main
git merge claude/debt-destroyer-architecture-1rdc3o
git push origin main
```

Or import as-is and set the production branch to
`claude/debt-destroyer-architecture-1rdc3o` under **Project Settings → Git**.

---

## 2. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). **Pick a region
   near where your Vercel functions run** — the default is US East (`iad1`), so
   East US keeps the round trip short. Every dashboard load makes several
   queries; a mismatched region is felt.
2. Save the database password. It is not shown twice.
3. **Project Settings → API** — copy the Project URL, the `anon` key, and the
   `service_role` key.

Apply the schema from your machine:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push        # applies every migration
npm run db:types       # regenerate types from your own database
```

`db:push` and `db:types` both fail with "Cannot find project ref" until `link`
has run — the ref is the subdomain of your project URL, so
`https://abcdefgh.supabase.co` means `--project-ref abcdefgh`. Linking prompts
for the database password from step 2.

Confirm eight tables exist in the Table Editor: `users`, `plaid_items`,
`accounts`, `debts`, `expenses`, `transactions`, `debt_strikes`,
`plaid_webhook_events`.

---

## 3. Generate two secrets

```bash
openssl rand -base64 32     # PLAID_TOKEN_ENCRYPTION_KEY
openssl rand -hex 32        # CRON_SECRET
```

Keep them somewhere you will still have them in a year. Lose the encryption key
and every stored Plaid token becomes undecryptable — you re-link your banks. The
app says so plainly rather than failing quietly.

---

## 4. Import the project into Vercel

**Add New → Project → Import Git Repository.** Framework detection picks up
Next.js; leave the build settings alone.

**Do not deploy yet** — add the environment variables first, or the first build
fails on missing configuration. That is deliberate: the app validates its whole
environment at boot and names what is absent.

---

## 5. Environment variables

Under **Settings → Environment Variables**, add each of these.

**Scope them to Production only.** Vercel offers to apply variables to Preview
and Development too, and that default is wrong here: a preview deployment from
any branch would then be pointed at your real database, holding your real bank
data, on a URL you are not thinking about.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `PLAID_CLIENT_ID` | Plaid client id |
| `PLAID_SECRET` | Plaid **Production** secret |
| `PLAID_ENV` | `production` |
| `PLAID_PRODUCTS` | `transactions` |
| `PLAID_COUNTRY_CODES` | `US` |
| `PLAID_TOKEN_ENCRYPTION_KEY` | from step 3 |
| `CRON_SECRET` | from step 3 |

Two more come in step 7, once you know your URL:
`PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL`, and `NEXT_PUBLIC_SITE_URL`.

`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time.
Changing one requires a redeploy, not just a restart.

---

## 6. First deploy

Deploy. You get `https://<project>.vercel.app`.

A custom domain is worth it if you have one — **Settings → Domains** — because
the Plaid redirect URI and Supabase auth URLs are registered against whatever
domain you use, and moving later means re-registering both. Everything below
calls it `<DOMAIN>`.

---

## 7. Wire up the URLs, then redeploy

Add the remaining variables (Production only):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<DOMAIN>` |
| `PLAID_REDIRECT_URI` | `https://<DOMAIN>/plaid/oauth-return` |
| `PLAID_WEBHOOK_URL` | `https://<DOMAIN>/api/plaid/webhook` |

**Supabase → Authentication → URL Configuration:**
- Site URL: `https://<DOMAIN>`
- Redirect URLs: add `https://<DOMAIN>/auth/callback`

**Plaid dashboard**, environment switched to **Production**:
- **Team Settings → API → Allowed redirect URIs**: add
  `https://<DOMAIN>/plaid/oauth-return`, exactly, including the path.
- Confirm **Transactions** is enabled. Liabilities is not needed — debts are
  entered by hand.

Then **redeploy** so the new `NEXT_PUBLIC_SITE_URL` is compiled in.

---

## 8. Verify before you link a bank

```bash
# Should be 401, not 500 — the route is live and rejecting unauthenticated calls.
curl -i https://<DOMAIN>/api/plaid/webhook -X POST -d '{}'

# Should be 401 without the secret.
curl -i https://<DOMAIN>/api/cron/weekly-refresh

# Should be 200 with it.
curl -i -H "Authorization: Bearer <CRON_SECRET>" \
  https://<DOMAIN>/api/cron/weekly-refresh
```

A 503 on the cron route means `CRON_SECRET` is not set — the route refuses to
run unauthenticated rather than leaving itself open.

Vercel Cron attaches `CRON_SECRET` as a bearer token automatically, so the
scheduled run authenticates with no extra configuration. Check
**Settings → Cron Jobs** shows the weekly entry from `vercel.json`.

---

## 9. First run, in order

Now link your bank — after step 7, so the connection is created with the webhook
URL attached.

1. Open `https://<DOMAIN>` on your phone, sign in with the emailed link.
2. **Settings → Connect a bank account.** OAuth banks bounce you out to the bank
   and back through `/plaid/oauth-return`.
3. **Settings** — weekly spending budget, cash floor, pay frequency, next
   payday, timezone. The timezone decides when your week rolls over.
4. **Bills** — every recurring cost with its real due date.
5. **Debts** — each card and loan with APR, balance, minimum payment, due date.
6. **This week** — the strike, with the arithmetic under it.
7. Safari → **Share → Add to Home Screen** for a full-screen launcher.

Weekly from then on: pay the strike, tap **I paid this**, mark bills paid as they
go out.

---

## Notes

**The cron is a safety net, not the engine.** The weekly number is recomputed
live every time you open the dashboard. The scheduled run exists to refresh
balances and transactions from Plaid; with webhooks working, most updates
arrive before it fires. `vercel.json` schedules it Monday 12:00 UTC — change to
`0 12 * * *` for daily if your plan allows more frequent crons.

**Preview deployments will not link banks.** Their URLs are not registered with
Plaid, and if you scoped variables to Production only they have no credentials
at all. That is the intended outcome.

**Free-tier magic links are rate-limited** to a few an hour. If sign-in emails
stop arriving, that is why — configure SMTP under Supabase → Authentication →
Emails.

**Production is publicly reachable.** Anyone can load the login page; Supabase
auth and row-level security are what stand between them and your data. Password
protection for production deployments is a paid Vercel feature. If that bothers
you, `docs/SELF-HOSTING.md` puts the whole thing behind Tailscale instead — the
code is identical either way.

---

## Troubleshooting

**Build fails on "Invalid environment configuration".** It names the missing
variable. Check it is scoped to Production.

**Magic link opens to an error.** `https://<DOMAIN>/auth/callback` is missing
from Supabase's Redirect URLs, or Site URL does not match.

**Bank connection dies right after the bank's own site.** The Plaid redirect URI
does not exactly match `PLAID_REDIRECT_URI` — scheme, domain, and path all have
to agree.

**"permission denied for table plaid_items".** Something is selecting `*` from
that table. The access-token column is deliberately not granted to client roles;
queries must name their columns.

**The strike looks too small.** Open *How this number was reached* on the
dashboard. Usually a bill is still being reserved after you paid it — mark it
paid on the Bills page. Bills stop being reserved seven days past due regardless.

**Function logs:** Vercel dashboard → your project → **Logs**, filtered to the
route.
