# personal-f — Technical Notes

Implementation detail. README.md is user-facing.

> **Read this first.** This app is in maintenance, not development. It is the predecessor of
> `personal-ledger` / `shared-finance-ledger`, which replaced its standing-bills model with a real
> dated transaction ledger. **Keep changes here small**, and prefer doing new finance work in the
> ledger apps.

---

## 1. Shape

```
src/
  App.tsx              AuthProvider → AuthGate → AppProvider → shell + routes
  context/
    AuthContext.tsx    Supabase session state
    AppContext.tsx     The one AppData blob and every mutation
  types/models.ts      Person · Bill · Loan · Scenario · SavingsEntry · AppData
  lib/
    tax.ts             UK PAYE
    loans.ts           Amortisation
    bills.ts           Joint split rules
    scenarios.ts       What-if impact
    savings.ts         Savings goals and plans
    storage.ts         localStorage persistence (the pre-sync path)
    household.ts       Household helpers
    duplicates.ts      Same-named person left behind by a join
    backup.ts          Cloud JSON snapshots
    billIcons.ts       The built-in icon library
    supabaseClient.ts
    powersync/         connector · database · household · mapping · schema · writes
  pages/               Dashboard · Salary · Loans · Bills · Scenarios
  components/          BankCard · SwipeCards · BillsTable · BillsCategoryView ·
                       ProgressRing · SplitEditor · SwipeToDelete · PullToRefresh ·
                       CollapsibleSection · EditField · DeductionModal · IconPickerModal ·
                       AuthGate · AccountModal · LinkHouseholdModal ·
                       LegacyDataMigration · DuplicatePersonBanner
scripts/verify.ts      Spot-checks on the maths
keepalive/             A scheduled PowerSync connection (not part of the bundle)
```

**The data model is one blob**, `AppData`: `people`, `bills`, `loans`, `scenarios` and
`primaryPersonId`. `AppContext` owns every mutation; pages never write storage directly.

A `Person` carries their salary inline (`grossAnnual`, `taxCode`, `studentLoanPlan`,
`payFrequency`, `deductions[]`, `employerPensionPercent`) plus `savingsEntries[]`. **There is no
salary history** — a change overwrites, which is exactly the limitation the ledger apps' dated
`SalarySnapshot` model exists to fix.

A `Bill` is `cost` + `dueDay` (1–31) + `location` + `payee` / `payeeSharePercent` + `ownerId`.
**There is no frequency and no dated occurrence**, so nothing here materialises a transaction.

---

## 2. The app shell

`#app-shell` is sized from a JS-measured `--app-height` rather than `100dvh`, because iOS
standalone reports a stale viewport on first paint. `#app-content` is the app's only scroll
container, so route changes reset its scroll manually and `BottomNav` is `absolute` against the
shell rather than `fixed`. That whole arrangement is the origin of the identical one in the ledger
apps.

`PullToRefresh` wraps the content — this app has it; the ledger apps deliberately replaced it with
an explicit Force Sync button.

---

## 3. Sync

Supabase + PowerSync, schema `personal_finance`. Eight local tables: `people`,
`salary_deductions`, `savings_entries`, `bills`, `loans`, `scenarios`, `households`,
`household_members`.

> 🚨 **This app's stream is `auto_subscribe: true` and its output names are BARE.** Every other app
> on this Supabase project therefore prefixes its own local tables (`sfl_`, `lst_`, `lst_ref_`) and
> connects with `includeDefaultStreams: false`, because OPFS and the local database are per
> **origin** and all four apps live on `adamnc02.github.io`. **Do not rename or widen this stream
> without checking the other apps' table registries first.**

Local database file: `personal-finance.db`. It **must** stay distinct from
`shared-finance-ledger.db`, `finance-ledger-test-sync.db` and `listly.db`.

Schema conventions, which the later apps copied:

- **No `id` column is declared** — PowerSync adds it, always as `text`.
- Postgres `boolean` syncs as an integer 0/1; `jsonb` syncs as text and is parsed at the read/write
  boundary.
- `user_id` is not sent: it defaults to `auth.uid()` server-side.

`src/lib/powersync/writes.ts` applies changes to the local database, which queues them for upload;
`connector.ts` is the PowerSync ⇄ Supabase bridge.

---

## 4. Auth, households and the legacy rescue

`AuthGate` is the mandatory sign-in screen (OAuth plus email/password). `AccountModal` holds
identity, Change password, sync status, the household link code, Join with a code, cloud backup and
Delete my app data. `LinkHouseholdModal` and `DuplicatePersonBanner` handle joining and the
same-named person a join can leave behind.

`LegacyDataMigration` offers this device's pre-sign-in `localStorage` data on a first sign-in.

> 🚨 **This app's version of that component REMOVES its old key after importing and after "Start
> fresh".** `shared-finance-ledger` deliberately **did not** port that line, because its old key
> (`ledger:app-data-v2:v1`) is shared with the offline `personal-ledger` app on the same origin,
> and removing it would delete a real, unbacked-up ledger. If this component is ever changed, do
> not "helpfully" align the two.

**Cloud backup** (`lib/backup.ts`) is a JSON snapshot in Supabase Storage, uploaded
opportunistically once per app load (guarded so it fires once, not on every data edit) plus a
manual Back Up Now. Restore is a full replace.

---

## 5. The maths

- **`tax.ts`** — income tax bands, NI, student loan plans 1/2/4/5 and postgraduate, and pension
  handled as relief at source / salary sacrifice / net pay, each changing the base tax and NI are
  computed against. Deductions are ordered and applied in payroll order; they can be fixed or a
  percentage, pre- or post-tax.
- **`loans.ts`** — a flat month-by-month walk from `totalAmount` and `monthlyPayment`, same day
  each month, clamped for short months, with the final payment absorbing the remainder. **This is
  not an interest-bearing amortisation engine** — the ledger apps' `ledgerLoans.ts` is.
- **`bills.ts`** — personal 100% to the owner; joint `Payee = Split` 50/50; joint tagged to a
  person 100% to them. The joint card never shows a personal summary total.
- **`scenarios.ts`** — per-action impact on monthly available cash and on one-off cash. A
  `sell_asset` / `pay_off_loan` carries `loanAllocations[]`, an **ordered** multi-loan target that
  cascades: each loan is cleared as far as the pool allows, an omitted `amount` means "take
  whatever is left", and a set `amount` means exactly that and no more.

`scripts/verify.ts` (`npm run verify`) spot-checks all four. **Run it before and after touching
`src/lib/`.**

---

## 6. Traps

- **`personal_finance` is shared infrastructure.** Four apps, one publication, one PowerSync
  instance. A change to this app's stream or tables can silently break another app's local table
  names. Check the other registries.
- **A permanently rejected write blocks the upload queue**, which is why the connector discards
  constraint violations. A discard is a real data loss if it is not logged — the later apps added a
  visible rejected-writes list for exactly this reason.
- **There is no salary history and no dated transactions.** Anything that needs "what was true
  then" cannot be answered here. Do not build it — that is what the ledger apps are.
- **`keepalive/`** exists because a Free-plan PowerSync instance is deprovisioned for inactivity.
  If sync mysteriously stops after a quiet period, check that first.
