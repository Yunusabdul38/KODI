# Kodi

**No keys, no payout.** Rent escrow for Lagos over Bitcoin Lightning.

Renting in Lagos often means paying a year or more up front to people you can't verify. In one 2025 case,
more than 15 people paid for the same flats. Kodi fixes two things:

- **Safe Deposit.** A tenant pays rent (at most 12 months, as Lagos law allows) plus the agent fee into escrow
  over Lightning. The home locks the moment they pay: the database refuses any other deposit for it. When the
  tenant confirms they have the keys, the landlord and agent are paid their shares. No keys by the move-in
  date? The tenant asks for a refund; the landlord has 48 hours to object, and an objection goes to an arbiter.
- **Rent Vault.** A sitting tenant saves toward next year's rent, weekly or monthly. One vault per home: it
  opens at once from the tenant's own Kodi deposit, otherwise the landlord confirms the tenant lives there.
  The private vault page needs the tenant's PIN. The landlord watches progress on a read-only link, family can
  top up from anywhere, and on the due date Kodi pays the landlord.

Everything runs on Mutinynet, Bitcoin's test network. Amounts are in naira; on the test network they're
converted at 1/1000 of the real rate, so a real Lagos rent fits in free test coins.

## Get it running

Needs Node 22+ and runs on port **3100**. Docker is only needed for the test wallet.

```bash
npm install
npm run wallet         # optional: a real Lightning wallet on Mutinynet (about 3 minutes)
npm run dev            # http://localhost:3100
```

Skip `npm run wallet` and Kodi runs with a simulated wallet: payment screens get a **Simulate payment**
button. Run it and payments go over real Lightning with free test coins. It shows a checklist (Docker,
Lightning node, wallets, channel), sets up only what's missing after you say yes, and never stops your
running app or wipes data: each wallet keeps its own local ledger, so your simulated-wallet data is still
there if you go back. Restart `npm run dev` afterwards so it picks up the wallet.

The channel comes from the Mutinynet faucet after a GitHub sign-in that you do yourself. Kodi asks for a
small one, 100,000 sats, which covers many test rents at the 1/1000 rate. Need more room? Add channels any
time, up to 1,000,000 sats a day:

```bash
npm run wallet status                      # checklist, balances and the dashboard password
npm run wallet channel -- --sats 250000    # another channel from the faucet
npm run wallet stop                        # stop the node; wallets and coins stay
npm run wallet remove                      # delete it and go back to the simulated wallet
```

## A tour

Every open page updates by itself, so it helps to keep the tenant, landlord and arbiter pages open side by side.
The arbiter password is `kodi-admin` locally.

1. **Register as a landlord** at `/landlord/register`. A confirmation appears; you're not signed in yet.
2. **Verify yourself** at `/admin` (the arbiter). Then sign in at `/landlord` and **list a home**: it gets a
   code like `KD-7QH2M`.
3. **Check the code** at `/check`: real, verified, available.
4. **Pay a Safe Deposit** on the home's page, in one browser.
   - With the test wallet: copy the payment request and pay it from the dashboard (Send).
   - With the simulated wallet: press **Simulate payment**.
5. **Try to pay again** for the same home in a second browser (or a private window): Kodi refuses. The home
   shows "Deposit held" everywhere, and `/check` warns it's taken.
6. **Hand over the keys** on the landlord dashboard, then tap **I've moved in** on the tenant's private page.
   The landlord and agent are paid; each payout has a receipt whose proof you can verify in the browser.
7. **Refund and dispute**: pay a deposit on another home, then on `/admin` use the **demo clock** (test
   network only) to skip past the move-in date. Ask for a refund as the tenant, object as the landlord, and
   decide as the arbiter.
8. **Rent Vault**: open one from the tenant's deposit page (or ask for one at `/vault` and confirm it as the
   landlord), choose a PIN, top up, share the family and landlord links, then skip
   the clock past the due date and press **Run daily jobs now**. The landlord is paid.
9. **Escrow ledger** at `/ledger`: what Kodi owes, the wallet balance, and every movement with its proof.

## Tests

```bash
npm run test:ledger    # escrow and ledger rules against a throwaway database (43 checks)
npm run test:e2e       # the whole story plus security checks in a real browser (53 checks, ~2 min)
npm run db:reset       # clear the local ledgers; Kodi starts empty again
```

`npm run test:e2e` builds into its own folder, serves on its own port with an in-memory database and the
simulated wallet, and ignores `.env.local`, so it's safe to run next to `npm run dev`. It needs Google Chrome,
or run `npx playwright install chromium` once.

## Guarantees

| Rule | Enforced by |
| --- | --- |
| One active deposit per home (awaiting payment, held, refund requested or disputed) | Partial unique index `deposits_one_active_per_unit` |
| One open Rent Vault per home, and no money into a vault the landlord hasn't confirmed | Partial unique index `vaults_one_active_per_unit`, trigger `vault_payments_open` |
| At most 12 months' rent from a new tenant | Check constraint on `deposits.months`, and the form |
| A deposit's amounts and terms never change; its status only moves forward | Trigger `deposits_guard` |
| No payout larger than what was paid in for that deposit or vault | Trigger `payouts_within_balance` (row lock) |
| Payments, payouts, disputes and the audit log can't be deleted or rewritten | Append-only triggers |
| Only the wallet can mark something paid | Every status check re-asks the wallet; the browser never decides |
| Only the tenant (or the arbiter) releases money | Server actions; the landlord can only say keys were handed over |

