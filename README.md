# personal-f — personal finance dashboard

A phone-first PWA for a two-person household's shared bills and personal finances: net salary (UK
PAYE), loan payoff tracking, personal and joint bills on a Monzo-style card dashboard, savings
goals, and what-if scenario modelling. Supabase Auth for sign-in, PowerSync for offline-first sync
between devices.

Live on GitHub Pages, installed on an iPhone home screen.

> **Status.** This app is the **predecessor** of the ledger apps and is on the way out — it is kept
> running for the data already in it, not actively developed. New finance work happens in
> `personal-ledger` (offline) and `shared-finance-ledger` (synced), which replaced it with a real
> transaction ledger. Keep changes here small and low-risk, and see `TECHNICAL.md` for what to be
> careful of.

---

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · React Router (`HashRouter`) · Supabase (Auth +
Postgres) · PowerSync.

It is one of four apps sharing one Supabase project, one `powersync` publication and one PowerSync
instance, in its own `personal_finance` schema. The others are `my_dream_clean`,
`shared_finance_ledger` and `listly`.

> 🚨 **This app's Sync Stream is `auto_subscribe: true` and outputs BARE table names** — `people`,
> `households`, `household_members`, `loans`, `salary_deductions`, `scenarios`. That is why every
> other app on the project prefixes its local table names and connects with
> `includeDefaultStreams: false`. **Changing this app's stream can break the others**, so check
> their table registries before touching it.

---

## Getting started

```bash
npm install
npm run dev
npm run build      # tsc -b && vite build
npm run lint
npm run verify     # scripts/verify.ts — spot-checks on the tax/loan/bill maths
npm run deploy     # builds and publishes dist/ to gh-pages — the LIVE site
```

`.env.local` (created **from the terminal, never from Finder** — macOS can drop the leading dot and
Vite then ignores the file silently) holds the Supabase URL and publishable key and the PowerSync
URL. The publishable key is public by design: RLS protects the data, not the key.

To install: open it in Safari and tap Share → **Add to Home Screen**.

---

## Screens

Five tabs.

- **Home** — the dashboard. Swipeable Monzo-style cards for the personal and joint accounts, the
  bills that come out of each, and loan progress rings.
- **Salary** — per person: gross annual salary, tax code, student loan plan, pay frequency,
  employer pension percentage and any number of named deductions, with a full gross-to-net
  breakdown. Savings goals and plans live here too.
- **Loans** — loans with a monthly payment and first payment date, an amortisation schedule and a
  payoff summary.
- **Bills** — personal and joint bills, with an icon per bill, a category, and the joint split.
- **What-if** — named scenarios built from actions (sell an asset, pay off a loan, a new bill, a
  new finance agreement, exclude a loan, a recurring overpayment, a salary change, a lump sum into
  savings) showing the impact on available cash and on each loan's payoff date. A sale can cascade
  across several loans in order.

Plus an **Account** modal: identity, sync status, household link codes, cloud backup and restore,
and Delete my app data.

---

## How the money maths works

**Net salary** (`src/lib/tax.ts`) — UK income tax, National Insurance, student loan plans 1/2/4/5
and postgraduate, and pension relief handled as relief-at-source, salary sacrifice or net pay, each
of which changes what tax and NI are calculated against. Deductions can be fixed or a percentage,
pre- or post-tax, and are applied in payroll order.

**Loans** (`src/lib/loans.ts`) — from a total amount, a monthly payment and a first payment date,
the app walks forward month by month (the same day each month, clamped for short months) until the
balance reaches zero. The final payment absorbs the rounding remainder.

**Bill splitting** (`src/lib/bills.ts`) — a personal bill is 100% to its owner; a joint bill tagged
`Payee = Split` is 50/50; a joint bill tagged to a person is 100% to that person even though it is
paid from the joint account.

**Scenarios** (`src/lib/scenarios.ts`) — each scenario is a list of actions, reporting the change
in available cash per month and the one-off cash moved. A lump sum toward a loan re-runs that
loan's schedule from today with the reduced balance and reports the remaining balance and months
saved.

`npm run verify` spot-checks those four against the real code — pay-frequency divisors, loan
rounding on the final payment, split percentages in both directions, scenario overflow and
cumulative merging.

---

## Sync and backup

Sign-in is required. A household is created on first sign-in; a second person joins with a link
code from the Account modal, and **"Set as me"** links a `people` row to a login.

Cloud backup is a JSON snapshot in Supabase Storage, taken opportunistically once a day at boot
plus a manual Back Up Now. **Restore is a full replace.**

`keepalive/` is a small scheduled Node script that connects to PowerSync periodically so the
Free-plan instance is not deprovisioned for inactivity. It is not part of the app bundle.

---

## Known limitations

- **Two people, one household.** The joint split model is two-way by construction.
- **Bills are monthly, on a day of the month.** There is no real frequency model — that is one of
  the things the ledger apps were built to fix.
- **There is no transaction ledger.** Balances are derived from the standing bills and loans, not
  from dated transactions, so there is no "what actually happened" record.
- **Tax constants are for one tax year** and want re-checking each April.
- **Restore is a full replace**, on every device, with no undo.

`TECHNICAL.md` has the implementation detail and the traps worth knowing before changing anything.
