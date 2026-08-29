# Self-hosting on Linux, reached from an iPhone over Tailscale

The app runs on your own machine, bound to loopback. Tailscale terminates TLS
and serves it to your devices over your tailnet. Nothing is exposed to the
public internet.

The database is **hosted Supabase** (free tier). The app is built around
Supabase Auth and PostgREST with row-level security doing the access control, so
running that part locally means running the whole Supabase stack in Docker. Not
worth it for one user — but note what it means: your balances, debts, and
transaction history live in Supabase's cloud, encrypted at rest. Your Plaid
access token is additionally encrypted by this app with a key that stays in your
`.env.local` and never leaves the box.

---

## 1. Prerequisites on the Linux host

Node 20.9 or newer — Next 16 refuses to start below that. Node 22 LTS is the
safe pick.

```bash
node -v      # must be >= v20.9.0
npm -v
git --version
curl --version
```

If Node is older, install 22 LTS via [nodesource](https://github.com/nodesource/distributions)
or `nvm`. Do not rely on the distro's `nodejs` package — several ship 18.

---

## 2. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project. Any
   region; pick the one nearest you.
2. Save the database password it shows you — you need it in step 6 and it is not
   shown again.
3. Once the project finishes provisioning, go to **Project Settings → API** and
   copy three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

The service_role key bypasses row-level security entirely. It belongs only in
`.env.local` on this box.

---

## 3. Get the code onto the host

```bash
sudo mkdir -p /opt/debt-destroyer
sudo chown "$USER" /opt/debt-destroyer
git clone -b claude/debt-destroyer-architecture-1rdc3o \
  https://github.com/coopmatth/debt-destroyer.git /opt/debt-destroyer
cd /opt/debt-destroyer
npm install
```

---

## 4. Set up Tailscale and get your HTTPS hostname

Install Tailscale and join your tailnet:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

In the [Tailscale admin console](https://login.tailscale.com/admin/dns), enable
both:

- **MagicDNS**
- **HTTPS Certificates**

Both are required — without them there is no `https://` name, and without
`https://` neither Plaid Link nor Supabase's auth redirects will work.

Find your machine's full name:

```bash
tailscale status --json | grep -i dnsname
# or just:
tailscale cert --help    # the usage line prints your tailnet domain
```

It looks like `yourbox.tailnet-name.ts.net`. **Write it down** — every step
below refers to it as `<HOST>`.

Now put Tailscale in front of the app:

```bash
sudo tailscale serve --bg 3000
tailscale serve status      # confirm it proxies https://<HOST> → 127.0.0.1:3000
```

`serve` keeps this inside your tailnet. Do **not** use `tailscale funnel` unless
you specifically want the app on the public internet — see step 11.

---

## 5. Generate secrets

```bash
cd /opt/debt-destroyer
echo "PLAID_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

Keep both. If you ever lose the encryption key, every stored Plaid token becomes
undecryptable and you re-link your banks — the app will tell you so rather than
failing quietly.

---

## 6. Apply the database schema

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from the Supabase URL
npm run db:push                                      # applies every migration
```

Both commands fail with "Cannot find project ref" until `link` has run. The ref
is the subdomain of your project URL: `https://abcdefgh.supabase.co` means
`--project-ref abcdefgh`. Linking prompts for the database password.

`db:push` will ask for the database password from step 2.

Then regenerate the TypeScript types from your own database:

```bash
npm run db:types
```

Verify in the Supabase dashboard under **Table Editor** that you have eight
tables: `users`, `plaid_items`, `accounts`, `debts`, `expenses`,
`transactions`, `debt_strikes`, `plaid_webhook_events`.

---

## 7. Configure Supabase Auth

In **Authentication → URL Configuration**:

- **Site URL**: `https://<HOST>`
- **Redirect URLs**: add `https://<HOST>/auth/callback`

Sign-in is by emailed magic link. The free tier's built-in mailer is heavily
rate-limited (a few messages an hour), which is fine for one person. If links
stop arriving, that limit is why — configure your own SMTP under
**Authentication → Emails** to lift it.

---

## 8. Configure Plaid

In the [Plaid dashboard](https://dashboard.plaid.com), with the environment
switched to **Production**:

1. **Team Settings → Keys** — copy `client_id` and the **Production** secret.
2. **Team Settings → API → Allowed redirect URIs** — add exactly:
   ```
   https://<HOST>/plaid/oauth-return
   ```
   This is required for OAuth banks (Chase, Bank of America, Capital One, Wells
   Fargo and most large issuers). Without it those banks refuse the handoff.
3. Confirm **Transactions** is enabled for your account. Liabilities is *not*
   needed — debts are entered by hand.

> If Plaid rejects a `.ts.net` redirect URI, you need a domain you control.
> Non-OAuth banks (many credit unions and smaller banks) still link without it.

---

## 9. Write the environment file

```bash
cd /opt/debt-destroyer
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
```

Fill in:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

PLAID_CLIENT_ID=...
PLAID_SECRET=...                 # the PRODUCTION secret
PLAID_ENV=production
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=https://<HOST>/plaid/oauth-return
PLAID_WEBHOOK_URL=               # leave empty, see step 11
PLAID_TOKEN_ENCRYPTION_KEY=...   # from step 5
NEXT_PUBLIC_SITE_URL=https://<HOST>
CRON_SECRET=...                  # from step 5
```

**`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time.**
Change one and you must rebuild — restarting is not enough.

---

## 10. Build and run as a service

```bash
npm run build
```

Sanity-check it before wiring systemd:

```bash
npm run start
# from another terminal:
curl -I http://127.0.0.1:3000/login    # expect 200
```

Stop it, then install the units:

```bash
sudo cp deploy/debt-destroyer.service /etc/systemd/system/
sudo cp deploy/debt-destroyer-refresh.service /etc/systemd/system/
sudo cp deploy/debt-destroyer-refresh.timer /etc/systemd/system/

# Set User= to the account that owns /opt/debt-destroyer:
sudo nano /etc/systemd/system/debt-destroyer.service

sudo systemctl daemon-reload
sudo systemctl enable --now debt-destroyer
sudo systemctl enable --now debt-destroyer-refresh.timer

systemctl status debt-destroyer
systemctl list-timers debt-destroyer-refresh.timer
```

The timer replaces Vercel Cron: it syncs balances and transactions from Plaid
every morning at 07:00. `vercel.json` is ignored when self-hosting.

---

## 11. Webhooks — skip them

Plaid pushes transaction updates to a webhook, but a `.ts.net` address is only
reachable from inside your tailnet, and Plaid's servers are not. Leave
`PLAID_WEBHOOK_URL` empty.

Nothing breaks. The daily timer refreshes your data, **Sync now** on the
Settings page refreshes it on demand, and the weekly number is recomputed live
every time you open the dashboard.

Exposing the webhook would mean `tailscale funnel`, which puts that path on the
public internet. The endpoint does verify Plaid's signature, but for a one-person
setup the tradeoff is not worth it.

---

## 12. Set up the iPhone

1. Install **Tailscale** from the App Store, sign in to the same account, and
   toggle the VPN on.
2. Open Safari and go to `https://<HOST>`.
3. Sign in — enter your email, then tap the link in the email.
4. **Share → Add to Home Screen.** It then launches full-screen like an app.

The connection only works while Tailscale is on. Enabling **On Demand** in the
Tailscale app keeps it connected in the background.

---

## 13. First run, in order

The order matters — the weekly number is only as good as its inputs.

1. **Settings → Connect a bank account.** Link the checking account your bills
   are paid from. On an OAuth bank you will bounce out to the bank and back.
2. **Settings → budget and payday.** Set:
   - *Weekly spending budget* — groceries, gas, everyday spending
   - *Cash floor* — what the app must never recommend spending
   - *Paid every* and *Next payday* — set once, it rolls forward on its own
   - *Timezone* — decides when your week rolls over
3. **Bills →** add everything recurring: rent, utilities, insurance,
   subscriptions, with real due dates.
4. **Debts →** add each card and loan with its APR, balance, minimum payment,
   and due date.
5. **This week →** your strike, with the arithmetic shown beneath it.

Then weekly: pay the strike, tap **I paid this**, and mark bills paid as they go
out. Marking a strike paid drops the balance and rolls the due date, so you are
not retyping numbers.

---

## Updating

```bash
cd /opt/debt-destroyer
git pull
npm install
npm run db:push      # only if migrations changed
npm run build        # required — NEXT_PUBLIC_* are baked in
sudo systemctl restart debt-destroyer
```

---

## Troubleshooting

**Magic link email never arrives.** Free-tier rate limit. Wait an hour or
configure SMTP under Authentication → Emails.

**Magic link opens to an error.** `https://<HOST>/auth/callback` is missing from
Supabase's Redirect URLs (step 7), or Site URL does not match.

**`https://<HOST>` does not resolve on the iPhone.** Tailscale is off, or
MagicDNS is disabled. Check `tailscale serve status` on the host.

**Bank connection fails right after the bank's site.** The redirect URI in Plaid
does not exactly match `PLAID_REDIRECT_URI` — including scheme and trailing
path.

**"permission denied for table plaid_items".** Something is selecting `*` from
that table. The access-token column is deliberately not granted to client roles;
queries must name their columns.

**The strike looks too small.** Open *How this number was reached*. Usually a
bill is still being reserved after you paid it — mark it paid on the Bills page.
Bills stop being reserved seven days past their due date regardless.

**Service will not start.** `journalctl -u debt-destroyer -n 50`. Almost always a
missing variable in `.env.local`; the app validates the whole environment at
boot and names what is absent.