**Money out.** A payout is written to the ledger before it is paid. Kodi then asks the destination (a
Lightning address via LNURL, or a test wallet) for an invoice for exactly that amount and pays it. A payout
whose result is unclear stays reserved and appears under "Payouts to check" for the arbiter; freeing it
wrongly could pay someone twice. Before contacting a Lightning address, both its domain and the invoice URL
it returns must be `https` on a public IP.

**Who can do what**

| Who | Proves it with | Can |
| --- | --- | --- |
| Anyone | nothing | Browse homes, check a code, top up a vault from a family link, read receipts. |
| Tenant | the private link (only its SHA-256 is stored); for a Rent Vault, also a 6-digit PIN (scrypt) | Pay, confirm the keys, ask for a refund, open a dispute; open and top up a Rent Vault. |
| Landlord | email + password (scrypt) | Under review: see their status only. Verified: list homes, confirm handover, object to a refund, open a dispute, set the payout address, confirm or decline Rent Vault requests. |
| Arbiter | `ADMIN_PASSWORD` | Verify landlords, decide disputes, freeze listings, resolve payouts, return vault savings. |

Sessions are signed, httpOnly, SameSite=Lax cookies (8 hours); changing a password signs out other
sessions. Sign-ins are rate-limited per IP and per account, and a wrong email takes as long as a wrong code.
The site sends a strict Content-Security-Policy, HSTS, `nosniff` and `X-Frame-Options: DENY`; user text is
always rendered as text. The public unit check (`/api/units/KD-…`) returns no names, addresses or amounts.

**Fails safe in production**: without `NWC_URL` no payments (unless `ALLOW_DEMO_WALLET=true`); without
`DATABASE_URL` no local database (unless `ALLOW_LOCAL_DB=true`); without `ADMIN_PASSWORD` no arbiter sign-in.

## Architecture

- **App:** Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, shadcn/ui on Radix.
- **Database:** without `DATABASE_URL`, PGlite (Postgres in WebAssembly) in `.data/`, one ledger per escrow wallet. Set `DATABASE_URL` for
  any hosted Postgres; migrations run on first connection either way.
- **Wallet:** any Nostr Wallet Connect wallet via `NWC_URL`, ideally an isolated sub-wallet so its balance is
  exactly what Kodi holds. `LIGHTNING_NETWORK=mutinynet` shows a "Test network" bar, scales amounts 1/1000 and
  refuses real-money invoices.
- **Daily jobs:** `GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` pays due vaults, pays refunds
  whose 48-hour window has passed, and records a reserve check (`vercel.ts` schedules it on Vercel).
- **Hosting:** set `DATABASE_URL`, `NWC_URL`, `LIGHTNING_NETWORK`, `APP_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`,
  `ADMIN_EMAIL` and `CRON_SECRET`. See `.env.example`.

## Libraries

| Job | Package |
| --- | --- |
| Escrow wallet: invoices, lookups, payouts, balance | `@getalby/sdk` (NWC client) |
| Pay a landlord's or agent's Lightning address | `@getalby/lightning-tools/lnurl` |
| Tenant pays from a browser wallet, extension or NWC | `@getalby/bitcoin-connect-react` |
| Exchange rate | yadio.io, with `@getalby/lightning-tools/fiat` as backup |
| Live updates across tabs | `@tanstack/react-query` polling `/api/changes` |
| QR codes | `qrcode.react` |
| Database | `pg`, `@electric-sql/pglite` |

## Roadmap

- **Custody:** the escrow is held by Kodi in this version, with a public escrow ledger and a daily reserve check.
  The next step is a 2-of-3 multisig (tenant, landlord, arbiter). Lightning hold invoices can't do this job:
  they stay open for hours or days, while a deposit can wait weeks for move-in.
- **Property title checks:** landlords are verified by ID and phone, not land-registry records.
- **Naira payouts** to bank accounts (planned through a licensed partner such as Bitnob).
- **Photo uploads** (listings use stock photos) and **evidence uploads** in disputes.
- **Email** is only logged to the server console without `RESEND_API_KEY`; the app tells tenants to copy their
  private links.
- **A dollar-stable balance** for Rent Vaults.

## Code map

- `db/migrations/0001_init.sql`: schema, the one-deposit-per-home index, and the ledger triggers
- `src/lib/deposits.ts`: Safe Deposit: quote, pay, settle, release, refund, disputes
- `src/lib/vaults.ts`: Rent Vault: open, top up, pay on the due date, return
- `src/lib/payouts.ts`: money out, with the ledger-first, verify-before-free rules
- `src/lib/lightning/`: NWC and simulated wallets behind one interface
- `src/lib/clock.ts`: the demo clock (test network only)
- `scripts/wallet.ts`, `infra/testnet/`: the test wallet and its commands

Photos are from Unsplash (credits on `/about`). Sources for the rental facts are linked on `/about`.
